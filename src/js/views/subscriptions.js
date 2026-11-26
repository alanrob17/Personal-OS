import {
  SUBSCRIPTION_CATEGORIES,
  SUBSCRIPTION_FREQUENCIES,
  ICONS
} from '../constants.js';
import { appState, uiState, saveState, requestRender } from '../state.js';
import {
  escapeHtml,
  generateId,
  getTodayDate,
  formatDateISO,
  isValidDateString,
  formatDisplayDate,
  formatCurrency,
  calculateSubscriptionRenewal,
  normalizeMonthlyCost
} from '../utils.js';
import {
  openFormModal,
  setFormModalError,
  closeFormModal,
  openConfirmModal,
  showToast
} from '../ui.js';

export function renderSubscriptions(root) {
  const enriched = appState.data.subscriptions.map(function (sub) {
    const renewal = calculateSubscriptionRenewal(sub);
    const monthly = normalizeMonthlyCost(sub.cost, sub.frequency);
    return { sub: sub, renewal: renewal, monthly: monthly };
  });

  const activeItems = enriched.filter(function (x) { return x.renewal.active; });
  const monthlyTotal = activeItems.reduce(function (acc, x) { return acc + x.monthly; }, 0);
  const yearlyTotal = monthlyTotal * 12;
  const renewingSoonCount = enriched.filter(function (x) { return x.renewal.renewingSoon; }).length;

  const visible = enriched.filter(function (x) {
    return uiState.subCategoryFilter === 'all' || x.sub.category === uiState.subCategoryFilter;
  });

  // Sort
  visible.sort(function (a, b) {
    if (uiState.subSortBy === 'cost') {
      return b.monthly - a.monthly;
    }
    if (uiState.subSortBy === 'name') {
      return a.sub.name.localeCompare(b.sub.name);
    }
    // Default: soonest renewal first, then ending, then ended
    const aRank = a.renewal.status === 'active' ? a.renewal.daysUntil : (a.renewal.status === 'ending' ? 100000 + a.renewal.daysUntilEnd : 999999);
    const bRank = b.renewal.status === 'active' ? b.renewal.daysUntil : (b.renewal.status === 'ending' ? 100000 + b.renewal.daysUntilEnd : 999999);
    if (aRank !== bRank) return aRank - bRank;
    return a.sub.name.localeCompare(b.sub.name);
  });

  let html = '';

  // Summary strip
  html += '<section class="sub-summary-strip">';
  html +=
    '<div class="sub-stat-card">' +
      '<div class="sub-stat-label">Monthly Recurring Cost</div>' +
      '<div class="sub-stat-value">' + formatCurrency(monthlyTotal) + '</div>' +
    '</div>' +
    '<div class="sub-stat-card">' +
      '<div class="sub-stat-label">Annualized Cost</div>' +
      '<div class="sub-stat-value">' + formatCurrency(yearlyTotal) + '</div>' +
    '</div>' +
    '<div class="sub-stat-card">' +
      '<div class="sub-stat-label">Active Subscriptions</div>' +
      '<div class="sub-stat-value">' + activeItems.length + '</div>' +
    '</div>' +
    '<div class="sub-stat-card' + (renewingSoonCount > 0 ? ' highlight' : '') + '">' +
      '<div class="sub-stat-label">Renewing Within 30 Days</div>' +
      '<div class="sub-stat-value">' + renewingSoonCount + '</div>' +
    '</div>';
  html += '</section>';

  // Controls
  html +=
    '<div class="section-toolbar">' +
      '<div class="sub-controls">' +
        '<select id="subCatFilter" class="sub-select" aria-label="Filter by category">' +
          '<option value="all"' + (uiState.subCategoryFilter === 'all' ? ' selected' : '') + '>All Categories</option>' +
          SUBSCRIPTION_CATEGORIES.map(function (cat) {
            return '<option value="' + escapeHtml(cat) + '"' + (uiState.subCategoryFilter === cat ? ' selected' : '') + '>' + escapeHtml(cat) + '</option>';
          }).join('') +
        '</select>' +
        '<select id="subSortSelect" class="sub-select" aria-label="Sort subscriptions">' +
          '<option value="renewal"' + (uiState.subSortBy === 'renewal' ? ' selected' : '') + '>Sort: Next Renewal</option>' +
          '<option value="cost"' + (uiState.subSortBy === 'cost' ? ' selected' : '') + '>Sort: Highest Monthly Cost</option>' +
          '<option value="name"' + (uiState.subSortBy === 'name' ? ' selected' : '') + '>Sort: Name (A–Z)</option>' +
        '</select>' +
      '</div>' +
      '<span style="font-size:12.5px;color:var(--text-muted)">Highlighted rows renew within the next 30 days</span>' +
    '</div>';

  // Table panel
  html += '<section class="panel" style="overflow:hidden">';
  if (visible.length === 0) {
    html +=
      '<div class="empty-state" style="padding:42px 16px">' +
        '<div class="empty-state-icon">' + ICONS.repeat + '</div>' +
        '<div class="empty-state-title">' + (appState.data.subscriptions.length === 0 ? 'No subscriptions tracked yet' : 'No subscriptions in this category') + '</div>' +
        '<div class="empty-state-desc">Track recurring memberships, software, utilities, and services with automatic renewal dates.</div>' +
        (appState.data.subscriptions.length === 0
          ? '<button class="btn btn-primary btn-sm" id="subEmptyAddBtn">' + ICONS.plus + 'Add Subscription</button>'
          : ''
        ) +
      '</div>';
  } else {
    html +=
      '<div class="sub-table-wrap"><table class="sub-table">' +
        '<thead><tr>' +
          '<th>Subscription</th>' +
          '<th>Category</th>' +
          '<th>Cost</th>' +
          '<th>Frequency</th>' +
          '<th>Next Renewal</th>' +
          '<th>Start / End</th>' +
          '<th style="text-align:right">Actions</th>' +
        '</tr></thead><tbody>';

    visible.forEach(function (item) {
      const sub = item.sub;
      const r = item.renewal;
      const rowClass = r.renewingSoon ? 'renewing-soon' : (r.status === 'ended' ? 'is-ended' : '');

      let renewalHtml;
      if (r.status === 'active') {
        const rel = r.daysUntil === 0 ? 'Today' : (r.daysUntil === 1 ? 'In 1 day' : 'In ' + r.daysUntil + ' days');
        renewalHtml =
          '<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">' +
            '<span class="tabular-nums" style="font-weight:500">' + formatDisplayDate(r.nextRenewal, true) + '</span>' +
            (r.renewingSoon
              ? '<span class="badge badge-today">' + rel + '</span>'
              : '<span class="badge badge-neutral">' + rel + '</span>'
            ) +
          '</div>';
      } else if (r.status === 'ending') {
        renewalHtml = '<span class="badge badge-neutral">Ends ' + formatDisplayDate(r.endDate, true) + '</span>';
      } else {
        renewalHtml = '<span class="badge badge-neutral">Ended ' + formatDisplayDate(r.endDate, true) + '</span>';
      }

      html +=
        '<tr class="' + rowClass + '" data-sub-id="' + sub.id + '">' +
          '<td>' +
            '<div class="sub-name">' + escapeHtml(sub.name) + '</div>' +
            (sub.notes ? '<div class="sub-notes" title="' + escapeHtml(sub.notes) + '">' + escapeHtml(sub.notes) + '</div>' : '') +
          '</td>' +
          '<td><span class="badge badge-neutral">' + escapeHtml(sub.category) + '</span></td>' +
          '<td class="sub-cost-cell">' +
            formatCurrency(sub.cost) +
            (sub.frequency !== 'Monthly' ? '<div class="sub-cost-norm">' + formatCurrency(item.monthly) + '/mo</div>' : '') +
          '</td>' +
          '<td>' + escapeHtml(sub.frequency) + '</td>' +
          '<td>' + renewalHtml + '</td>' +
          '<td class="tabular-nums" style="font-size:12px;color:var(--text-muted);white-space:nowrap">' +
            'Started ' + formatDisplayDate(sub.startDate, true) +
            (sub.endDate ? '<div>Ends ' + formatDisplayDate(sub.endDate, true) + '</div>' : '') +
          '</td>' +
          '<td style="text-align:right;white-space:nowrap">' +
            '<button class="icon-action" data-edit-sub="' + sub.id + '" title="Edit subscription" aria-label="Edit subscription">' + ICONS.edit + '</button>' +
            '<button class="icon-action delete" data-delete-sub="' + sub.id + '" title="Delete subscription" aria-label="Delete subscription">' + ICONS.trash + '</button>' +
          '</td>' +
        '</tr>';
    });

    html += '</tbody></table></div>';
  }
  html += '</section>';

  root.innerHTML = html;

  // Bind events
  document.getElementById('subCatFilter').addEventListener('change', function (e) {
    uiState.subCategoryFilter = e.target.value;
    renderSubscriptions(root);
  });
  document.getElementById('subSortSelect').addEventListener('change', function (e) {
    uiState.subSortBy = e.target.value;
    renderSubscriptions(root);
  });

  root.querySelectorAll('[data-edit-sub]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const sub = appState.data.subscriptions.find(function (s) { return s.id === btn.dataset.editSub; });
      if (sub) openSubscriptionModal(sub);
    });
  });

  root.querySelectorAll('[data-delete-sub]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const sub = appState.data.subscriptions.find(function (s) { return s.id === btn.dataset.deleteSub; });
      if (!sub) return;
      openConfirmModal({
        title: 'Delete Subscription',
        message: 'Are you sure you want to delete "' + sub.name + '"? This action cannot be undone.',
        confirmLabel: 'Delete',
        danger: true,
        onConfirm: function () {
          appState.data.subscriptions = appState.data.subscriptions.filter(function (s) { return s.id !== sub.id; });
          saveState();
          requestRender();
          showToast('Subscription deleted', 'info');
        }
      });
    });
  });

  const emptyBtn = document.getElementById('subEmptyAddBtn');
  if (emptyBtn) emptyBtn.addEventListener('click', function () { openSubscriptionModal(null); });
}

export function openSubscriptionModal(sub) {
  const isEdit = Boolean(sub);
  const catVal = isEdit ? sub.category : SUBSCRIPTION_CATEGORIES[0];
  const freqVal = isEdit ? sub.frequency : 'Monthly';
  const startVal = isEdit ? sub.startDate : formatDateISO(getTodayDate());

  const bodyHtml =
    '<div class="form-field">' +
      '<label class="form-label" for="subName">Name <span class="req">*</span></label>' +
      '<input id="subName" class="form-input" type="text" maxlength="120" value="' + escapeHtml(isEdit ? sub.name : '') + '" placeholder="e.g., Spotify, iCloud+, Gym Membership">' +
    '</div>' +
    '<div class="form-row">' +
      '<div class="form-field">' +
        '<label class="form-label" for="subCost">Cost (USD) <span class="req">*</span></label>' +
        '<input id="subCost" class="form-input" type="number" step="0.01" min="0" value="' + (isEdit ? escapeHtml(sub.cost) : '') + '" placeholder="0.00">' +
      '</div>' +
      '<div class="form-field">' +
        '<label class="form-label" for="subFrequency">Frequency <span class="req">*</span></label>' +
        '<select id="subFrequency" class="form-select">' +
          SUBSCRIPTION_FREQUENCIES.map(function (f) {
            return '<option value="' + f + '"' + (freqVal === f ? ' selected' : '') + '>' + f + '</option>';
          }).join('') +
        '</select>' +
      '</div>' +
    '</div>' +
    '<div class="form-field">' +
      '<label class="form-label" for="subCategory">Category <span class="req">*</span></label>' +
      '<select id="subCategory" class="form-select">' +
        SUBSCRIPTION_CATEGORIES.map(function (cat) {
          return '<option value="' + escapeHtml(cat) + '"' + (catVal === cat ? ' selected' : '') + '>' + escapeHtml(cat) + '</option>';
        }).join('') +
      '</select>' +
    '</div>' +
    '<div class="form-row">' +
      '<div class="form-field">' +
        '<label class="form-label" for="subStart">Start Date <span class="req">*</span></label>' +
        '<input id="subStart" class="form-input" type="date" value="' + escapeHtml(startVal) + '">' +
      '</div>' +
      '<div class="form-field">' +
        '<label class="form-label" for="subEnd">End Date (optional)</label>' +
        '<input id="subEnd" class="form-input" type="date" value="' + escapeHtml(isEdit ? (sub.endDate || '') : '') + '">' +
      '</div>' +
    '</div>' +
    '<div class="form-field">' +
      '<label class="form-label" for="subNotes">Notes (optional)</label>' +
      '<textarea id="subNotes" class="form-textarea" placeholder="Plan details, billing account, or cancellation notes...">' + escapeHtml(isEdit ? (sub.notes || '') : '') + '</textarea>' +
    '</div>';

  openFormModal({
    title: isEdit ? 'Edit Subscription' : 'Add Subscription',
    submitLabel: isEdit ? 'Save Changes' : 'Add Subscription',
    bodyHtml: bodyHtml,
    onSubmit: function () {
      const name = document.getElementById('subName').value.trim();
      const costRaw = document.getElementById('subCost').value.trim();
      const cost = Number(costRaw);
      const category = document.getElementById('subCategory').value;
      const frequency = document.getElementById('subFrequency').value;
      const startDate = document.getElementById('subStart').value.trim();
      const endDate = document.getElementById('subEnd').value.trim();
      const notes = document.getElementById('subNotes').value.trim();

      if (!name) {
        setFormModalError('Please enter a subscription name.');
        return;
      }
      if (costRaw === '' || !Number.isFinite(cost) || cost < 0) {
        setFormModalError('Please enter a valid cost (0 or greater).');
        return;
      }
      if (!isValidDateString(startDate)) {
        setFormModalError('Please select a valid start date.');
        return;
      }
      if (endDate) {
        if (!isValidDateString(endDate)) {
          setFormModalError('Please select a valid end date.');
          return;
        }
        if (endDate < startDate) {
          setFormModalError('End date cannot be earlier than start date.');
          return;
        }
      }

      if (isEdit) {
        sub.name = name;
        sub.cost = Math.round(cost * 100) / 100;
        sub.category = category;
        sub.frequency = frequency;
        sub.startDate = startDate;
        sub.endDate = endDate;
        sub.notes = notes;
        showToast('Subscription updated', 'success');
      } else {
        appState.data.subscriptions.push({
          id: generateId(),
          name: name,
          cost: Math.round(cost * 100) / 100,
          category: category,
          startDate: startDate,
          frequency: frequency,
          endDate: endDate,
          notes: notes
        });
        showToast('Subscription added', 'success');
      }

      saveState();
      closeFormModal();
      requestRender();
    }
  });
}
