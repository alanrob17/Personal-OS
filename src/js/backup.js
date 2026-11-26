import {
  APP_ID,
  APP_VERSION,
  PRIORITIES,
  SUBSCRIPTION_CATEGORIES,
  SUBSCRIPTION_FREQUENCIES
} from './constants.js';
import {
  appState,
  replaceAppState,
  applyTheme,
  saveState,
  requestRender
} from './state.js';
import {
  formatDateISO,
  getTodayDate,
  isValidDateString,
  isPlainObject,
  capitalize,
  escapeHtml,
  roundClean
} from './utils.js';
import { showToast, openConfirmModal } from './ui.js';

export function exportData() {
  const todayISO = formatDateISO(getTodayDate());
  const payload = {
    app: APP_ID,
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: {
      theme: appState.settings.theme
    },
    data: {
      kanban: appState.data.kanban,
      calendar: appState.data.calendar,
      subscriptions: appState.data.subscriptions,
      goals: appState.data.goals
    }
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'personal-os-backup-' + todayISO + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

  showToast('Backup exported (' + link.download + ')', 'success');
}

/**
 * Validates an imported (or stored) JSON payload against the Personal OS schema.
 */
export function validateBackupPayload(obj) {
  if (!isPlainObject(obj)) {
    return { valid: false, error: 'The file does not contain a valid JSON object.' };
  }
  if (obj.app !== APP_ID) {
    return { valid: false, error: 'Unrecognized app identifier. Expected "' + APP_ID + '".' };
  }
  if (obj.version !== APP_VERSION) {
    return { valid: false, error: 'Unsupported backup version (' + String(obj.version) + '). Expected version ' + APP_VERSION + '.' };
  }
  if (!isPlainObject(obj.settings) || (obj.settings.theme !== 'light' && obj.settings.theme !== 'dark')) {
    return { valid: false, error: 'Backup settings are missing or contain an invalid theme value.' };
  }
  if (!isPlainObject(obj.data)) {
    return { valid: false, error: 'Backup file is missing the "data" section.' };
  }

  const d = obj.data;
  if (!Array.isArray(d.kanban) || !Array.isArray(d.calendar) || !Array.isArray(d.subscriptions) || !Array.isArray(d.goals)) {
    return { valid: false, error: 'Backup data must include kanban, calendar, subscriptions, and goals arrays.' };
  }

  const validStatuses = ['todo', 'in-progress', 'done'];

  for (let i = 0; i < d.kanban.length; i++) {
    const c = d.kanban[i];
    if (!isPlainObject(c) || typeof c.id !== 'string' || !c.id || typeof c.title !== 'string' || !c.title.trim()) {
      return { valid: false, error: 'Invalid Kanban card at entry #' + (i + 1) + '.' };
    }
    if (!validStatuses.includes(c.status)) {
      return { valid: false, error: 'Invalid Kanban column status at entry #' + (i + 1) + '.' };
    }
    if (!PRIORITIES.includes(c.priority)) {
      return { valid: false, error: 'Invalid Kanban priority at entry #' + (i + 1) + '.' };
    }
    if (c.notes !== undefined && typeof c.notes !== 'string') {
      return { valid: false, error: 'Invalid Kanban notes at entry #' + (i + 1) + '.' };
    }
    if (c.dueDate && !isValidDateString(c.dueDate)) {
      return { valid: false, error: 'Invalid Kanban due date at entry #' + (i + 1) + '.' };
    }
  }

  for (let i = 0; i < d.calendar.length; i++) {
    const ev = d.calendar[i];
    if (!isPlainObject(ev) || typeof ev.id !== 'string' || !ev.id || typeof ev.title !== 'string' || !ev.title.trim()) {
      return { valid: false, error: 'Invalid Calendar event at entry #' + (i + 1) + '.' };
    }
    if (!isValidDateString(ev.date)) {
      return { valid: false, error: 'Invalid Calendar event date at entry #' + (i + 1) + '.' };
    }
    if (ev.notes !== undefined && typeof ev.notes !== 'string') {
      return { valid: false, error: 'Invalid Calendar notes at entry #' + (i + 1) + '.' };
    }
  }

  for (let i = 0; i < d.subscriptions.length; i++) {
    const s = d.subscriptions[i];
    if (!isPlainObject(s) || typeof s.id !== 'string' || !s.id || typeof s.name !== 'string' || !s.name.trim()) {
      return { valid: false, error: 'Invalid Subscription at entry #' + (i + 1) + '.' };
    }
    if (typeof s.cost !== 'number' || !Number.isFinite(s.cost) || s.cost < 0) {
      return { valid: false, error: 'Invalid Subscription cost at entry #' + (i + 1) + '.' };
    }
    if (!SUBSCRIPTION_CATEGORIES.includes(s.category)) {
      return { valid: false, error: 'Invalid Subscription category at entry #' + (i + 1) + '.' };
    }
    if (!SUBSCRIPTION_FREQUENCIES.includes(s.frequency)) {
      return { valid: false, error: 'Invalid Subscription frequency at entry #' + (i + 1) + '.' };
    }
    if (!isValidDateString(s.startDate)) {
      return { valid: false, error: 'Invalid Subscription start date at entry #' + (i + 1) + '.' };
    }
    if (s.endDate && (!isValidDateString(s.endDate) || s.endDate < s.startDate)) {
      return { valid: false, error: 'Invalid Subscription end date at entry #' + (i + 1) + '.' };
    }
    if (s.notes !== undefined && typeof s.notes !== 'string') {
      return { valid: false, error: 'Invalid Subscription notes at entry #' + (i + 1) + '.' };
    }
  }

  for (let i = 0; i < d.goals.length; i++) {
    const g = d.goals[i];
    if (!isPlainObject(g) || typeof g.id !== 'string' || !g.id || typeof g.title !== 'string' || !g.title.trim()) {
      return { valid: false, error: 'Invalid Goal at entry #' + (i + 1) + '.' };
    }
    if (typeof g.target !== 'number' || !Number.isFinite(g.target) || g.target <= 0) {
      return { valid: false, error: 'Invalid Goal target at entry #' + (i + 1) + '.' };
    }
    if (typeof g.current !== 'number' || !Number.isFinite(g.current) || g.current < 0) {
      return { valid: false, error: 'Invalid Goal current progress at entry #' + (i + 1) + '.' };
    }
    if (g.deadline && !isValidDateString(g.deadline)) {
      return { valid: false, error: 'Invalid Goal deadline at entry #' + (i + 1) + '.' };
    }
  }

  return { valid: true };
}

export function handleImportFile(file) {
  if (!file) return;
  const reader = new FileReader();

  reader.onerror = function () {
    openConfirmModal({
      title: 'Import Failed',
      message: 'Could not read the selected file. Your existing data has not been changed.',
      alertOnly: true
    });
  };

  reader.onload = function () {
    let parsed;
    try {
      parsed = JSON.parse(String(reader.result));
    } catch (err) {
      openConfirmModal({
        title: 'Invalid Backup File',
        message: 'The selected file is not valid JSON. Your existing data has been left unchanged.',
        alertOnly: true
      });
      return;
    }

    const check = validateBackupPayload(parsed);
    if (!check.valid) {
      openConfirmModal({
        title: 'Invalid Backup File',
        message: check.error + ' Your existing data has been left unchanged.',
        alertOnly: true
      });
      return;
    }

    const exportedText = parsed.exportedAt
      ? new Date(parsed.exportedAt).toLocaleString()
      : 'Unknown date';

    const detailsHtml =
      '<strong>Backup contents:</strong><br>' +
      '• Kanban cards: ' + parsed.data.kanban.length + '<br>' +
      '• Calendar events: ' + parsed.data.calendar.length + '<br>' +
      '• Subscriptions: ' + parsed.data.subscriptions.length + '<br>' +
      '• Goals: ' + parsed.data.goals.length + '<br>' +
      '• Theme: ' + capitalize(parsed.settings.theme) + '<br>' +
      '• Exported: ' + escapeHtml(exportedText);

    openConfirmModal({
      title: 'Replace Existing Data?',
      message: 'This backup file is valid. Importing it will permanently replace all current dashboard data and settings.',
      detailsHtml: detailsHtml,
      confirmLabel: 'Import & Replace',
      danger: true,
      onConfirm: function () {
        // Deep-normalize imported records cleanly
        replaceAppState({
          settings: {
            theme: parsed.settings.theme
          },
          data: {
            kanban: parsed.data.kanban.map(function (c) {
              return {
                id: c.id,
                title: c.title.trim(),
                notes: c.notes || '',
                priority: c.priority,
                dueDate: c.dueDate || '',
                status: c.status
              };
            }),
            calendar: parsed.data.calendar.map(function (ev) {
              return {
                id: ev.id,
                title: ev.title.trim(),
                date: ev.date,
                notes: ev.notes || ''
              };
            }),
            subscriptions: parsed.data.subscriptions.map(function (s) {
              return {
                id: s.id,
                name: s.name.trim(),
                cost: Math.round(s.cost * 100) / 100,
                category: s.category,
                startDate: s.startDate,
                frequency: s.frequency,
                endDate: s.endDate || '',
                notes: s.notes || ''
              };
            }),
            goals: parsed.data.goals.map(function (g) {
              return {
                id: g.id,
                title: g.title.trim(),
                target: roundClean(g.target),
                current: roundClean(g.current),
                deadline: g.deadline || ''
              };
            })
          }
        });

        applyTheme(appState.settings.theme);
        saveState();
        requestRender();
        showToast('Backup restored successfully', 'success');
      }
    });
  };

  reader.readAsText(file);
}
