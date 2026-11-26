import { ICONS } from '../constants.js';
import { appState, uiState, saveState, requestRender } from '../state.js';
import {
  escapeHtml,
  generateId,
  roundClean,
  formatNumber,
  isValidDateString,
  formatDisplayDate,
  getDueDateInfo,
  getGoalSmartStep
} from '../utils.js';
import {
  openFormModal,
  setFormModalError,
  closeFormModal,
  openConfirmModal,
  showToast
} from '../ui.js';

export function updateGoalProgress(goalId, delta) {
  const goal = appState.data.goals.find(function (g) { return g.id === goalId; });
  if (!goal || !Number.isFinite(delta)) return;

  const wasCompleted = goal.current >= goal.target;
  goal.current = Math.max(0, roundClean(goal.current + delta));
  const isNowCompleted = goal.current >= goal.target;

  saveState();
  requestRender();

  if (!wasCompleted && isNowCompleted) {
    showToast('Goal completed: "' + goal.title + '"!', 'success');
  }
}

export function renderGoals(root) {
  const filter = uiState.goalFilter;
  const allGoals = appState.data.goals;
  const completedCount = allGoals.filter(function (g) { return g.current >= g.target; }).length;
  const activeCount = allGoals.length - completedCount;

  const visible = allGoals.filter(function (g) {
    if (filter === 'active') return g.current < g.target;
    if (filter === 'completed') return g.current >= g.target;
    return true;
  });

  let html =
    '<div class="section-toolbar">' +
      '<div class="filter-pills" role="group" aria-label="Filter goals">' +
        '<button class="filter-pill' + (filter === 'all' ? ' active' : '') + '" data-goal-filter="all">All (' + allGoals.length + ')</button>' +
        '<button class="filter-pill' + (filter === 'active' ? ' active' : '') + '" data-goal-filter="active">Active (' + activeCount + ')</button>' +
        '<button class="filter-pill' + (filter === 'completed' ? ' active' : '') + '" data-goal-filter="completed">Completed (' + completedCount + ')</button>' +
      '</div>' +
      '<span style="font-size:12.5px;color:var(--text-muted)">Use inline controls to update progress directly</span>' +
    '</div>';

  if (visible.length === 0) {
    html +=
      '<section class="panel"><div class="empty-state" style="padding:44px 16px">' +
        '<div class="empty-state-icon">' + ICONS.target + '</div>' +
        '<div class="empty-state-title">' + (allGoals.length === 0 ? 'No goals yet' : 'No goals match this filter') + '</div>' +
        '<div class="empty-state-desc">Set measurable targets like reading 24 books, saving $5,000, or running 200 km.</div>' +
        (allGoals.length === 0
          ? '<button class="btn btn-primary btn-sm" id="goalEmptyAddBtn">' + ICONS.plus + 'Create Goal</button>'
          : ''
        ) +
      '</div></section>';
  } else {
    html += '<div class="goals-grid">';
    visible.forEach(function (goal) {
      const pct = Math.min(100, Math.round((goal.current / goal.target) * 100));
      const remaining = Math.max(0, roundClean(goal.target - goal.current));
      const isCompleted = goal.current >= goal.target;
      const deadlineInfo = goal.deadline ? getDueDateInfo(goal.deadline, isCompleted) : null;
      const smartStep = getGoalSmartStep(goal.target);

      html +=
        '<article class="goal-card' + (isCompleted ? ' is-completed' : '') + '" data-goal-id="' + goal.id + '">' +
          '<div class="goal-card-header">' +
            '<div class="goal-title-wrap">' +
              '<h3 class="goal-title">' + escapeHtml(goal.title) + '</h3>' +
              '<div class="goal-meta-row">' +
                (isCompleted ? '<span class="badge badge-done">' + ICONS.check + 'Completed</span>' : '') +
                (deadlineInfo
                  ? '<span class="badge ' + deadlineInfo.badgeClass + '">' + ICONS.clock + 'Deadline: ' + formatDisplayDate(goal.deadline, true) +
                    (!isCompleted && deadlineInfo.delta < 0 ? ' (Overdue)' : '') +
                    (!isCompleted && deadlineInfo.delta === 0 ? ' (Today)' : '') +
                    '</span>'
                  : ''
                ) +
              '</div>' +
            '</div>' +
            '<div style="display:flex;gap:2px;flex-shrink:0">' +
              '<button class="icon-action" data-edit-goal="' + goal.id + '" title="Edit goal" aria-label="Edit goal">' + ICONS.edit + '</button>' +
              '<button class="icon-action delete" data-delete-goal="' + goal.id + '" title="Delete goal" aria-label="Delete goal">' + ICONS.trash + '</button>' +
            '</div>' +
          '</div>' +

          '<div class="goal-progress-wrap">' +
            '<div class="goal-progress-head">' +
              '<span>Progress</span>' +
              '<span style="font-weight:700;color:' + (isCompleted ? 'var(--success)' : 'var(--text-primary)') + '">' + pct + '%</span>' +
            '</div>' +
            '<div class="progress-track" style="height:9px">' +
              '<div class="progress-fill' + (isCompleted ? ' completed' : '') + '" style="width:' + pct + '%"></div>' +
            '</div>' +
          '</div>' +

          '<div class="goal-numbers">' +
            '<div class="goal-num-item">' +
              '<span class="goal-num-label">Current</span>' +
              '<span class="goal-num-val">' + formatNumber(goal.current) + '</span>' +
            '</div>' +
            '<div class="goal-num-item">' +
              '<span class="goal-num-label">Target</span>' +
              '<span class="goal-num-val">' + formatNumber(goal.target) + '</span>' +
            '</div>' +
            '<div class="goal-num-item">' +
              '<span class="goal-num-label">Remaining</span>' +
              '<span class="goal-num-val" style="color:' + (isCompleted ? 'var(--success)' : 'var(--text-primary)') + '">' + formatNumber(remaining) + '</span>' +
            '</div>' +
          '</div>' +

          '<div class="goal-quick-controls">' +
            '<div class="goal-step-btns">' +
              '<button type="button" class="btn-step" data-goal-step="' + goal.id + '" data-delta="-1" title="Decrease by 1">-1</button>' +
              '<button type="button" class="btn-step" data-goal-step="' + goal.id + '" data-delta="1" title="Increase by 1">+1</button>' +
              (smartStep ? '<button type="button" class="btn-step" data-goal-step="' + goal.id + '" data-delta="' + smartStep + '" title="Increase by ' + smartStep + '">+' + smartStep + '</button>' : '') +
            '</div>' +
            '<form class="goal-custom-add" data-goal-delta-form="' + goal.id + '">' +
              '<input type="number" step="any" class="goal-delta-input" placeholder="+/- amt" aria-label="Custom progress adjustment for ' + escapeHtml(goal.title) + '">' +
              '<button type="submit" class="btn btn-secondary btn-sm">Update</button>' +
            '</form>' +
          '</div>' +
        '</article>';
    });
    html += '</div>';
  }

  root.innerHTML = html;

  // Bind Goals events
  root.querySelectorAll('[data-goal-filter]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      uiState.goalFilter = btn.dataset.goalFilter;
      renderGoals(root);
    });
  });

  root.querySelectorAll('[data-goal-step]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      updateGoalProgress(btn.dataset.goalStep, Number(btn.dataset.delta));
    });
  });

  root.querySelectorAll('[data-goal-delta-form]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const input = form.querySelector('input');
      const raw = input.value.trim();
      if (raw === '') return;
      const delta = Number(raw);
      if (!Number.isFinite(delta) || delta === 0) return;
      updateGoalProgress(form.dataset.goalDeltaForm, delta);
    });
  });

  root.querySelectorAll('[data-edit-goal]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const goal = appState.data.goals.find(function (g) { return g.id === btn.dataset.editGoal; });
      if (goal) openGoalModal(goal);
    });
  });

  root.querySelectorAll('[data-delete-goal]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const goal = appState.data.goals.find(function (g) { return g.id === btn.dataset.deleteGoal; });
      if (!goal) return;
      openConfirmModal({
        title: 'Delete Goal',
        message: 'Are you sure you want to delete "' + goal.title + '"? This action cannot be undone.',
        confirmLabel: 'Delete',
        danger: true,
        onConfirm: function () {
          appState.data.goals = appState.data.goals.filter(function (g) { return g.id !== goal.id; });
          saveState();
          requestRender();
          showToast('Goal deleted', 'info');
        }
      });
    });
  });

  const emptyBtn = document.getElementById('goalEmptyAddBtn');
  if (emptyBtn) emptyBtn.addEventListener('click', function () { openGoalModal(null); });
}

export function openGoalModal(goal) {
  const isEdit = Boolean(goal);

  const bodyHtml =
    '<div class="form-field">' +
      '<label class="form-label" for="goalTitle">Goal Title <span class="req">*</span></label>' +
      '<input id="goalTitle" class="form-input" type="text" maxlength="140" value="' + escapeHtml(isEdit ? goal.title : '') + '" placeholder="e.g., Read 24 books, Save $10,000">' +
    '</div>' +
    '<div class="form-row">' +
      '<div class="form-field">' +
        '<label class="form-label" for="goalTarget">Target Value <span class="req">*</span></label>' +
        '<input id="goalTarget" class="form-input" type="number" step="any" min="0.01" value="' + (isEdit ? escapeHtml(goal.target) : '') + '" placeholder="e.g., 24">' +
      '</div>' +
      '<div class="form-field">' +
        '<label class="form-label" for="goalCurrent">Current Progress</label>' +
        '<input id="goalCurrent" class="form-input" type="number" step="any" min="0" value="' + (isEdit ? escapeHtml(goal.current) : '0') + '">' +
      '</div>' +
    '</div>' +
    '<div class="form-field">' +
      '<label class="form-label" for="goalDeadline">Deadline (optional)</label>' +
      '<input id="goalDeadline" class="form-input" type="date" value="' + escapeHtml(isEdit ? (goal.deadline || '') : '') + '">' +
    '</div>';

  openFormModal({
    title: isEdit ? 'Edit Goal' : 'New Goal',
    submitLabel: isEdit ? 'Save Changes' : 'Create Goal',
    bodyHtml: bodyHtml,
    onSubmit: function () {
      const title = document.getElementById('goalTitle').value.trim();
      const targetRaw = document.getElementById('goalTarget').value.trim();
      const currentRaw = document.getElementById('goalCurrent').value.trim();
      const deadline = document.getElementById('goalDeadline').value.trim();

      const target = Number(targetRaw);
      const current = currentRaw === '' ? 0 : Number(currentRaw);

      if (!title) {
        setFormModalError('Please enter a goal title.');
        return;
      }
      if (targetRaw === '' || !Number.isFinite(target) || target <= 0) {
        setFormModalError('Target value must be a number greater than 0.');
        return;
      }
      if (!Number.isFinite(current) || current < 0) {
        setFormModalError('Current progress must be 0 or greater.');
        return;
      }
      if (deadline && !isValidDateString(deadline)) {
        setFormModalError('Please enter a valid deadline date.');
        return;
      }

      if (isEdit) {
        goal.title = title;
        goal.target = roundClean(target);
        goal.current = roundClean(current);
        goal.deadline = deadline;
        showToast('Goal updated', 'success');
      } else {
        appState.data.goals.push({
          id: generateId(),
          title: title,
          target: roundClean(target),
          current: roundClean(current),
          deadline: deadline
        });
        showToast('Goal created', 'success');
      }

      saveState();
      closeFormModal();
      requestRender();
    }
  });
}
