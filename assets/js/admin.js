const RSVP_STORAGE_KEY = 'events:rsvp';
const ANALYTICS_STORAGE_KEY = 'admin:hitSheetUrl';

const onboardingTableBody = document.getElementById('onboarding-table-body');
const onboardingEmptyState = document.getElementById('onboarding-empty');
const onboardingErrorState = document.getElementById('onboarding-error');
const onboardingSummary = document.getElementById('onboarding-summary');

const eventsList = document.getElementById('events-list');
const eventsSummary = document.getElementById('events-summary');
const eventsError = document.getElementById('events-error');

const scanAnalyticsLink = document.getElementById('scan-analytics-link');
const scanAnalyticsInput = document.getElementById('scan-analytics-url');
const checkinReadmeLink = document.getElementById('checkin-readme-link');

const statusRegion = document.getElementById('dashboard-status');

document.addEventListener('DOMContentLoaded', () => {
  renderOnboardingTile();
  renderEventsTile();
  hydrateScanAnalyticsTile();
  hydrateCheckinTile();
  attachCopyHandlers();
});

function renderOnboardingTile() {
  if (!onboardingTableBody) {
    return;
  }

  clearChildren(onboardingTableBody);
  hide(onboardingEmptyState);
  hide(onboardingErrorState);

  const result = readOnboardingStats();

  if (result.error) {
    show(onboardingErrorState);
    onboardingErrorState.textContent = result.error;
    announce(result.error);
    return;
  }

  const stats = result.stats;

  if (!stats.length) {
    show(onboardingEmptyState);
    onboardingSummary.textContent = 'No onboarding completions saved in localStorage yet.';
    return;
  }

  const fragment = document.createDocumentFragment();

  stats.forEach((entry) => {
    const row = document.createElement('tr');

    const propertyCell = document.createElement('td');
    propertyCell.textContent = entry.property;
    propertyCell.setAttribute('data-label', 'Property');

    const completedCell = document.createElement('td');
    completedCell.textContent = String(entry.completedCount);
    completedCell.setAttribute('data-label', 'Tasks completed');

    const seenCell = document.createElement('td');
    seenCell.textContent = entry.hasSeen ? 'Yes' : 'No';
    seenCell.setAttribute('data-label', 'Checklist opened');

    row.appendChild(propertyCell);
    row.appendChild(completedCell);
    row.appendChild(seenCell);

    fragment.appendChild(row);
  });

  onboardingTableBody.appendChild(fragment);
  onboardingSummary.textContent = `${stats.length} properties with onboarding data detected.`;
}

function readOnboardingStats() {
  if (typeof window === 'undefined' || !('localStorage' in window)) {
    return { stats: [], error: 'Storage unavailable in this environment.' };
  }

  try {
    const prefix = 'onboarding.';
    const suffix = '.completed';
    const statsByProperty = new Map();
    const length = window.localStorage.length;

    for (let index = 0; index < length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.startsWith(prefix) || !key.endsWith(suffix)) {
        continue;
      }

      const propertyCode = key.slice(prefix.length, -suffix.length);
      let completedCount = 0;

      try {
        const raw = window.localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            completedCount = parsed.length;
          }
        }
      } catch (error) {
        console.warn('Unable to parse onboarding completions', error);
      }

      const normalizedProperty = propertyCode.toUpperCase();
      const existing = statsByProperty.get(normalizedProperty) || { completedCount: 0, hasSeen: false };
      existing.completedCount = Math.max(existing.completedCount, completedCount);
      statsByProperty.set(normalizedProperty, existing);
    }

    statsByProperty.forEach((value, property) => {
      const seenKey = `onboarding.${property}.seen`;
      try {
        value.hasSeen = window.localStorage.getItem(seenKey) === 'true';
      } catch (error) {
        value.hasSeen = false;
      }
    });

    const stats = Array.from(statsByProperty.entries())
      .map(([property, value]) => ({ property, ...value }))
      .sort((a, b) => a.property.localeCompare(b.property));

    return { stats };
  } catch (error) {
    console.warn('Unable to load onboarding stats', error);
    return { stats: [], error: 'Unable to read onboarding progress from localStorage.' };
  }
}

async function renderEventsTile() {
  if (!eventsList) {
    return;
  }

  clearChildren(eventsList);
  hide(eventsError);
  hide(eventsSummary);

  const rsvpState = loadRsvpState();

  try {
    const response = await fetch('/assets/data/events.json', { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`Failed to load events (status ${response.status})`);
    }

    const events = await response.json();
    const thisWeeksEvents = filterEventsForCurrentWeek(events);

    if (!thisWeeksEvents.length) {
      eventsSummary.textContent = 'No events scheduled for this week in the local dataset yet.';
      show(eventsSummary);
      announce(eventsSummary.textContent);
      return;
    }

    const rsvpedEvents = thisWeeksEvents.filter((event) => Boolean(rsvpState[event.id]));

    eventsSummary.textContent = `${rsvpedEvents.length} of ${thisWeeksEvents.length} events RSVP’d on this device.`;
    show(eventsSummary);

    const fragment = document.createDocumentFragment();
    thisWeeksEvents.forEach((event) => {
      fragment.appendChild(renderEventListItem(event, Boolean(rsvpState[event.id])));
    });

    eventsList.appendChild(fragment);
  } catch (error) {
    console.warn('Unable to render events tile', error);
    show(eventsError);
    announce('Events data could not be loaded.');
  }
}

function filterEventsForCurrentWeek(events) {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  const currentDay = startOfWeek.getDay();
  const diffToMonday = (currentDay + 6) % 7;
  startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  return events.filter((event) => {
    const start = new Date(event.start);
    if (Number.isNaN(start.getTime())) {
      return false;
    }
    return start >= startOfWeek && start < endOfWeek;
  });
}

function renderEventListItem(event, isRsvped) {
  const listItem = document.createElement('li');

  const title = document.createElement('span');
  title.className = 'event-title';
  title.textContent = event.title || 'Untitled event';

  const meta = document.createElement('div');
  meta.className = 'event-meta';
  const formattedStart = formatEventDate(event.start);
  const venue = event.venue ? String(event.venue) : 'Venue TBA';
  const rsvpLabel = isRsvped ? 'RSVP’d here' : 'Not RSVP’d yet';

  const dateSpan = document.createElement('span');
  dateSpan.textContent = formattedStart;

  const venueSpan = document.createElement('span');
  venueSpan.textContent = venue;

  const rsvpSpan = document.createElement('span');
  rsvpSpan.textContent = rsvpLabel;

  meta.appendChild(dateSpan);
  meta.appendChild(venueSpan);
  meta.appendChild(rsvpSpan);

  listItem.appendChild(title);
  listItem.appendChild(meta);

  return listItem;
}

function formatEventDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown date';
  }

  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  return `${dateFormatter.format(date)} · ${timeFormatter.format(date)}`;
}

function loadRsvpState() {
  if (typeof window === 'undefined' || !('localStorage' in window)) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(RSVP_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  } catch (error) {
    console.warn('Unable to parse RSVP storage', error);
    return {};
  }
}

function hydrateScanAnalyticsTile() {
  const fallbackUrl = 'https://docs.google.com/spreadsheets/';
  const configUrl = document.body?.dataset.hitSheetUrl || '';
  const storedUrl = readLocalValue(ANALYTICS_STORAGE_KEY);
  const url = storedUrl || configUrl || fallbackUrl;

  if (scanAnalyticsInput) {
    scanAnalyticsInput.value = url;
  }

  if (scanAnalyticsLink) {
    if (url && url !== '#') {
      scanAnalyticsLink.href = url;
      scanAnalyticsLink.removeAttribute('aria-disabled');
    } else {
      scanAnalyticsLink.href = '#';
      scanAnalyticsLink.setAttribute('aria-disabled', 'true');
    }
  }
}

function hydrateCheckinTile() {
  const configuredUrl = document.body?.dataset.checkinReadme;
  if (checkinReadmeLink && configuredUrl) {
    checkinReadmeLink.href = configuredUrl;
  }
}

function attachCopyHandlers() {
  const copyButtons = document.querySelectorAll('[data-copy-target]');
  copyButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const targetId = button.getAttribute('data-copy-target');
      if (!targetId) {
        return;
      }

      const input = document.getElementById(targetId);
      if (!input) {
        return;
      }

      const textToCopy = input.value;
      if (!textToCopy) {
        announce('Nothing to copy yet.');
        return;
      }

      const success = await copyToClipboard(textToCopy, input);
      if (success) {
        announce('Link copied to clipboard.');
      } else {
        announce('Copy failed. Select the text and copy manually.');
      }
    });
  });
}

async function copyToClipboard(text, input) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.warn('Clipboard API failed, trying fallback', error);
    }
  }

  try {
    const wasReadOnly = input.hasAttribute('readonly');
    if (wasReadOnly) {
      input.removeAttribute('readonly');
    }
    input.select();
    const successful = document.execCommand('copy');
    input.setSelectionRange(0, 0);
    if (wasReadOnly) {
      input.setAttribute('readonly', '');
    }
    return successful;
  } catch (error) {
    console.warn('Fallback clipboard copy failed', error);
    return false;
  }
}

function readLocalValue(key) {
  if (typeof window === 'undefined' || !('localStorage' in window)) {
    return '';
  }

  try {
    return window.localStorage.getItem(key) || '';
  } catch (error) {
    return '';
  }
}

function hide(element) {
  if (element) {
    element.hidden = true;
  }
}

function show(element) {
  if (element) {
    element.hidden = false;
  }
}

function clearChildren(element) {
  if (!element) {
    return;
  }

  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function announce(message) {
  if (!statusRegion) {
    return;
  }
  statusRegion.textContent = message;
}
