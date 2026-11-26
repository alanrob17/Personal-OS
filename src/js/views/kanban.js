import { KANBAN_COLUMNS, PRIORITIES, ICONS } from '../constants.js';
import { appState, uiState, saveState, requestRender } from '../state.js';
import {
  escapeHtml,
  capitalize,
  generateId,
  isValidDateString,
  getDueDateInfo
} from '../utils.js';
import {
  openFormModal,
  setFormModalError,
  closeFormModal,
  openConfirmModal,
  showToast
} from '../ui.js';

export function renderKanban(root) {
  const filter = uiState.kanbanPriorityFilter;
  const filteredCards = appState.data.kanban.filter(function (c) {
    return filter === 'all' || c.priority === filter;
  });

  let html =
    '<div class="section-toolbar">' +
      '<div class="filter-pills" role="group" aria-label="Filter by priority">' +
        ['all', 'high', 'medium', 'low'].map(function (p) {
          const label = p === 'all' ? 'All Priorities' : capitalize(p);
          return '<button class="filter-pill' + (filter === p ? ' active' : '') + '" data-kanban-filter="' + p + '">' + label + '</button>';
        }).join('') +
      '</div>' +
      '<span style="font-size:12.5px;color:var(--text-muted)">Drag cards between columns to update status</span>' +
    '</div>';

  html += '<div class="kanban-board">';
  KANBAN_COLUMNS.forEach(function (col) {
    const cards = filteredCards.filter(function (c) { return c.status === col.id; });
    html +=
      '<section class="kanban-column" data-column-status="' + col.id + '">' +
        '<div class="kanban-col-header">' +
          '<div class="kanban-col-title-wrap">' +
            '<span class="ks-dot" style="background:' + col.dotColor + '"></span>' +
            '<h2 class="kanban-col-title">' + col.label + '</h2>' +
            '<span class="panel-count">' + cards.length + '</span>' +
          '</div>' +
          '<button class="icon-action" data-add-in-col="' + col.id + '" title="Add card to ' + col.label + '" aria-label="Add card to ' + col.label + '">' + ICONS.plus + '</button>' +
        '</div>' +
        '<div class="kanban-col-body" data-drop-list="' + col.id + '">';

    if (cards.length === 0) {
      html += '<div class="kanban-empty-col">No cards in ' + col.label + '</div>';
    } else {
      cards.forEach(function (card) {
        const isDone = card.status === 'done';
        const due = getDueDateInfo(card.dueDate, isDone);
        html +=
          '<article class="kanban-card priority-' + card.priority + (isDone ? ' is-done' : '') + '" draggable="true" data-card-id="' + card.id + '">' +
            '<div class="kanban-card-top">' +
              '<div class="kanban-card-title">' + escapeHtml(card.title) + '</div>' +
              '<div class="kanban-card-actions">' +
                '<button type="button" class="icon-action" data-edit-card="' + card.id + '" title="Edit card" aria-label="Edit card">' + ICONS.edit + '</button>' +
                '<button type="button" class="icon-action delete" data-delete-card="' + card.id + '" title="Delete card" aria-label="Delete card">' + ICONS.trash + '</button>' +
              '</div>' +
            '</div>' +
            (card.notes ? '<div class="kanban-card-notes">' + escapeHtml(card.notes) + '</div>' : '') +
            '<div class="kanban-card-footer">' +
              '<span class="badge badge-' + card.priority + '">' + capitalize(card.priority) + '</span>' +
              (due ? '<span class="badge ' + due.badgeClass + '">' + (due.state === 'overdue' ? ICONS.alert : ICONS.clock) + escapeHtml(due.label) + '</span>' : '') +
            '</div>' +
          '</article>';
      });
    }

    html += '</div></section>';
  });
  html += '</div>';

  root.innerHTML = html;

  // Priority filter
  root.querySelectorAll('[data-kanban-filter]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      uiState.kanbanPriorityFilter = btn.dataset.kanbanFilter;
      renderKanban(root);
    });
  });

  // Add card in specific column
  root.querySelectorAll('[data-add-in-col]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openKanbanModal(null, btn.dataset.addInCol);
    });
  });

  // Edit & delete card
  root.querySelectorAll('[data-edit-card]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const card = appState.data.kanban.find(function (c) { return c.id === btn.dataset.editCard; });
      if (card) openKanbanModal(card);
    });
  });

  root.querySelectorAll('[data-delete-card]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const card = appState.data.kanban.find(function (c) { return c.id === btn.dataset.deleteCard; });
      if (!card) return;
      openConfirmModal({
        title: 'Delete Card',
        message: 'Are you sure you want to delete "' + card.title + '"? This action cannot be undone.',
        confirmLabel: 'Delete',
        danger: true,
        onConfirm: function () {
          appState.data.kanban = appState.data.kanban.filter(function (c) { return c.id !== card.id; });
          saveState();
          requestRender();
          showToast('Card deleted', 'info');
        }
      });
    });
  });

  // Bind Drag & Drop
  bindKanbanDragAndDrop(root);
}

function bindKanbanDragAndDrop(root) {
  function clearDropHints() {
    root.querySelectorAll('.kanban-column').forEach(function (col) { col.classList.remove('is-drag-over'); });
    root.querySelectorAll('.kanban-card').forEach(function (c) {
      c.classList.remove('drop-before', 'drop-after');
    });
  }

  root.querySelectorAll('.kanban-card').forEach(function (cardEl) {
    cardEl.addEventListener('dragstart', function (e) {
      uiState.draggedCardId = cardEl.dataset.cardId;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', cardEl.dataset.cardId);
      requestAnimationFrame(function () {
        cardEl.classList.add('is-dragging');
      });
    });

    cardEl.addEventListener('dragend', function () {
      uiState.draggedCardId = null;
      cardEl.classList.remove('is-dragging');
      clearDropHints();
    });

    cardEl.addEventListener('dragover', function (e) {
      if (!uiState.draggedCardId || uiState.draggedCardId === cardEl.dataset.cardId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = cardEl.getBoundingClientRect();
      const isTopHalf = e.clientY < rect.top + rect.height / 2;
      root.querySelectorAll('.kanban-card').forEach(function (c) {
        if (c !== cardEl) c.classList.remove('drop-before', 'drop-after');
      });
      cardEl.classList.toggle('drop-before', isTopHalf);
      cardEl.classList.toggle('drop-after', !isTopHalf);
    });

    cardEl.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      const draggedId = uiState.draggedCardId || e.dataTransfer.getData('text/plain');
      const targetId = cardEl.dataset.cardId;
      const colEl = cardEl.closest('.kanban-column');
      if (!draggedId || !colEl) return;

      const rect = cardEl.getBoundingClientRect();
      const insertBefore = e.clientY < rect.top + rect.height / 2;
      moveKanbanCard(draggedId, colEl.dataset.columnStatus, targetId, insertBefore);
    });
  });

  root.querySelectorAll('.kanban-column').forEach(function (colEl) {
    colEl.addEventListener('dragover', function (e) {
      if (!uiState.draggedCardId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      colEl.classList.add('is-drag-over');
    });

    colEl.addEventListener('dragleave', function (e) {
      if (!colEl.contains(e.relatedTarget)) {
        colEl.classList.remove('is-drag-over');
      }
    });

    colEl.addEventListener('drop', function (e) {
      e.preventDefault();
      const draggedId = uiState.draggedCardId || e.dataTransfer.getData('text/plain');
      if (!draggedId) return;
      moveKanbanCard(draggedId, colEl.dataset.columnStatus, null, false);
    });
  });
}

function moveKanbanCard(cardId, newStatus, targetCardId, insertBefore) {
  const list = appState.data.kanban;
  const fromIdx = list.findIndex(function (c) { return c.id === cardId; });
  if (fromIdx === -1) return;

  const card = list.splice(fromIdx, 1)[0];
  card.status = newStatus;

  if (targetCardId && targetCardId !== cardId) {
    const targetIdx = list.findIndex(function (c) { return c.id === targetCardId; });
    if (targetIdx !== -1) {
      list.splice(insertBefore ? targetIdx : targetIdx + 1, 0, card);
    } else {
      list.push(card);
    }
  } else {
    list.push(card);
  }

  saveState();
  requestRender();
}

export function openKanbanModal(card, defaultStatus) {
  const isEdit = Boolean(card);
  const statusVal = isEdit ? card.status : (defaultStatus || 'todo');
  const priorityVal = isEdit ? card.priority : 'medium';

  const bodyHtml =
    '<div class="form-field">' +
      '<label class="form-label" for="kbTitle">Title <span class="req">*</span></label>' +
      '<input id="kbTitle" class="form-input" type="text" maxlength="140" value="' + escapeHtml(isEdit ? card.title : '') + '" placeholder="What needs to be done?">' +
    '</div>' +
    '<div class="form-row">' +
      '<div class="form-field">' +
        '<label class="form-label" for="kbStatus">Column</label>' +
        '<select id="kbStatus" class="form-select">' +
          KANBAN_COLUMNS.map(function (col) {
            return '<option value="' + col.id + '"' + (statusVal === col.id ? ' selected' : '') + '>' + col.label + '</option>';
          }).join('') +
        '</select>' +
      '</div>' +
      '<div class="form-field">' +
        '<label class="form-label" for="kbPriority">Priority</label>' +
        '<select id="kbPriority" class="form-select">' +
          PRIORITIES.map(function (p) {
            return '<option value="' + p + '"' + (priorityVal === p ? ' selected' : '') + '>' + capitalize(p) + '</option>';
          }).join('') +
        '</select>' +
      '</div>' +
    '</div>' +
    '<div class="form-field">' +
      '<label class="form-label" for="kbDueDate">Due Date (optional)</label>' +
      '<input id="kbDueDate" class="form-input" type="date" value="' + escapeHtml(isEdit ? (card.dueDate || '') : '') + '">' +
    '</div>' +
    '<div class="form-field">' +
      '<label class="form-label" for="kbNotes">Notes</label>' +
      '<textarea id="kbNotes" class="form-textarea" placeholder="Add context, steps, or details...">' + escapeHtml(isEdit ? (card.notes || '') : '') + '</textarea>' +
    '</div>';

  openFormModal({
    title: isEdit ? 'Edit Kanban Card' : 'New Kanban Card',
    submitLabel: isEdit ? 'Save Changes' : 'Create Card',
    bodyHtml: bodyHtml,
    onSubmit: function () {
      const title = document.getElementById('kbTitle').value.trim();
      const status = document.getElementById('kbStatus').value;
      const priority = document.getElementById('kbPriority').value;
      const dueDate = document.getElementById('kbDueDate').value.trim();
      const notes = document.getElementById('kbNotes').value.trim();

      if (!title) {
        setFormModalError('Please enter a card title.');
        return;
      }
      if (dueDate && !isValidDateString(dueDate)) {
        setFormModalError('Please enter a valid due date.');
        return;
      }

      if (isEdit) {
        card.title = title;
        card.status = status;
        card.priority = priority;
        card.dueDate = dueDate;
        card.notes = notes;
        showToast('Card updated', 'success');
      } else {
        appState.data.kanban.push({
          id: generateId(),
          title: title,
          notes: notes,
          priority: priority,
          dueDate: dueDate,
          status: status
        });
        showToast('Card created', 'success');
      }

      saveState();
      closeFormModal();
      requestRender();
    }
  });
}
