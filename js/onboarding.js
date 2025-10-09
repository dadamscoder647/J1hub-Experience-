const hub = (window.J1Hub = window.J1Hub || {});
const router = window.__J1Router || {};

const FALLBACK_TRANSLATIONS = {
  'onboarding.resume': 'Resume Orientation',
  'onboarding.title': 'Orientation — Week 1',
  'onboarding.progress': '{completed} of {total} completed',
  'onboarding.add_to_calendar': 'Add to Calendar',
  'onboarding.estimate': '≈ {minutes} min',
  'onboarding.close': 'Close',
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1")]';

let resumeButtonEl;
let backdropEl;
let modalEl;
let titleEl;
let progressEl;
let taskListEl;
let closeButtonEl;
let checklistData = null;
let completedTasks = new Set();
let taskNodeRegistry = new Map();
let propertyCode = 'DEFAULT';
let shouldAutoOpen = false;
let autoOpenHandled = false;
let previousFocus = null;
let isModalOpen = false;

function translate(key, replacements = {}) {
  if (typeof hub.translate === 'function') {
    const translated = hub.translate(key, replacements);
    if (translated && translated !== key) {
      return translated;
    }
  }
  const fallback = FALLBACK_TRANSLATIONS[key];
  if (!fallback) {
    return key;
  }
  return fallback.replace(/\{(\w+)\}/g, (_, token) => {
    return Object.prototype.hasOwnProperty.call(replacements, token)
      ? replacements[token]
      : `{${token}}`;
  });
}

function getStoredProperty() {
  if (router.propFromUrl) {
    return router.propFromUrl;
  }
  try {
    const stored = localStorage.getItem('prop');
    if (stored) {
      return stored.toUpperCase();
    }
  } catch (error) {
    // Ignore storage errors
  }
  return 'DEFAULT';
}

function getCompletedKey() {
  return `onboarding.${propertyCode}.completed`;
}

function getSeenKey() {
  return `onboarding.${propertyCode}.seen`;
}

function loadCompletedTasks() {
  try {
    const raw = localStorage.getItem(getCompletedKey());
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.warn('Unable to parse onboarding progress', error);
  }
  return [];
}

function persistCompletedTasks() {
  try {
    const serialized = JSON.stringify(Array.from(completedTasks));
    localStorage.setItem(getCompletedKey(), serialized);
  } catch (error) {
    console.warn('Unable to persist onboarding progress', error);
  }
}

function hasSeenChecklist() {
  try {
    return localStorage.getItem(getSeenKey()) === 'true';
  } catch (error) {
    return false;
  }
}

function markChecklistSeen() {
  try {
    localStorage.setItem(getSeenKey(), 'true');
  } catch (error) {
    // ignore
  }
}

function formatIcsDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function buildIcsDataUrl(task) {
  const now = new Date();
  const startDate = new Date(now.getTime() + 5 * 60 * 1000);
  const durationMinutes = Number.isFinite(task.est_min) ? Number(task.est_min) : 15;
  const endDate = new Date(startDate.getTime() + Math.max(durationMinutes, 1) * 60 * 1000);
  const dtStamp = formatIcsDate(now);
  const dtStart = formatIcsDate(startDate);
  const dtEnd = formatIcsDate(endDate);
  const summary = escapeIcsText(`J1Hub: ${task.label}`);
  const description = escapeIcsText(checklistData?.title || translate('onboarding.title'));
  const uid = `${task.id}-${propertyCode}-${startDate.getTime()}@j1hub.local`;
  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//J1Hub//Onboarding//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `UID:${uid}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(icsContent)}`;
}

function updateProgressText() {
  if (!progressEl || !checklistData) {
    return;
  }
  const total = Array.isArray(checklistData.tasks) ? checklistData.tasks.length : 0;
  const completedCount = completedTasks.size;
  progressEl.textContent = translate('onboarding.progress', {
    completed: completedCount,
    total,
  });
}

function updateTaskTranslations() {
  taskNodeRegistry.forEach((node) => {
    if (node.estimateEl) {
      node.estimateEl.textContent = translate('onboarding.estimate', {
        minutes: node.task.est_min ?? 15,
      });
    }
    if (node.calendarLink) {
      node.calendarLink.textContent = translate('onboarding.add_to_calendar');
      node.calendarLink.setAttribute(
        'aria-label',
        `${translate('onboarding.add_to_calendar')} – ${node.task.label}`
      );
    }
  });
}

function applyTranslations() {
  if (resumeButtonEl) {
    resumeButtonEl.textContent = translate('onboarding.resume');
  }
  if (closeButtonEl) {
    closeButtonEl.textContent = translate('onboarding.close');
  }
  if (titleEl) {
    const translatedTitle = translate('onboarding.title');
    titleEl.textContent = translatedTitle && translatedTitle !== 'onboarding.title'
      ? translatedTitle
      : checklistData?.title || FALLBACK_TRANSLATIONS['onboarding.title'];
  }
  updateProgressText();
  updateTaskTranslations();
}

function renderTasks() {
  if (!taskListEl || !checklistData) {
    return;
  }
  taskNodeRegistry.clear();
  taskListEl.innerHTML = '';
  const tasks = Array.isArray(checklistData.tasks) ? checklistData.tasks : [];
  tasks.forEach((task) => {
    const listItem = document.createElement('li');
    listItem.className = 'onboarding-task';
    listItem.dataset.taskId = task.id;

    const header = document.createElement('div');
    header.className = 'onboarding-task-header';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    const checkboxId = `onboarding-${task.id}`;
    checkbox.id = checkboxId;
    checkbox.checked = completedTasks.has(task.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        completedTasks.add(task.id);
      } else {
        completedTasks.delete(task.id);
      }
      persistCompletedTasks();
      updateProgressText();
    });

    const label = document.createElement('label');
    label.setAttribute('for', checkboxId);
    label.textContent = task.label;

    const estimate = document.createElement('small');
    estimate.textContent = translate('onboarding.estimate', {
      minutes: task.est_min ?? 15,
    });

    header.appendChild(checkbox);
    header.appendChild(label);
    header.appendChild(estimate);

    const actions = document.createElement('div');
    actions.className = 'onboarding-actions';

    const calendarLink = document.createElement('a');
    calendarLink.href = buildIcsDataUrl(task);
    calendarLink.download = `J1Hub-${task.id}.ics`;
    calendarLink.textContent = translate('onboarding.add_to_calendar');
    calendarLink.setAttribute(
      'aria-label',
      `${translate('onboarding.add_to_calendar')} – ${task.label}`
    );
    calendarLink.addEventListener('click', () => {
      calendarLink.href = buildIcsDataUrl(task);
    });

    actions.appendChild(calendarLink);

    listItem.appendChild(header);
    listItem.appendChild(actions);
    taskListEl.appendChild(listItem);

    taskNodeRegistry.set(task.id, {
      task,
      estimateEl: estimate,
      calendarLink,
    });
  });
  updateProgressText();
}

function getFocusableElements() {
  if (!modalEl) {
    return [];
  }
  return Array.from(modalEl.querySelectorAll(FOCUSABLE_SELECTOR)).filter((element) => {
    return !(element instanceof HTMLElement) || !element.hasAttribute('disabled');
  });
}

function handleKeyDown(event) {
  if (!isModalOpen) {
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    closeModal();
    return;
  }
  if (event.key === 'Tab') {
    const focusable = getFocusableElements();
    if (focusable.length === 0) {
      event.preventDefault();
      modalEl.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}

function openModal() {
  if (!checklistData || !backdropEl || !modalEl || isModalOpen) {
    return;
  }
  isModalOpen = true;
  markChecklistSeen();
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  backdropEl.hidden = false;
  document.body.setAttribute('data-onboarding-open', 'true');
  document.body.style.overflow = 'hidden';
  const focusable = getFocusableElements();
  const target = focusable[0] || modalEl;
  target.focus();
  document.addEventListener('keydown', handleKeyDown);
}

function closeModal() {
  if (!isModalOpen || !backdropEl || !modalEl) {
    return;
  }
  isModalOpen = false;
  backdropEl.hidden = true;
  document.body.removeAttribute('data-onboarding-open');
  document.body.style.removeProperty('overflow');
  document.removeEventListener('keydown', handleKeyDown);
  if (previousFocus && typeof previousFocus.focus === 'function') {
    previousFocus.focus();
  } else if (resumeButtonEl) {
    resumeButtonEl.focus();
  }
}

function createModalShell() {
  if (backdropEl) {
    return;
  }
  backdropEl = document.createElement('div');
  backdropEl.className = 'onboarding-backdrop';
  backdropEl.hidden = true;

  modalEl = document.createElement('div');
  modalEl.className = 'onboarding-modal';
  modalEl.id = 'onboarding-dialog';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.setAttribute('aria-labelledby', 'onboarding-title');
  modalEl.setAttribute('tabindex', '-1');

  const headerEl = document.createElement('header');

  titleEl = document.createElement('h2');
  titleEl.id = 'onboarding-title';
  headerEl.appendChild(titleEl);

  modalEl.appendChild(headerEl);

  const mainEl = document.createElement('main');
  progressEl = document.createElement('p');
  progressEl.className = 'onboarding-progress';
  progressEl.setAttribute('aria-live', 'polite');
  mainEl.appendChild(progressEl);

  taskListEl = document.createElement('ul');
  taskListEl.className = 'onboarding-task-list';
  mainEl.appendChild(taskListEl);

  modalEl.appendChild(mainEl);

  const footerEl = document.createElement('footer');
  closeButtonEl = document.createElement('button');
  closeButtonEl.type = 'button';
  closeButtonEl.className = 'onboarding-close';
  closeButtonEl.addEventListener('click', closeModal);
  footerEl.appendChild(closeButtonEl);
  modalEl.appendChild(footerEl);

  backdropEl.appendChild(modalEl);
  backdropEl.addEventListener('click', (event) => {
    if (event.target === backdropEl) {
      closeModal();
    }
  });

  document.body.appendChild(backdropEl);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load ${url} (${response.status})`);
  }
  return response.json();
}

async function loadChecklistData() {
  const targetUrl = `data/onboarding.${propertyCode}.json`;
  try {
    return await fetchJson(targetUrl);
  } catch (error) {
    if (propertyCode !== 'DEFAULT') {
      try {
        return await fetchJson('data/onboarding.DEFAULT.json');
      } catch (fallbackError) {
        throw fallbackError;
      }
    }
    throw error;
  }
}

function considerAutoOpen() {
  if (shouldAutoOpen && !autoOpenHandled && checklistData) {
    autoOpenHandled = true;
    openModal();
  }
}

async function initializeChecklist() {
  try {
    checklistData = await loadChecklistData();
    renderTasks();
    applyTranslations();
    resumeButtonEl.disabled = false;
    resumeButtonEl.removeAttribute('aria-disabled');
    considerAutoOpen();
  } catch (error) {
    console.error('Failed to load onboarding checklist', error);
    resumeButtonEl.disabled = true;
    resumeButtonEl.setAttribute('aria-disabled', 'true');
  }
}

function init() {
  resumeButtonEl = document.getElementById('resume-orientation');
  if (!resumeButtonEl) {
    return;
  }
  resumeButtonEl.disabled = true;
  resumeButtonEl.setAttribute('aria-disabled', 'true');
  resumeButtonEl.setAttribute('aria-haspopup', 'dialog');

  propertyCode = getStoredProperty();
  completedTasks = new Set(loadCompletedTasks());
  shouldAutoOpen = Boolean(router.propFromUrl) || !hasSeenChecklist();

  createModalShell();
  applyTranslations();

  resumeButtonEl.setAttribute('aria-controls', 'onboarding-dialog');
  resumeButtonEl.addEventListener('click', () => {
    if (!checklistData) {
      return;
    }
    openModal();
  });

  if (typeof hub.onLanguageChange === 'function') {
    hub.onLanguageChange(() => {
      applyTranslations();
    });
  }

  initializeChecklist();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export {};
