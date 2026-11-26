import { KANBAN_COLUMNS } from './constants.js';
import { appState, uiState, navigateTo } from './state.js';
import {
  escapeHtml,
  capitalize,
  formatDisplayDate,
  formatCurrency,
  formatNumber,
  parseLocalDate,
  highlightMatch
} from './utils.js';

/* =========================================================================
   TOAST NOTIFICATIONS
   ========================================================================= */
export function showToast(message, type) {
  const stack = document.getElementById('toastStack');
  const toast = document.createElement('div');
  toast.className = 'toast ' + (type || 'info');
  toast.textContent = message;
  stack.appendChild(toast);
  setTimeout(function () {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
    toast.style.transition = 'opacity 180ms ease, transform 180ms ease';
    setTimeout(function () { toast.remove(); }, 190);
  }, 3200);
}

/* =========================================================================
   FORM & CONFIRMATION MODALS
   ========================================================================= */
let currentFormSubmitHandler = null;
let currentConfirmHandler = null;

export function openFormModal(options) {
  const backdrop = document.getElementById('formModalBackdrop');
  const titleEl = document.getElementById('formModalTitle');
  const bodyEl = document.getElementById('formModalBody');
  const footerEl = document.getElementById('formModalFooter');

  titleEl.textContent = options.title;
  bodyEl.innerHTML = '<div class="form-error" id="modalFormError"></div>' + options.bodyHtml;
  footerEl.innerHTML =
    '<button type="button" class="btn btn-secondary" id="modalCancelBtn">Cancel</button>' +
    '<button type="submit" class="btn btn-primary">' + escapeHtml(options.submitLabel || 'Save') + '</button>';

  currentFormSubmitHandler = options.onSubmit;
  backdrop.classList.add('open');

  document.getElementById('modalCancelBtn').addEventListener('click', closeFormModal);

  requestAnimationFrame(function () {
    const firstInput = bodyEl.querySelector('input, select, textarea');
    if (firstInput) firstInput.focus();
  });
}

export function setFormModalError(msg) {
  const errEl = document.getElementById('modalFormError');
  if (!errEl) return;
  if (msg) {
    errEl.textContent = msg;
    errEl.classList.add('visible');
  } else {
    errEl.textContent = '';
    errEl.classList.remove('visible');
  }
}

export function closeFormModal() {
  document.getElementById('formModalBackdrop').classList.remove('open');
  currentFormSubmitHandler = null;
}

export function openConfirmModal(options) {
  const backdrop = document.getElementById('confirmModalBackdrop');
  const titleEl = document.getElementById('confirmModalTitle');
  const bodyEl = document.getElementById('confirmModalBody');
  const footerEl = document.getElementById('confirmModalFooter');

  titleEl.textContent = options.title;
  let bodyHtml = '<p class="confirm-message">' + escapeHtml(options.message) + '</p>';
  if (options.detailsHtml) {
    bodyHtml += '<div class="confirm-details">' + options.detailsHtml + '</div>';
  }
  bodyEl.innerHTML = bodyHtml;

  if (options.alertOnly) {
    footerEl.innerHTML = '<button type="button" class="btn btn-primary" id="confirmOkBtn">Close</button>';
    currentConfirmHandler = null;
    backdrop.classList.add('open');
    document.getElementById('confirmOkBtn').addEventListener('click', closeConfirmModal);
    requestAnimationFrame(function () {
      document.getElementById('confirmOkBtn').focus();
    });
    return;
  }

  const confirmClass = options.danger ? 'btn-danger' : 'btn-primary';
  footerEl.innerHTML =
    '<button type="button" class="btn btn-secondary" id="confirmCancelBtn">Cancel</button>' +
    '<button type="button" class="btn ' + confirmClass + '" id="confirmActionBtn">' + escapeHtml(options.confirmLabel || 'Confirm') + '</button>';

  currentConfirmHandler = options.onConfirm;
  backdrop.classList.add('open');

  document.getElementById('confirmCancelBtn').addEventListener('click', closeConfirmModal);
  document.getElementById('confirmActionBtn').addEventListener('click', function () {
    const fn = currentConfirmHandler;
    closeConfirmModal();
    if (typeof fn === 'function') fn();
  });

  requestAnimationFrame(function () {
    document.getElementById('confirmActionBtn').focus();
  });
}

export function closeConfirmModal() {
  document.getElementById('confirmModalBackdrop').classList.remove('open');
  currentConfirmHandler = null;
}

export function initModals() {
  document.getElementById('modalForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (typeof currentFormSubmitHandler === 'function') {
      currentFormSubmitHandler();
    }
  });
  document.getElementById('formModalClose').addEventListener('click', closeFormModal);
  document.getElementById('formModalBackdrop').addEventListener('mousedown', function (e) {
    if (e.target === e.currentTarget) closeFormModal();
  });

  document.getElementById('confirmModalClose').addEventListener('click', closeConfirmModal);
  document.getElementById('confirmModalBackdrop').addEventListener('mousedown', function (e) {
    if (e.target === e.currentTarget) closeConfirmModal();
  });
}

/* =========================================================================
   GLOBAL SEARCH
   ========================================================================= */
export function performSearch(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results = [];

  // Kanban titles & notes
  appState.data.kanban.forEach(function (card) {
    const inTitle = (card.title || '').toLowerCase().includes(q);
    const inNotes = (card.notes || '').toLowerCase().includes(q);
    if (inTitle || inNotes) {
      const col = KANBAN_COLUMNS.find(function (c) { return c.id === card.status; });
      results.push({
        section: 'kanban',
        sectionLabel: 'Kanban',
        id: card.id,
        title: card.title,
        meta: (col ? col.label : '') + ' · ' + capitalize(card.priority) + ' priority' + (card.notes ? ' — ' + card.notes : '')
      });
    }
  });

  // Calendar titles & notes
  appState.data.calendar.forEach(function (ev) {
    const inTitle = (ev.title || '').toLowerCase().includes(q);
    const inNotes = (ev.notes || '').toLowerCase().includes(q);
    if (inTitle || inNotes) {
      results.push({
        section: 'calendar',
        sectionLabel: 'Calendar',
        id: ev.id,
        date: ev.date,
        title: ev.title,
        meta: formatDisplayDate(ev.date, true) + (ev.notes ? ' — ' + ev.notes : '')
      });
    }
  });

  // Subscription names, categories & notes
  appState.data.subscriptions.forEach(function (sub) {
    const inName = (sub.name || '').toLowerCase().includes(q);
    const inCat = (sub.category || '').toLowerCase().includes(q);
    const inNotes = (sub.notes || '').toLowerCase().includes(q);
    if (inName || inCat || inNotes) {
      results.push({
        section: 'subscriptions',
        sectionLabel: 'Subscriptions',
        id: sub.id,
        title: sub.name,
        meta: sub.category + ' · ' + formatCurrency(sub.cost) + ' / ' + sub.frequency + (sub.notes ? ' — ' + sub.notes : '')
      });
    }
  });

  // Goal titles
  appState.data.goals.forEach(function (goal) {
    if ((goal.title || '').toLowerCase().includes(q)) {
      const pct = Math.min(100, Math.round((goal.current / goal.target) * 100));
      results.push({
        section: 'goals',
        sectionLabel: 'Goals',
        id: goal.id,
        title: goal.title,
        meta: formatNumber(goal.current) + ' / ' + formatNumber(goal.target) + ' (' + pct + '%)'
      });
    }
  });

  return results;
}

export function renderSearchDropdown(rawQuery) {
  const container = document.getElementById('searchContainer');
  const dropdown = document.getElementById('searchDropdown');
  const trimmed = rawQuery.trim();

  container.classList.toggle('has-query', rawQuery.length > 0);

  if (!trimmed) {
    uiState.searchResults = [];
    uiState.searchActiveIndex = -1;
    dropdown.classList.remove('open');
    dropdown.innerHTML = '';
    return;
  }

  const results = performSearch(trimmed);
  uiState.searchResults = results;
  uiState.searchActiveIndex = results.length > 0 ? 0 : -1;

  if (results.length === 0) {
    dropdown.innerHTML = '<div class="search-empty">No results found for "' + escapeHtml(trimmed) + '"</div>';
    dropdown.classList.add('open');
    return;
  }

  let html =
    '<div class="search-dropdown-header">' +
      '<span>Search Results</span>' +
      '<span>' + results.length + (results.length === 1 ? ' match' : ' matches') + '</span>' +
    '</div>';

  results.forEach(function (res, idx) {
    html +=
      '<button type="button" class="search-result-item' + (idx === uiState.searchActiveIndex ? ' active' : '') + '" data-search-idx="' + idx + '">' +
        '<span class="search-section-tag ' + res.section + '">' + escapeHtml(res.sectionLabel) + '</span>' +
        '<div class="search-result-body">' +
          '<div class="search-result-title">' + highlightMatch(res.title, trimmed) + '</div>' +
          '<div class="search-result-meta">' + highlightMatch(res.meta, trimmed) + '</div>' +
        '</div>' +
      '</button>';
  });

  dropdown.innerHTML = html;
  dropdown.classList.add('open');
}

export function selectSearchResult(idx) {
  const res = uiState.searchResults[idx];
  if (!res) return;

  const input = document.getElementById('globalSearchInput');
  input.value = '';
  renderSearchDropdown('');
  input.blur();

  if (res.section === 'kanban') {
    uiState.kanbanPriorityFilter = 'all';
    navigateTo('kanban', { highlightSelector: '[data-card-id="' + res.id + '"]' });
  } else if (res.section === 'calendar') {
    const d = parseLocalDate(res.date);
    if (d) {
      uiState.calendarYear = d.getFullYear();
      uiState.calendarMonth = d.getMonth();
      uiState.calendarSelectedDate = res.date;
      uiState.calendarAgendaTab = 'selected';
    }
    navigateTo('calendar', { highlightSelector: '[data-event-id="' + res.id + '"]' });
  } else if (res.section === 'subscriptions') {
    uiState.subCategoryFilter = 'all';
    navigateTo('subscriptions', { highlightSelector: '[data-sub-id="' + res.id + '"]' });
  } else if (res.section === 'goals') {
    uiState.goalFilter = 'all';
    navigateTo('goals', { highlightSelector: '[data-goal-id="' + res.id + '"]' });
  }
}

export function updateSearchActiveHighlight() {
  const items = document.querySelectorAll('#searchDropdown .search-result-item');
  items.forEach(function (el, idx) {
    const active = idx === uiState.searchActiveIndex;
    el.classList.toggle('active', active);
    if (active) el.scrollIntoView({ block: 'nearest' });
  });
}

export function initSearch() {
  const searchInput = document.getElementById('globalSearchInput');
  const searchDropdown = document.getElementById('searchDropdown');
  const searchClearBtn = document.getElementById('searchClearBtn');

  searchInput.addEventListener('input', function () {
    renderSearchDropdown(searchInput.value);
  });

  searchInput.addEventListener('focus', function () {
    if (searchInput.value.trim()) {
      renderSearchDropdown(searchInput.value);
    }
  });

  searchInput.addEventListener('keydown', function (e) {
    const results = uiState.searchResults;
    if (e.key === 'Escape') {
      searchInput.value = '';
      renderSearchDropdown('');
      searchInput.blur();
      return;
    }
    if (!results.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      uiState.searchActiveIndex = (uiState.searchActiveIndex + 1) % results.length;
      updateSearchActiveHighlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      uiState.searchActiveIndex = (uiState.searchActiveIndex - 1 + results.length) % results.length;
      updateSearchActiveHighlight();
    } else if (e.key === 'Enter' && uiState.searchActiveIndex >= 0) {
      e.preventDefault();
      selectSearchResult(uiState.searchActiveIndex);
    }
  });

  searchClearBtn.addEventListener('click', function () {
    searchInput.value = '';
    renderSearchDropdown('');
    searchInput.focus();
  });

  searchDropdown.addEventListener('click', function (e) {
    const item = e.target.closest('[data-search-idx]');
    if (item) {
      selectSearchResult(Number(item.dataset.searchIdx));
    }
  });

  document.addEventListener('click', function (e) {
    if (!document.getElementById('searchContainer').contains(e.target)) {
      searchDropdown.classList.remove('open');
    }
  });
}
