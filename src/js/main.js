import { ICONS } from './constants.js';
import {
  appState,
  uiState,
  isTauriRuntime,
  getStorageInfo,
  loadState,
  applyTheme,
  toggleTheme,
  setRenderHandler,
  setNavigateHandler,
  setStorageErrorHandler
} from './state.js';
import {
  escapeHtml,
  getTodayDate,
  formatDateISO,
  parseLocalDate,
  diffDays,
  getDueDateInfo,
  calculateSubscriptionRenewal
} from './utils.js';
import {
  showToast,
  closeFormModal,
  closeConfirmModal,
  initModals,
  initSearch
} from './ui.js';
import { exportData, validateBackupPayload, handleImportFile } from './backup.js';
import { renderDashboard } from './views/dashboard.js';
import { renderKanban, openKanbanModal } from './views/kanban.js';
import { renderCalendar, openCalendarModal } from './views/calendar.js';
import { renderSubscriptions, openSubscriptionModal } from './views/subscriptions.js';
import { renderGoals, openGoalModal } from './views/goals.js';

function openMobileSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('open');
}

function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

function renderHeader() {
  const titleEl = document.getElementById('topbarTitle');
  const subEl = document.getElementById('topbarSubtitle');
  const ctaBtn = document.getElementById('topbarPrimaryBtn');

  const todayFull = getTodayDate().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  const viewConfig = {
    dashboard: {
      title: 'Dashboard',
      subtitle: todayFull,
      ctaLabel: 'New Task',
      ctaAction: function () { openKanbanModal(null, 'todo'); }
    },
    kanban: {
      title: 'Kanban',
      subtitle: 'Manage all actionable items',
      ctaLabel: 'New Card',
      ctaAction: function () { openKanbanModal(null, 'todo'); }
    },
    calendar: {
      title: 'Calendar',
      subtitle: 'Date-based commitments & events',
      ctaLabel: 'New Event',
      ctaAction: function () { openCalendarModal(null, uiState.calendarSelectedDate || formatDateISO(getTodayDate())); }
    },
    subscriptions: {
      title: 'Subscriptions',
      subtitle: 'Recurring commitments & renewals',
      ctaLabel: 'Add Subscription',
      ctaAction: function () { openSubscriptionModal(null); }
    },
    goals: {
      title: 'Goals',
      subtitle: 'Measurable progress toward objectives',
      ctaLabel: 'New Goal',
      ctaAction: function () { openGoalModal(null); }
    }
  };

  const cfg = viewConfig[uiState.activeView] || viewConfig.dashboard;
  titleEl.textContent = cfg.title;
  subEl.textContent = cfg.subtitle;
  ctaBtn.innerHTML = ICONS.plus + '<span>' + escapeHtml(cfg.ctaLabel) + '</span>';
  ctaBtn.onclick = cfg.ctaAction;
}

function renderSidebarBadges() {
  const today = getTodayDate();

  // Kanban badge: show overdue count in alert style, else active task count
  const activeCards = appState.data.kanban.filter(function (c) { return c.status !== 'done'; });
  const overdueCount = activeCards.filter(function (c) {
    const info = getDueDateInfo(c.dueDate, false);
    return info && info.state === 'overdue';
  }).length;
  const kbBadge = document.getElementById('navBadgeKanban');
  if (overdueCount > 0) {
    kbBadge.textContent = overdueCount + ' overdue';
    kbBadge.className = 'nav-badge alert';
  } else if (activeCards.length > 0) {
    kbBadge.textContent = String(activeCards.length);
    kbBadge.className = 'nav-badge';
  } else {
    kbBadge.textContent = '';
    kbBadge.className = 'nav-badge';
  }

  // Calendar badge: upcoming events count
  const upcomingEvents = appState.data.calendar.filter(function (ev) {
    const d = parseLocalDate(ev.date);
    return d && diffDays(today, d) >= 0;
  }).length;
  const calBadge = document.getElementById('navBadgeCalendar');
  calBadge.textContent = upcomingEvents > 0 ? String(upcomingEvents) : '';
  calBadge.className = 'nav-badge';

  // Subscriptions badge: highlight if renewing within 30 days
  const renewingSoonCount = appState.data.subscriptions.filter(function (sub) {
    return calculateSubscriptionRenewal(sub).renewingSoon;
  }).length;
  const subBadge = document.getElementById('navBadgeSubscriptions');
  if (renewingSoonCount > 0) {
    subBadge.textContent = renewingSoonCount + ' soon';
    subBadge.className = 'nav-badge warn';
  } else if (appState.data.subscriptions.length > 0) {
    subBadge.textContent = String(appState.data.subscriptions.length);
    subBadge.className = 'nav-badge';
  } else {
    subBadge.textContent = '';
    subBadge.className = 'nav-badge';
  }

  // Goals badge: active goals count
  const activeGoalsCount = appState.data.goals.filter(function (g) { return g.current < g.target; }).length;
  const goalBadge = document.getElementById('navBadgeGoals');
  goalBadge.textContent = activeGoalsCount > 0 ? String(activeGoalsCount) : '';
  goalBadge.className = 'nav-badge';
}

function render() {
  renderHeader();
  renderSidebarBadges();

  const root = document.getElementById('viewRoot');
  switch (uiState.activeView) {
    case 'dashboard': renderDashboard(root); break;
    case 'kanban': renderKanban(root); break;
    case 'calendar': renderCalendar(root); break;
    case 'subscriptions': renderSubscriptions(root); break;
    case 'goals': renderGoals(root); break;
    default: renderDashboard(root);
  }
}

function setActiveView(view, options) {
  uiState.activeView = view;
  closeMobileSidebar();

  document.querySelectorAll('#sidebarNav .nav-item').forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  render();

  if (options && options.highlightSelector) {
    requestAnimationFrame(function () {
      const target = document.querySelector(options.highlightSelector);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.remove('flash-highlight');
        void target.offsetWidth;
        target.classList.add('flash-highlight');
      }
    });
  }
}

function initEventListeners() {
  // Sidebar navigation
  document.querySelectorAll('#sidebarNav .nav-item').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setActiveView(btn.dataset.view);
    });
  });

  // Mobile sidebar controls
  document.getElementById('mobileMenuBtn').addEventListener('click', openMobileSidebar);
  document.getElementById('sidebarOverlay').addEventListener('click', closeMobileSidebar);

  // Theme toggle
  document.getElementById('themeToggleBtn').addEventListener('click', toggleTheme);

  // Export & Import
  document.getElementById('btnExportData').addEventListener('click', exportData);
  const fileInput = document.getElementById('importFileInput');
  document.getElementById('btnImportData').addEventListener('click', function () {
    fileInput.value = '';
    fileInput.click();
  });
  fileInput.addEventListener('change', function (e) {
    if (e.target.files && e.target.files[0]) {
      handleImportFile(e.target.files[0]);
    }
    fileInput.value = '';
  });

  // Global keyboard shortcuts (Ctrl+K / Cmd+K for search, Escape for modals)
  const searchInput = document.getElementById('globalSearchInput');
  const searchDropdown = document.getElementById('searchDropdown');

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }

    if (e.key === 'Escape') {
      if (document.getElementById('confirmModalBackdrop').classList.contains('open')) {
        closeConfirmModal();
      } else if (document.getElementById('formModalBackdrop').classList.contains('open')) {
        closeFormModal();
      } else if (searchDropdown.classList.contains('open')) {
        searchDropdown.classList.remove('open');
      }
    }
  });
}

async function init() {
  setRenderHandler(render);
  setNavigateHandler(setActiveView);
  setStorageErrorHandler(function (msg) {
    showToast(msg, 'error');
  });

  await loadState(validateBackupPayload);
  applyTheme(appState.settings.theme);
  initModals();
  initSearch();
  initEventListeners();
  render();

  if (isTauriRuntime()) {
    getStorageInfo()
      .then(function (info) {
        const badge = document.querySelector('.sidebar-footer .backup-title span:last-child');
        if (badge && info && info.backend === 'sqlite') {
          badge.textContent = 'SQLite';
          if (info.path) {
            badge.title = 'Database: ' + info.path;
          }
        }
      })
      .catch(function () {});
  }
}

init();
