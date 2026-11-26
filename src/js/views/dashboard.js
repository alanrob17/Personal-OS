import { ICONS } from '../constants.js';
import { appState, saveState, requestRender, navigateTo } from '../state.js';
import {
  escapeHtml,
  capitalize,
  roundClean,
  formatCurrency,
  formatNumber,
  getTodayDate,
  formatDateISO,
  parseLocalDate,
  diffDays,
  formatDisplayDate,
  formatRelativeDays,
  getDueDateInfo,
  calculateSubscriptionRenewal,
  getTotalMonthlySubscriptionCost
} from '../utils.js';
import { showToast } from '../ui.js';
import { openKanbanModal } from './kanban.js';
import { openCalendarModal } from './calendar.js';
import { openSubscriptionModal } from './subscriptions.js';
import { openGoalModal, updateGoalProgress } from './goals.js';

export function renderDashboard(root) {
  const today = getTodayDate();

  // Metrics
  const todoCards = appState.data.kanban.filter(function (c) { return c.status === 'todo'; });
  const progressCards = appState.data.kanban.filter(function (c) { return c.status === 'in-progress'; });
  const doneCards = appState.data.kanban.filter(function (c) { return c.status === 'done'; });
  const activeCards = todoCards.concat(progressCards);

  const upcomingEvents = appState.data.calendar
    .map(function (ev) {
      const d = parseLocalDate(ev.date);
      return { event: ev, date: d, delta: d ? diffDays(today, d) : -9999 };
    })
    .filter(function (item) { return item.date && item.delta >= 0; })
    .sort(function (a, b) {
      if (a.delta !== b.delta) return a.delta - b.delta;
      return a.event.title.localeCompare(b.event.title);
    });

  const activeGoals = appState.data.goals.filter(function (g) { return g.current < g.target; });
  const completedGoalsCount = appState.data.goals.length - activeGoals.length;

  const monthlyCost = getTotalMonthlySubscriptionCost(appState.data.subscriptions);
  const activeSubsCount = appState.data.subscriptions.filter(function (s) {
    return calculateSubscriptionRenewal(s).active;
  }).length;

  // Actionable due & overdue Kanban items (overdue, due today, or due within 7 days)
  const attentionTasks = activeCards
    .map(function (card) {
      return { card: card, due: getDueDateInfo(card.dueDate, false) };
    })
    .filter(function (item) {
      return item.due && item.due.delta <= 7;
    })
    .sort(function (a, b) {
      if (a.due.delta !== b.due.delta) return a.due.delta - b.due.delta;
      const pOrder = { high: 0, medium: 1, low: 2 };
      return pOrder[a.card.priority] - pOrder[b.card.priority];
    });

  const overdueCount = attentionTasks.filter(function (t) { return t.due.state === 'overdue'; }).length;
  const dueTodayCount = attentionTasks.filter(function (t) { return t.due.state === 'today'; }).length;

  // Upcoming subscription renewals (within next 30 days)
  const upcomingRenewals = appState.data.subscriptions
    .map(function (sub) {
      return { sub: sub, renewal: calculateSubscriptionRenewal(sub) };
    })
    .filter(function (item) { return item.renewal.renewingSoon; })
    .sort(function (a, b) { return a.renewal.daysUntil - b.renewal.daysUntil; });

  // Kanban summary percentages
  const totalCards = appState.data.kanban.length;
  const todoPct = totalCards ? (todoCards.length / totalCards) * 100 : 0;
  const progPct = totalCards ? (progressCards.length / totalCards) * 100 : 0;
  const donePct = totalCards ? (doneCards.length / totalCards) * 100 : 0;
  const highPriorityActive = activeCards.filter(function (c) { return c.priority === 'high'; }).length;

  // Sort goals for dashboard overview: active first (by closest deadline or highest % progress), then completed
  const dashboardGoals = appState.data.goals.slice().sort(function (a, b) {
    const aDone = a.current >= a.target ? 1 : 0;
    const bDone = b.current >= b.target ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return (b.current / b.target) - (a.current / a.target);
  });

  let html = '';

  // Quick-glance KPI row
  html += '<section class="kpi-grid" aria-label="Quick overview">';
  html +=
    '<button class="kpi-card" data-jump="kanban">' +
      '<div class="kpi-meta">' +
        '<div class="kpi-label">Active Tasks</div>' +
        '<div class="kpi-value">' + activeCards.length + '</div>' +
        '<div class="kpi-sub">' + (overdueCount > 0 ? overdueCount + ' overdue' : (dueTodayCount > 0 ? dueTodayCount + ' due today' : 'On track')) + '</div>' +
      '</div>' +
      '<div class="kpi-icon blue">' + ICONS.kanban + '</div>' +
    '</button>';

  html +=
    '<button class="kpi-card" data-jump="calendar">' +
      '<div class="kpi-meta">' +
        '<div class="kpi-label">Upcoming Events</div>' +
        '<div class="kpi-value">' + upcomingEvents.length + '</div>' +
        '<div class="kpi-sub">' + (upcomingEvents.length > 0 ? 'Next: ' + formatRelativeDays(upcomingEvents[0].delta) : 'Nothing scheduled') + '</div>' +
      '</div>' +
      '<div class="kpi-icon purple">' + ICONS.calendar + '</div>' +
    '</button>';

  html +=
    '<button class="kpi-card" data-jump="goals">' +
      '<div class="kpi-meta">' +
        '<div class="kpi-label">Active Goals</div>' +
        '<div class="kpi-value">' + activeGoals.length + '</div>' +
        '<div class="kpi-sub">' + completedGoalsCount + ' completed</div>' +
      '</div>' +
      '<div class="kpi-icon green">' + ICONS.target + '</div>' +
    '</button>';

  html +=
    '<button class="kpi-card" data-jump="subscriptions">' +
      '<div class="kpi-meta">' +
        '<div class="kpi-label">Monthly Subscriptions</div>' +
        '<div class="kpi-value">' + formatCurrency(monthlyCost) + '</div>' +
        '<div class="kpi-sub">' + activeSubsCount + ' active · ' + upcomingRenewals.length + ' renewing soon</div>' +
      '</div>' +
      '<div class="kpi-icon amber">' + ICONS.repeat + '</div>' +
    '</button>';
  html += '</section>';

  // Main 2-column actionable layout
  html += '<div class="dashboard-grid">';

  // LEFT COLUMN
  html += '<div class="dashboard-col">';

  // 1. Due & Overdue Kanban Items
  html += '<section class="panel">';
  html +=
    '<div class="panel-header">' +
      '<div class="panel-title-group">' +
        '<h2 class="panel-title">Due &amp; Overdue Tasks</h2>' +
        '<span class="panel-count">' + attentionTasks.length + '</span>' +
      '</div>' +
      '<button class="panel-link" data-jump="kanban">Open Kanban</button>' +
    '</div>';
  html += '<div class="panel-body">';
  if (attentionTasks.length === 0) {
    html +=
      '<div class="empty-state">' +
        '<div class="empty-state-icon">' + ICONS.check + '</div>' +
        '<div class="empty-state-title">No urgent deadlines</div>' +
        '<div class="empty-state-desc">No overdue tasks or items due within the next 7 days.</div>' +
      '</div>';
  } else {
    html += '<div class="action-list">';
    attentionTasks.forEach(function (item) {
      const c = item.card;
      const colLabel = c.status === 'in-progress' ? 'In Progress' : 'To Do';
      html +=
        '<div class="action-row">' +
          '<button class="quick-check" data-dash-complete-card="' + c.id + '" title="Mark as Done" aria-label="Mark ' + escapeHtml(c.title) + ' as done">' + ICONS.check + '</button>' +
          '<div class="action-row-main" data-dash-edit-card="' + c.id + '">' +
            '<div class="action-row-title">' + escapeHtml(c.title) + '</div>' +
            '<div class="action-row-sub">' + colLabel + (c.notes ? ' · ' + escapeHtml(c.notes) : '') + '</div>' +
          '</div>' +
          '<div class="action-row-right">' +
            '<span class="badge badge-' + c.priority + '">' + capitalize(c.priority) + '</span>' +
            '<span class="badge ' + item.due.badgeClass + '">' + escapeHtml(item.due.label) + '</span>' +
          '</div>' +
        '</div>';
    });
    html += '</div>';
  }
  html += '</div></section>';

  // 2. Goal Progress Overview
  html += '<section class="panel">';
  html +=
    '<div class="panel-header">' +
      '<div class="panel-title-group">' +
        '<h2 class="panel-title">Goal Progress Overview</h2>' +
        '<span class="panel-count">' + appState.data.goals.length + '</span>' +
      '</div>' +
      '<button class="panel-link" data-jump="goals">Manage Goals</button>' +
    '</div>';
  html += '<div class="panel-body">';
  if (dashboardGoals.length === 0) {
    html +=
      '<div class="empty-state">' +
        '<div class="empty-state-icon">' + ICONS.target + '</div>' +
        '<div class="empty-state-title">No goals set yet</div>' +
        '<div class="empty-state-desc">Track measurable milestones toward your long-term objectives.</div>' +
        '<button class="btn btn-secondary btn-sm" id="dashAddGoalBtn">' + ICONS.plus + 'Add Goal</button>' +
      '</div>';
  } else {
    dashboardGoals.slice(0, 5).forEach(function (goal) {
      const pct = Math.min(100, Math.round((goal.current / goal.target) * 100));
      const remaining = Math.max(0, roundClean(goal.target - goal.current));
      const isCompleted = goal.current >= goal.target;
      html +=
        '<div class="dash-goal-item">' +
          '<div class="dash-goal-top">' +
            '<div class="dash-goal-title" data-dash-edit-goal="' + goal.id + '">' + escapeHtml(goal.title) + '</div>' +
            '<div class="dash-goal-stats">' +
              '<span>' + formatNumber(goal.current) + ' / ' + formatNumber(goal.target) + '</span>' +
              (isCompleted
                ? '<span class="badge badge-done">Completed</span>'
                : '<span>' + formatNumber(remaining) + ' left</span>' +
                  '<button class="btn-step" data-quick-goal-id="' + goal.id + '" data-quick-goal-delta="1" title="Add 1 to progress">+1</button>'
              ) +
            '</div>' +
          '</div>' +
          '<div class="progress-track">' +
            '<div class="progress-fill' + (isCompleted ? ' completed' : '') + '" style="width:' + pct + '%"></div>' +
          '</div>' +
        '</div>';
    });
  }
  html += '</div></section>';

  // 3. Kanban Summary
  html += '<section class="panel">';
  html +=
    '<div class="panel-header">' +
      '<div class="panel-title-group">' +
        '<h2 class="panel-title">Kanban Summary</h2>' +
        (highPriorityActive > 0 ? '<span class="badge badge-high">' + highPriorityActive + ' High Priority</span>' : '') +
      '</div>' +
      '<button class="panel-link" data-jump="kanban">View Board</button>' +
    '</div>';
  html += '<div class="panel-body">';
  html +=
    '<div class="kanban-summary-bar" title="Board distribution">' +
      '<div class="ks-seg-todo" style="width:' + todoPct + '%"></div>' +
      '<div class="ks-seg-progress" style="width:' + progPct + '%"></div>' +
      '<div class="ks-seg-done" style="width:' + donePct + '%"></div>' +
    '</div>';
  html +=
    '<div class="kanban-summary-cols">' +
      '<div class="ks-stat" data-jump="kanban">' +
        '<div class="ks-stat-head"><span class="ks-dot" style="background:var(--text-muted)"></span>To Do</div>' +
        '<div class="ks-stat-num">' + todoCards.length + '</div>' +
      '</div>' +
      '<div class="ks-stat" data-jump="kanban">' +
        '<div class="ks-stat-head"><span class="ks-dot" style="background:var(--accent)"></span>In Progress</div>' +
        '<div class="ks-stat-num">' + progressCards.length + '</div>' +
      '</div>' +
      '<div class="ks-stat" data-jump="kanban">' +
        '<div class="ks-stat-head"><span class="ks-dot" style="background:var(--success)"></span>Done</div>' +
        '<div class="ks-stat-num">' + doneCards.length + '</div>' +
      '</div>' +
    '</div>';
  html += '</div></section>';

  html += '</div>'; // end left col

  // RIGHT COLUMN
  html += '<div class="dashboard-col">';

  // 4. Upcoming Events
  html += '<section class="panel">';
  html +=
    '<div class="panel-header">' +
      '<div class="panel-title-group">' +
        '<h2 class="panel-title">Upcoming Events</h2>' +
        '<span class="panel-count">' + upcomingEvents.length + '</span>' +
      '</div>' +
      '<button class="panel-link" data-jump="calendar">Open Calendar</button>' +
    '</div>';
  html += '<div class="panel-body">';
  if (upcomingEvents.length === 0) {
    html +=
      '<div class="empty-state">' +
        '<div class="empty-state-icon">' + ICONS.calendar + '</div>' +
        '<div class="empty-state-title">No upcoming events</div>' +
        '<div class="empty-state-desc">Add appointments, birthdays, holidays, or scheduled events.</div>' +
        '<button class="btn btn-secondary btn-sm" id="dashAddEventBtn">' + ICONS.plus + 'Add Event</button>' +
      '</div>';
  } else {
    html += '<div class="action-list">';
    upcomingEvents.slice(0, 7).forEach(function (item) {
      const ev = item.event;
      const badgeClass = item.delta === 0 ? 'badge-today' : 'badge-upcoming';
      html +=
        '<div class="action-row">' +
          '<div class="action-row-main" data-dash-edit-event="' + ev.id + '">' +
            '<div class="action-row-title">' + escapeHtml(ev.title) + '</div>' +
            '<div class="action-row-sub">' + formatDisplayDate(item.date) + (ev.notes ? ' · ' + escapeHtml(ev.notes) : '') + '</div>' +
          '</div>' +
          '<div class="action-row-right">' +
            '<span class="badge ' + badgeClass + '">' + formatRelativeDays(item.delta) + '</span>' +
          '</div>' +
        '</div>';
    });
    html += '</div>';
  }
  html += '</div></section>';

  // 5. Upcoming Subscription Renewals (next 30 days)
  html += '<section class="panel">';
  html +=
    '<div class="panel-header">' +
      '<div class="panel-title-group">' +
        '<h2 class="panel-title">Upcoming Renewals</h2>' +
        '<span class="panel-count">' + upcomingRenewals.length + '</span>' +
      '</div>' +
      '<button class="panel-link" data-jump="subscriptions">All Subscriptions</button>' +
    '</div>';
  html += '<div class="panel-body">';
  if (upcomingRenewals.length === 0) {
    html +=
      '<div class="empty-state">' +
        '<div class="empty-state-icon">' + ICONS.repeat + '</div>' +
        '<div class="empty-state-title">No renewals in the next 30 days</div>' +
        '<div class="empty-state-desc">Subscriptions renewing within 30 days will be highlighted here.</div>' +
      '</div>';
  } else {
    html += '<div class="action-list">';
    upcomingRenewals.forEach(function (item) {
      const sub = item.sub;
      const r = item.renewal;
      const dueLabel = r.daysUntil === 0 ? 'Today' : (r.daysUntil === 1 ? 'Tomorrow' : 'In ' + r.daysUntil + 'd');
      html +=
        '<div class="action-row">' +
          '<div class="action-row-main" data-dash-edit-sub="' + sub.id + '">' +
            '<div class="action-row-title">' + escapeHtml(sub.name) + '</div>' +
            '<div class="action-row-sub">' + escapeHtml(sub.category) + ' · ' + formatDisplayDate(r.nextRenewal) + '</div>' +
          '</div>' +
          '<div class="action-row-right">' +
            '<span class="tabular-nums" style="font-weight:600;font-size:13px">' + formatCurrency(sub.cost) + '</span>' +
            '<span class="badge badge-today">' + dueLabel + '</span>' +
          '</div>' +
        '</div>';
    });
    html += '</div>';
  }
  html += '</div></section>';

  html += '</div>'; // end right col
  html += '</div>'; // end dashboard-grid

  root.innerHTML = html;

  // Bind Dashboard interactions
  root.querySelectorAll('[data-jump]').forEach(function (el) {
    el.addEventListener('click', function () { navigateTo(el.dataset.jump); });
  });

  root.querySelectorAll('[data-dash-complete-card]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const card = appState.data.kanban.find(function (c) { return c.id === btn.dataset.dashCompleteCard; });
      if (!card) return;
      card.status = 'done';
      saveState();
      requestRender();
      showToast('Moved "' + card.title + '" to Done', 'success');
    });
  });

  root.querySelectorAll('[data-dash-edit-card]').forEach(function (el) {
    el.addEventListener('click', function () {
      const card = appState.data.kanban.find(function (c) { return c.id === el.dataset.dashEditCard; });
      if (card) openKanbanModal(card);
    });
  });

  root.querySelectorAll('[data-dash-edit-event]').forEach(function (el) {
    el.addEventListener('click', function () {
      const ev = appState.data.calendar.find(function (e) { return e.id === el.dataset.dashEditEvent; });
      if (ev) openCalendarModal(ev);
    });
  });

  root.querySelectorAll('[data-dash-edit-sub]').forEach(function (el) {
    el.addEventListener('click', function () {
      const sub = appState.data.subscriptions.find(function (s) { return s.id === el.dataset.dashEditSub; });
      if (sub) openSubscriptionModal(sub);
    });
  });

  root.querySelectorAll('[data-dash-edit-goal]').forEach(function (el) {
    el.addEventListener('click', function () {
      const goal = appState.data.goals.find(function (g) { return g.id === el.dataset.dashEditGoal; });
      if (goal) openGoalModal(goal);
    });
  });

  root.querySelectorAll('[data-quick-goal-id]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      updateGoalProgress(btn.dataset.quickGoalId, Number(btn.dataset.quickGoalDelta));
    });
  });

  const addGoalBtn = document.getElementById('dashAddGoalBtn');
  if (addGoalBtn) addGoalBtn.addEventListener('click', function () { openGoalModal(null); });

  const addEventBtn = document.getElementById('dashAddEventBtn');
  if (addEventBtn) addEventBtn.addEventListener('click', function () { openCalendarModal(null, formatDateISO(getTodayDate())); });
}
