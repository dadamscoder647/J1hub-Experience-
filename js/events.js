const RSVP_STORAGE_KEY = 'events:rsvp';
const USER_STORAGE_KEY = 'events:userId';
const FILTER_ORDER = ['after-10pm', 'free', 'legal/clinic', 'sports', 'late-night'];

const filterRow = document.getElementById('filterRow');
const eventsGrid = document.getElementById('eventsGrid');
const eventsSummary = document.getElementById('eventsSummary');
const qrModal = document.getElementById('qrModal');
const qrCloseButton = document.getElementById('qrClose');
const qrCanvas = document.getElementById('qrCanvas');
const qrPayloadEl = document.getElementById('qrPayload');
const qrTitle = document.getElementById('qrTitle');

const state = {
  events: [],
  eventsById: new Map(),
  filters: new Set(),
  rsvp: loadRsvpState(),
  userId: ensureUserId()
};

let lastFocusedElement = null;

bootstrap();

function bootstrap() {
  attachFilterHandler();
  attachEventHandler();
  attachModalHandlers();
  fetchEvents();
}

function fetchEvents() {
  fetch('data/events.json', { cache: 'no-cache' })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Unable to load events (status ${response.status})`);
      }
      return response.json();
    })
    .then((data) => {
      const sorted = [...data].sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
      );
      state.events = sorted;
      state.eventsById = new Map(sorted.map((event) => [event.id, event]));
      renderFilters(sorted);
      renderEvents();
    })
    .catch((error) => {
      console.error(error);
      eventsSummary.innerHTML = `<span role="alert">Could not load events. Please refresh to try again.</span>`;
      eventsGrid.innerHTML = '';
    });
}

function renderFilters(events) {
  const availableFilters = FILTER_ORDER.filter((tag) =>
    events.some((event) => event.tags && event.tags.includes(tag))
  );

  if (!availableFilters.length) {
    filterRow.textContent = '';
    return;
  }

  filterRow.innerHTML = availableFilters
    .map(
      (tag) => `
        <button class="filter-chip" type="button" data-filter="${tag}" aria-pressed="false">
          <span>${formatFilterLabel(tag)}</span>
        </button>`
    )
    .join('');
}

function renderEvents() {
  const { events, filters, rsvp } = state;
  const activeFilters = Array.from(filters);
  const filteredEvents = !activeFilters.length
    ? events
    : events.filter((event) => activeFilters.every((tag) => event.tags?.includes(tag)));

  updateSummary(filteredEvents.length, events.length, activeFilters);

  if (!filteredEvents.length) {
    eventsGrid.innerHTML = `
      <div class="empty-state">No events match the selected filters right now.</div>
    `;
    return;
  }

  const eventCards = filteredEvents
    .map((event) => {
      const startDate = new Date(event.start);
      const endDate = new Date(event.end);
      const isRsvped = Boolean(rsvp[event.id]);
      const actions = createActionsMarkup(event.id, isRsvped);
      const tags = (event.tags || [])
        .map((tag) => `<span class="event-tag">${formatFilterLabel(tag)}</span>`) 
        .join('');

      return `
        <article class="event-card" data-event-id="${event.id}">
          <h2>${escapeHtml(event.title)}</h2>
          <div class="event-meta">
            <span>${formatDateTimeRange(startDate, endDate)}</span>
            <span>${escapeHtml(event.venue)}</span>
          </div>
          <div class="event-tags">${tags}</div>
          <div class="event-actions">${actions}</div>
        </article>
      `;
    })
    .join('');

  eventsGrid.innerHTML = eventCards;
}

function createActionsMarkup(eventId, isRsvped) {
  const rsvpClasses = ['event-button', 'primary'];
  if (isRsvped) {
    rsvpClasses.push('is-rsvped');
  }

  const rsvpLabel = isRsvped ? 'RSVP’d' : 'RSVP';
  const rsvpAriaPressed = isRsvped ? 'true' : 'false';

  return `
    <button class="${rsvpClasses.join(' ')}" type="button" data-action="rsvp" aria-pressed="${rsvpAriaPressed}">
      ${rsvpLabel}
    </button>
    <button class="event-button" type="button" data-action="ics">Add to Calendar</button>
    <button class="event-button" type="button" data-action="qr">My Event QR</button>
  `;
}

function updateSummary(visibleCount, totalCount, activeFilters) {
  const filterLabel = activeFilters.length
    ? `Active filters: ${activeFilters.map((tag) => formatFilterLabel(tag)).join(', ')}`
    : 'No filters applied';
  eventsSummary.innerHTML = `
    <span>Showing ${visibleCount} of ${totalCount} events</span>
    <span>${filterLabel}</span>
  `;
}

function attachFilterHandler() {
  filterRow.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-filter]');
    if (!button) return;

    const filter = button.dataset.filter;
    if (state.filters.has(filter)) {
      state.filters.delete(filter);
      button.classList.remove('is-active');
      button.setAttribute('aria-pressed', 'false');
    } else {
      state.filters.add(filter);
      button.classList.add('is-active');
      button.setAttribute('aria-pressed', 'true');
    }

    renderEvents();
  });
}

function attachEventHandler() {
  eventsGrid.addEventListener('click', (event) => {
    const actionButton = event.target.closest('button[data-action]');
    if (!actionButton) return;

    const card = actionButton.closest('[data-event-id]');
    if (!card) return;

    const eventId = card.dataset.eventId;
    const eventData = state.eventsById.get(eventId);
    if (!eventData) return;

    switch (actionButton.dataset.action) {
      case 'rsvp':
        handleRsvp(eventId, actionButton);
        break;
      case 'ics':
        downloadIcs(eventData);
        break;
      case 'qr':
        openQrModal(eventData, actionButton);
        break;
      default:
        break;
    }
  });
}

function handleRsvp(eventId, button) {
  if (state.rsvp[eventId]) {
    return;
  }

  state.rsvp[eventId] = true;
  persistRsvpState();
  button.classList.add('is-rsvped');
  button.textContent = 'RSVP’d';
  button.setAttribute('aria-pressed', 'true');
}

function downloadIcs(eventData) {
  const icsContent = createIcs(eventData, state.userId);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const downloadLink = document.createElement('a');
  downloadLink.href = url;
  downloadLink.download = `${eventData.id}.ics`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  URL.revokeObjectURL(url);
}

function createIcs(eventData, userId) {
  const dtStamp = formatIcsDate(new Date());
  const dtStart = formatIcsDate(new Date(eventData.start));
  const dtEnd = formatIcsDate(new Date(eventData.end));
  const uid = `${eventData.id}-${userId}`;
  const description = `RSVP via J1hub. Check-in with QR code for ${userId}.`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//J1hub Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeIcs(uid)}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcs(eventData.title)}`,
    `LOCATION:${escapeIcs(eventData.venue || '')}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

function openQrModal(eventData, triggerButton) {
  lastFocusedElement = triggerButton;
  const payload = JSON.stringify(
    {
      type: 'checkin',
      event: eventData.id,
      user: state.userId
    },
    null,
    2
  );

  qrTitle.textContent = `Check-in QR — ${eventData.title}`;
  qrPayloadEl.textContent = payload;
  qrCanvas.innerHTML = '';

  if (typeof QRCode === 'function') {
    new QRCode(qrCanvas, {
      text: payload,
      width: 220,
      height: 220,
      correctLevel: QRCode.CorrectLevel.M
    });
  } else {
    qrCanvas.textContent = 'QR library missing. Please reload the page.';
  }

  qrModal.classList.add('is-visible');
  qrModal.setAttribute('aria-hidden', 'false');
  qrCloseButton.focus();
}

function closeQrModal() {
  qrModal.classList.remove('is-visible');
  qrModal.setAttribute('aria-hidden', 'true');
  qrCanvas.innerHTML = '';
  qrPayloadEl.textContent = '';
  if (lastFocusedElement) {
    lastFocusedElement.focus();
    lastFocusedElement = null;
  }
}

function attachModalHandlers() {
  qrCloseButton.addEventListener('click', closeQrModal);
  qrModal.addEventListener('click', (event) => {
    if (event.target === qrModal) {
      closeQrModal();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && qrModal.classList.contains('is-visible')) {
      closeQrModal();
    }
  });
}

function formatDateTimeRange(start, end) {
  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  });

  const sameDay = start.toDateString() === end.toDateString();
  const dateLabel = dateFormatter.format(start);
  const startTime = timeFormatter.format(start);
  const endTime = timeFormatter.format(end);

  if (sameDay) {
    return `${dateLabel} • ${startTime} – ${endTime}`;
  }

  const endDateLabel = dateFormatter.format(end);
  return `${dateLabel} ${startTime} → ${endDateLabel} ${endTime}`;
}

function formatIcsDate(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return (
    date.getFullYear().toString() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    'T' +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

function formatFilterLabel(tag) {
  return tag.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function escapeHtml(value) {
  const stringValue = value == null ? '' : String(value);
  return stringValue
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeIcs(value) {
  const stringValue = value == null ? '' : String(value);
  return stringValue
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function loadRsvpState() {
  try {
    const stored = localStorage.getItem(RSVP_STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn('Unable to parse RSVP state', error);
    return {};
  }
}

function persistRsvpState() {
  try {
    localStorage.setItem(RSVP_STORAGE_KEY, JSON.stringify(state.rsvp));
  } catch (error) {
    console.warn('Unable to persist RSVP state', error);
  }
}

function ensureUserId() {
  let userId = localStorage.getItem(USER_STORAGE_KEY);
  if (userId) {
    return userId;
  }

  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    userId = `anon-${window.crypto.randomUUID()}`;
  } else {
    userId = `anon-${Math.random().toString(36).slice(2, 11)}`;
  }

  try {
    localStorage.setItem(USER_STORAGE_KEY, userId);
  } catch (error) {
    console.warn('Unable to persist user id', error);
  }

  return userId;
}
