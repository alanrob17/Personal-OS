import { APP_ID, APP_VERSION, STORAGE_KEY, ICONS } from './constants.js';

export function getDefaultTheme() {
  return (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
    ? 'dark'
    : 'light';
}

export function createEmptyState() {
  return {
    settings: {
      theme: getDefaultTheme()
    },
    data: {
      kanban: [],
      calendar: [],
      subscriptions: [],
      goals: []
    }
  };
}

// Persisted application state (kept as a single const object reference so all ES module imports see live updates)
export const appState = createEmptyState();

// Transient UI state (not persisted in backup)
export const uiState = {
  activeView: 'dashboard',
  kanbanPriorityFilter: 'all',
  calendarYear: new Date().getFullYear(),
  calendarMonth: new Date().getMonth(),
  calendarSelectedDate: null,
  calendarAgendaTab: 'upcoming', // 'upcoming' | 'selected' | 'all'
  subCategoryFilter: 'all',
  subSortBy: 'renewal', // 'renewal' | 'cost' | 'name'
  goalFilter: 'all', // 'all' | 'active' | 'completed'
  searchResults: [],
  searchActiveIndex: -1,
  draggedCardId: null
};

// Callback hooks registered at startup to keep the module dependency graph strictly acyclic
let renderHandler = null;
let navigateHandler = null;
let storageErrorHandler = null;
let saveQueue = Promise.resolve();

export function isTauriRuntime() {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function')
  );
}

function invokeTauri(cmd, args) {
  return window.__TAURI__.core.invoke(cmd, args);
}

export function setRenderHandler(fn) {
  renderHandler = fn;
}

export function requestRender() {
  if (typeof renderHandler === 'function') {
    renderHandler();
  }
}

export function setNavigateHandler(fn) {
  navigateHandler = fn;
}

export function navigateTo(view, options) {
  if (typeof navigateHandler === 'function') {
    navigateHandler(view, options);
  }
}

export function setStorageErrorHandler(fn) {
  storageErrorHandler = fn;
}

export function replaceAppState(nextState) {
  const settings = nextState && nextState.settings ? nextState.settings : {};
  const data = nextState && nextState.data ? nextState.data : {};

  appState.settings.theme = settings.theme === 'dark' ? 'dark' : 'light';
  appState.data.kanban = Array.isArray(data.kanban) ? data.kanban : [];
  appState.data.calendar = Array.isArray(data.calendar) ? data.calendar : [];
  appState.data.subscriptions = Array.isArray(data.subscriptions) ? data.subscriptions : [];
  appState.data.goals = Array.isArray(data.goals) ? data.goals : [];
}

function isValidStatePayload(payload, validatorFn) {
  if (!payload) return false;
  return typeof validatorFn === 'function'
    ? validatorFn(payload, { allowMissingExportMeta: true }).valid
    : Boolean(payload.settings && payload.data);
}

function loadFromLocalStorage(validatorFn) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidStatePayload(parsed, validatorFn)) return null;
    return {
      settings: { theme: parsed.settings.theme },
      data: {
        kanban: parsed.data.kanban,
        calendar: parsed.data.calendar,
        subscriptions: parsed.data.subscriptions,
        goals: parsed.data.goals
      }
    };
  } catch (err) {
    return null;
  }
}

function mirrorToLocalStorage(payload) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export async function loadState(validatorFn) {
  if (isTauriRuntime()) {
    try {
      const persisted = await invokeTauri('load_state');
      if (persisted !== null && persisted !== undefined) {
        if (isValidStatePayload(persisted, validatorFn)) {
          replaceAppState(persisted);
          try {
            mirrorToLocalStorage({
              app: APP_ID,
              version: APP_VERSION,
              settings: { theme: appState.settings.theme },
              data: appState.data
            });
          } catch (_) {}
          return;
        }
        replaceAppState(createEmptyState());
        return;
      }

      // Brand-new SQLite DB: migrate any existing localStorage data automatically
      const local = loadFromLocalStorage(validatorFn);
      if (local) {
        replaceAppState(local);
        saveState();
      } else {
        replaceAppState(createEmptyState());
      }
      return;
    } catch (err) {
      if (typeof storageErrorHandler === 'function') {
        storageErrorHandler('Unable to load SQLite database. Falling back to local storage.');
      }
    }
  }

  const local = loadFromLocalStorage(validatorFn);
  replaceAppState(local || createEmptyState());
}

export function saveState() {
  const payload = {
    app: APP_ID,
    version: APP_VERSION,
    settings: { theme: appState.settings.theme },
    data: appState.data
  };

  try {
    mirrorToLocalStorage(payload);
  } catch (err) {
    if (!isTauriRuntime() && typeof storageErrorHandler === 'function') {
      storageErrorHandler('Unable to save to localStorage. Storage may be full or restricted.');
    }
  }

  if (isTauriRuntime()) {
    const snapshot = JSON.parse(JSON.stringify(payload));
    saveQueue = saveQueue
      .then(function () {
        return invokeTauri('save_state', { state: snapshot });
      })
      .catch(function () {
        if (typeof storageErrorHandler === 'function') {
          storageErrorHandler('Unable to save to SQLite database.');
        }
      });
  }
}

export function flushPendingSaves() {
  return saveQueue;
}

export function getStorageInfo() {
  if (isTauriRuntime()) {
    return invokeTauri('get_db_info');
  }
  return Promise.resolve({ backend: 'localStorage', path: null });
}

export function applyTheme(theme) {
  const validTheme = theme === 'dark' ? 'dark' : 'light';
  appState.settings.theme = validTheme;
  document.documentElement.setAttribute('data-theme', validTheme);
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.innerHTML = validTheme === 'dark' ? ICONS.sun : ICONS.moon;
    btn.title = validTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    btn.setAttribute('aria-label', btn.title);
  }
}

export function toggleTheme() {
  applyTheme(appState.settings.theme === 'dark' ? 'light' : 'dark');
  saveState();
}
