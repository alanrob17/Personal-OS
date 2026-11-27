import { ICONS } from '../constants.js';
import { appState, uiState, saveState, requestRender } from '../state.js';
import {
  escapeHtml,
  generateId,
  getTodayDate,
  formatDateISO,
  parseLocalDate,
  isValidDateString,
  diffDays,
  formatDisplayDate,
  formatRelativeDays
} from '../utils.js';
import {
  openFormModal,
  setFormModalError,
  closeFormModal,
  openConfirmModal,
  showToast
} from '../ui.js';

export function renderCalendar(root) {
  const today = getTodayDate();
  const todayISO = formatDateISO(today);
  const year = uiState.calendarYear;
  const month = uiState.calendarMonth;

  // Map events by YYYY-MM-DD
  const eventsByDate = {};
  appState.data.calendar.forEach(function (ev) {
    if (!eventsByDate[ev.date]) eventsByDate[ev.date] = [];
    eventsByDate[ev.date].push(ev);
  });
  Object.keys(eventsByDate).forEach(function (k) {
    eventsByDate[k].sort(function (a, b) { return a.title.localeCompare(b.title); });
  });

  const firstOfMonth = new Date(year, month, 1);
  const monthLabel = firstOfMonth.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  const startWeekday = firstOfMonth.getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

  let html = '<div class="calendar-layout">';

  // Month View Panel
  html += '<section class="panel" style="overflow:hidden">';
  html +=
    '<div class="panel-header">' +
      '<div class="calendar-nav">' +
        '<button class="btn btn-secondary btn-sm" id="calPrevBtn" aria-label="Previous month">' + ICONS.chevLeft + '</button>' +
        '<button class="btn btn-secondary btn-sm" id="calTodayBtn">Today</button>' +
        '<button class="btn btn-secondary btn-sm" id="calNextBtn" aria-label="Next month">' + ICONS.chevRight + '</button>' +
        '<span class="calendar-month-label" style="margin-left:6px">' + escapeHtml(monthLabel) + '</span>' +
      '</div>' +
      '<span style="font-size:12px;color:var(--text-muted)">Click a day to inspect or add events</span>' +
    '</div>';

  html += '<div class="calendar-weekdays">' +
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(function (d) {
      return '<div class="calendar-weekday">' + d + '</div>';
    }).join('') +
  '</div>';

  html += '<div class="calendar-grid">';
  for (let i = 0; i < totalCells; i++) {
    const cellDate = new Date(year, month, 1 - startWeekday + i);
    const cellISO = formatDateISO(cellDate);
    const isCurrentMonth = cellDate.getMonth() === month;
    const isToday = cellISO === todayISO;
    const isSelected = uiState.calendarSelectedDate === cellISO;
    const dayEvents = eventsByDate[cellISO] || [];

    html +=
      '<div class="cal-cell' +
        (isCurrentMonth ? '' : ' other-month') +
        (isToday ? ' is-today' : '') +
        (isSelected ? ' selected' : '') +
      '" data-cal-date="' + cellISO + '">' +
        '<div class="cal-cell-head">' +
          '<span class="cal-day-num">' + cellDate.getDate() + '</span>' +
          '<button type="button" class="cal-add-mini" data-cal-quick-add="' + cellISO + '" title="Add event on ' + cellISO + '" aria-label="Add event on ' + cellISO + '">' + ICONS.plus + '</button>' +
        '</div>';

    dayEvents.slice(0, 2).forEach(function (ev) {
      html += '<button type="button" class="cal-event-pill" data-edit-event="' + ev.id + '" title="' + escapeHtml(ev.title) + '">' + escapeHtml(ev.title) + '</button>';
    });
    if (dayEvents.length > 2) {
      html += '<div class="cal-more-label">+' + (dayEvents.length - 2) + ' more</div>';
    }
    html += '</div>';
  }
  html += '</div></section>';

  // Chronological Events Panel
  const sortedAll = appState.data.calendar
    .slice()
    .sort(function (a, b) {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.title.localeCompare(b.title);
    });

  const selectedDate = uiState.calendarSelectedDate;
  const activeTab = (uiState.calendarAgendaTab === 'selected' && !selectedDate) ? 'upcoming' : uiState.calendarAgendaTab;

  let listEvents;
  if (activeTab === 'selected' && selectedDate) {
    listEvents = sortedAll.filter(function (ev) { return ev.date === selectedDate; });
  } else if (activeTab === 'all') {
    listEvents = sortedAll;
  } else {
    listEvents = sortedAll.filter(function (ev) {
      const d = parseLocalDate(ev.date);
      return d && diffDays(today, d) >= 0;
    });
  }

  html += '<section class="panel" style="overflow:hidden">';
  html +=
    '<div class="panel-header">' +
      '<div class="panel-title-group">' +
        '<h2 class="panel-title">Chronological Events</h2>' +
        '<span class="panel-count">' + listEvents.length + '</span>' +
      '</div>' +
      (selectedDate
        ? '<button class="btn btn-secondary btn-sm" data-cal-quick-add="' + selectedDate + '">' + ICONS.plus + formatDisplayDate(selectedDate) + '</button>'
        : ''
      ) +
    '</div>';

  html += '<div class="agenda-tabs">';
  html += '<button class="agenda-tab' + (activeTab === 'upcoming' ? ' active' : '') + '" data-agenda-tab="upcoming">Upcoming</button>';
  if (selectedDate) {
    html += '<button class="agenda-tab' + (activeTab === 'selected' ? ' active' : '') + '" data-agenda-tab="selected">' + formatDisplayDate(selectedDate) + '</button>';
  }
  html += '<button class="agenda-tab' + (activeTab === 'all' ? ' active' : '') + '" data-agenda-tab="all">All (' + sortedAll.length + ')</button>';
  html += '</div>';

  if (listEvents.length === 0) {
    html +=
      '<div class="empty-state">' +
        '<div class="empty-state-icon">' + ICONS.calendar + '</div>' +
        '<div class="empty-state-title">' +
          (activeTab === 'selected' ? 'No events on ' + formatDisplayDate(selectedDate) : 'No events to display') +
        '</div>' +
        '<div class="empty-state-desc">Store appointments, birthdays, holidays, and fixed-date commitments here.</div>' +
        '<button class="btn btn-secondary btn-sm" id="calEmptyAddBtn">' + ICONS.plus + 'Add Event</button>' +
      '</div>';
  } else {
    html += '<div class="event-list">';
    listEvents.forEach(function (ev) {
      const d = parseLocalDate(ev.date);
      const delta = d ? diffDays(today, d) : 0;
      const monStr = d ? d.toLocaleDateString('en-AU', { month: 'short' }) : '';
      const dayNum = d ? d.getDate() : '';
      const isPast = delta < 0;
      const isEvToday = delta === 0;
      const badgeClass = isEvToday ? 'badge-today' : (isPast ? 'badge-neutral' : 'badge-upcoming');

      html +=
        '<div class="event-item' + (isPast ? ' is-past' : '') + (isEvToday ? ' is-today' : '') + '" data-event-id="' + ev.id + '">' +
          '<div class="event-date-box">' +
            '<div class="event-date-mon">' + monStr + '</div>' +
            '<div class="event-date-day">' + dayNum + '</div>' +
          '</div>' +
          '<div class="event-item-body">' +
            '<div class="event-item-title">' + escapeHtml(ev.title) + '</div>' +
            '<div class="event-item-meta">' +
              '<span>' + (d ? d.toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : ev.date) + '</span>' +
              '<span class="badge ' + badgeClass + '">' + formatRelativeDays(delta) + '</span>' +
            '</div>' +
            (ev.notes ? '<div class="event-item-notes">' + escapeHtml(ev.notes) + '</div>' : '') +
          '</div>' +
          '<div class="event-item-actions">' +
            '<button class="icon-action" data-edit-event="' + ev.id + '" title="Edit event" aria-label="Edit event">' + ICONS.edit + '</button>' +
            '<button class="icon-action delete" data-delete-event="' + ev.id + '" title="Delete event" aria-label="Delete event">' + ICONS.trash + '</button>' +
          '</div>' +
        '</div>';
    });
    html += '</div>';
  }

  html += '</section></div>';
  root.innerHTML = html;

  // Bind Calendar events
  document.getElementById('calPrevBtn').addEventListener('click', function () {
    uiState.calendarMonth--;
    if (uiState.calendarMonth < 0) { uiState.calendarMonth = 11; uiState.calendarYear--; }
    renderCalendar(root);
  });
  document.getElementById('calNextBtn').addEventListener('click', function () {
    uiState.calendarMonth++;
    if (uiState.calendarMonth > 11) { uiState.calendarMonth = 0; uiState.calendarYear++; }
    renderCalendar(root);
  });
  document.getElementById('calTodayBtn').addEventListener('click', function () {
    const now = getTodayDate();
    uiState.calendarYear = now.getFullYear();
    uiState.calendarMonth = now.getMonth();
    uiState.calendarSelectedDate = formatDateISO(now);
    uiState.calendarAgendaTab = 'selected';
    renderCalendar(root);
  });

  root.querySelectorAll('[data-cal-date]').forEach(function (cell) {
    cell.addEventListener('click', function () {
      uiState.calendarSelectedDate = cell.dataset.calDate;
      uiState.calendarAgendaTab = 'selected';
      renderCalendar(root);
    });
  });

  root.querySelectorAll('[data-cal-quick-add]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      openCalendarModal(null, btn.dataset.calQuickAdd);
    });
  });

  root.querySelectorAll('[data-agenda-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      uiState.calendarAgendaTab = btn.dataset.agendaTab;
      renderCalendar(root);
    });
  });

  root.querySelectorAll('[data-edit-event]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const ev = appState.data.calendar.find(function (item) { return item.id === btn.dataset.editEvent; });
      if (ev) openCalendarModal(ev);
    });
  });

  root.querySelectorAll('[data-delete-event]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const ev = appState.data.calendar.find(function (item) { return item.id === btn.dataset.deleteEvent; });
      if (!ev) return;
      openConfirmModal({
        title: 'Delete Event',
        message: 'Are you sure you want to delete "' + ev.title + '"? This action cannot be undone.',
        confirmLabel: 'Delete',
        danger: true,
        onConfirm: function () {
          appState.data.calendar = appState.data.calendar.filter(function (item) { return item.id !== ev.id; });
          saveState();
          requestRender();
          showToast('Event deleted', 'info');
        }
      });
    });
  });

  const emptyBtn = document.getElementById('calEmptyAddBtn');
  if (emptyBtn) {
    emptyBtn.addEventListener('click', function () {
      openCalendarModal(null, uiState.calendarSelectedDate || formatDateISO(getTodayDate()));
    });
  }
}

export function openCalendarModal(ev, defaultDate) {
  const isEdit = Boolean(ev);
  const dateVal = isEdit ? ev.date : (defaultDate || formatDateISO(getTodayDate()));

  const bodyHtml =
    '<div class="form-field">' +
      '<label class="form-label" for="evTitle">Event Title <span class="req">*</span></label>' +
      '<input id="evTitle" class="form-input" type="text" maxlength="140" value="' + escapeHtml(isEdit ? ev.title : '') + '" placeholder="e.g., Dentist appointment, Mom\'s birthday">' +
    '</div>' +
    '<div class="form-field">' +
      '<label class="form-label" for="evDate">Date <span class="req">*</span></label>' +
      '<input id="evDate" class="form-input" type="date" value="' + escapeHtml(dateVal) + '">' +
    '</div>' +
    '<div class="form-field">' +
      '<label class="form-label" for="evNotes">Notes</label>' +
      '<textarea id="evNotes" class="form-textarea" placeholder="Location, time, or notes...">' + escapeHtml(isEdit ? (ev.notes || '') : '') + '</textarea>' +
    '</div>';

  openFormModal({
    title: isEdit ? 'Edit Event' : 'New Calendar Event',
    submitLabel: isEdit ? 'Save Changes' : 'Create Event',
    bodyHtml: bodyHtml,
    onSubmit: function () {
      const title = document.getElementById('evTitle').value.trim();
      const date = document.getElementById('evDate').value.trim();
      const notes = document.getElementById('evNotes').value.trim();

      if (!title) {
        setFormModalError('Please enter an event title.');
        return;
      }
      if (!isValidDateString(date)) {
        setFormModalError('Please select a valid date.');
        return;
      }

      if (isEdit) {
        ev.title = title;
        ev.date = date;
        ev.notes = notes;
        showToast('Event updated', 'success');
      } else {
        appState.data.calendar.push({
          id: generateId(),
          title: title,
          date: date,
          notes: notes
        });
        const d = parseLocalDate(date);
        if (d) {
          uiState.calendarYear = d.getFullYear();
          uiState.calendarMonth = d.getMonth();
        }
        showToast('Event created', 'success');
      }

      saveState();
      closeFormModal();
      requestRender();
    }
  });
}
