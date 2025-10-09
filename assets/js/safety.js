import { t } from './lib/i18n.js';

const CONTACTS_KEY = 'j1hub_safety_contacts';
const SESSION_KEY = 'j1hub_safety_session';
const TAP_WINDOW_MS = 1200;

const FALLBACK_TEXT = {
  'safety.fab': 'Safety',
  'safety.safeWalk': 'SafeWalk',
  'safety.sos': 'SOS',
  'safety.minutes': '{minutes} min',
  'safety.start': 'Start SafeWalk',
  'safety.stop': 'Stop SafeWalk',
  'safety.contacts': 'Manage contacts',
  'safety.sendSOS': 'Send SOS',
  'safety.needHelp': 'Need help. Last known map: {mapUrl}'
};

let rootElement = null;
let fabButton = null;
let menuElement = null;
let countdownContainer = null;
let countdownTime = null;
let countdownContact = null;
let countdownCancelButton = null;
let toastElement = null;
let safeWalkModal = null;
let contactsModal = null;
let sosModal = null;

let contacts = [];
let activeSession = null;
let countdownInterval = null;
let tapHistory = [];
let openModalElement = null;
let lastFocusedElement = null;
const registeredSelects = new Set();

function formatTemplate(template, replacements = {}) {
  if (typeof template !== 'string') {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (_, token) => {
    return Object.prototype.hasOwnProperty.call(replacements, token)
      ? replacements[token]
      : `{${token}}`;
  });
}

async function translateValue(key, replacements = {}) {
  try {
    const translated = await t(key, replacements);
    if (translated && translated !== key) {
      return translated;
    }
  } catch (error) {
    console.warn(`safety: unable to translate ${key}`, error);
  }

  const fallback = FALLBACK_TEXT[key];
  if (fallback !== undefined) {
    return formatTemplate(fallback, replacements);
  }

  return formatTemplate(key, replacements);
}

function setTextWithTranslation(element, key, replacements = {}) {
  if (!element) {
    return Promise.resolve('');
  }
  element.dataset.i18nKey = key;
  const fallback = FALLBACK_TEXT[key];
  const fallbackValue = fallback !== undefined ? formatTemplate(fallback, replacements) : formatTemplate(key, replacements);
  element.textContent = fallbackValue;

  return translateValue(key, replacements)
    .then((value) => {
      element.textContent = value;
      return value;
    })
    .catch((error) => {
      console.warn(`safety: failed to apply translation for ${key}`, error);
      return fallbackValue;
    });
}

function loadContacts() {
  try {
    const stored = JSON.parse(localStorage.getItem(CONTACTS_KEY) || '[]');
    if (!Array.isArray(stored)) {
      return [];
    }
    return stored
      .filter((item) => item && typeof item === 'object' && item.name && item.phone)
      .slice(0, 3)
      .map((item) => ({
        id: item.id || `${item.phone}-${item.name}`,
        name: item.name,
        phone: item.phone,
      }));
  } catch (error) {
    console.error('Unable to read saved safety contacts', error);
    return [];
  }
}

function saveContacts(list) {
  const trimmed = list.slice(0, 3).map((contact) => ({
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
  }));
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(trimmed));
}

function loadSession() {
  try {
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (stored && stored.deadline && stored.contactPhone) {
      return stored;
    }
    return null;
  } catch (error) {
    console.error('Unable to read active SafeWalk session', error);
    return null;
  }
}

function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function formatTimeLeft(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

async function composeMessage(location) {
  let mapUrl = 'https://maps.google.com/';
  if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
    const roundedLat = location.lat.toFixed(5);
    const roundedLng = location.lng.toFixed(5);
    mapUrl = `https://maps.google.com/?q=${roundedLat},${roundedLng}`;
  }
  return translateValue('safety.needHelp', { mapUrl });
}

function tryGetLocation() {
  if (!('geolocation' in navigator)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => resolve(null),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      },
    );
  });
}

function ensureAnchor(uri) {
  const anchor = document.createElement('a');
  anchor.href = uri;
  anchor.rel = 'noopener noreferrer';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    if (anchor.parentElement) {
      anchor.parentElement.removeChild(anchor);
    }
  }, 0);
}

function showToast(message, fallbackLink) {
  if (!toastElement) {
    return;
  }
  toastElement.innerHTML = '';
  const paragraph = document.createElement('p');
  paragraph.textContent = message;
  toastElement.appendChild(paragraph);

  if (fallbackLink) {
    const fallback = document.createElement('p');
    fallback.innerHTML = `If nothing opens, <a href="${fallbackLink.href}">${fallbackLink.label}</a>.`;
    toastElement.appendChild(fallback);
  }

  toastElement.classList.add('is-visible');
  setTimeout(() => {
    toastElement.classList.remove('is-visible');
  }, 7000);
}

function openDistressMessage(contact, message) {
  const smsUri = contact && contact.phone
    ? `sms:${encodeURIComponent(contact.phone)}?&body=${encodeURIComponent(message)}`
    : `sms:?&body=${encodeURIComponent(message)}`;
  ensureAnchor(smsUri);
  const mailtoUri = `mailto:?subject=${encodeURIComponent('Emergency help needed')}&body=${encodeURIComponent(message)}`;
  showToast(
    contact && contact.name
      ? `Opening message to ${contact.name}.`
      : 'Opening your messaging app.',
    { href: mailtoUri, label: 'try email instead' },
  );
}

function stopCountdown(showNotice = false) {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  activeSession = null;
  clearSession();
  if (countdownContainer) {
    countdownContainer.classList.remove('is-active');
  }
  if (countdownTime) {
    countdownTime.textContent = '00:00';
    countdownTime.dateTime = 'PT0S';
  }
  if (countdownContact) {
    countdownContact.textContent = '';
  }
  if (showNotice) {
    showToast('SafeWalk cancelled. No messages were sent.');
  }
}

function updateCountdown() {
  if (!activeSession) {
    stopCountdown();
    return;
  }
  const remaining = activeSession.deadline - Date.now();
  if (remaining <= 0) {
    const sessionCopy = { ...activeSession };
    stopCountdown(false);
    openDistressMessage(
      { name: sessionCopy.contactName, phone: sessionCopy.contactPhone },
      sessionCopy.message,
    );
    return;
  }
  if (countdownTime) {
    const totalSeconds = Math.max(0, Math.floor(remaining / 1000));
    const isoMinutes = Math.floor(totalSeconds / 60);
    const isoSeconds = totalSeconds % 60;
    countdownTime.textContent = formatTimeLeft(remaining);
    countdownTime.dateTime = `PT${isoMinutes}M${isoSeconds}S`;
  }
  if (countdownContact) {
    countdownContact.textContent = `Checking in with ${activeSession.contactName}`;
  }
}

function startCountdown(session) {
  activeSession = session;
  saveSession(session);
  if (countdownContainer) {
    countdownContainer.classList.add('is-active');
  }
  updateCountdown();
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
  countdownInterval = setInterval(updateCountdown, 1000);
}

function createModal(id, titleConfig) {
  const overlay = document.createElement('div');
  overlay.className = 'safety-overlay';
  overlay.dataset.modalId = id;

  const modal = document.createElement('div');
  modal.className = 'safety-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', `${id}-title`);
  modal.tabIndex = -1;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'safety-close';
  close.setAttribute('aria-label', 'Close dialog');
  close.innerHTML = '&times;';
  close.addEventListener('click', () => closeModal(overlay));

  const header = document.createElement('header');
  const title = document.createElement('h2');
  title.id = `${id}-title`;
  if (titleConfig && typeof titleConfig === 'object') {
    const { key, fallback } = titleConfig;
    if (fallback) {
      title.textContent = fallback;
    }
    if (key) {
      setTextWithTranslation(title, key);
    }
  } else if (typeof titleConfig === 'string') {
    title.textContent = titleConfig;
  } else {
    title.textContent = '';
  }
  header.appendChild(title);

  modal.append(close, header);
  overlay.appendChild(modal);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeModal(overlay);
    }
  });

  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal(overlay);
    }
    if (event.key === 'Tab') {
      const focusables = Array.from(
        overlay.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('disabled'));
      if (!focusables.length) {
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  return { overlay, modal };
}

function openModal(overlay) {
  if (!overlay || overlay === openModalElement) {
    return;
  }
  if (openModalElement) {
    closeModal(openModalElement);
  }
  lastFocusedElement = document.activeElement;
  overlay.classList.add('is-visible');
  openModalElement = overlay;
  const focusTarget = overlay.querySelector('[data-initial-focus]') || overlay.querySelector('.safety-modal');
  setTimeout(() => {
    focusTarget?.focus();
  }, 0);
}

function closeModal(overlay) {
  if (!overlay) {
    return;
  }
  overlay.classList.remove('is-visible');
  if (overlay === openModalElement) {
    openModalElement = null;
  }
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
  }
}

function registerContactSelect(select, placeholderText) {
  if (!select) {
    return;
  }
  select.dataset.placeholder = placeholderText;
  registeredSelects.add(select);
  refreshContactSelect(select);
}

function refreshContactSelect(select) {
  if (!select) {
    return;
  }
  const placeholder = select.dataset.placeholder || 'Select a contact';
  const previousValue = select.value;
  select.innerHTML = '';

  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = contacts.length
    ? placeholder
    : 'Add a trusted contact to get started';
  placeholderOption.disabled = true;
  placeholderOption.selected = true;
  select.appendChild(placeholderOption);

  contacts.forEach((contact) => {
    const option = document.createElement('option');
    option.value = contact.id;
    option.textContent = `${contact.name} · ${contact.phone}`;
    if (contact.id === previousValue) {
      option.selected = true;
      placeholderOption.selected = false;
    }
    select.appendChild(option);
  });
}

function refreshAllSelects() {
  registeredSelects.forEach((select) => refreshContactSelect(select));
}

function notifyContactsChanged() {
  refreshAllSelects();
  if (rootElement) {
    const event = new CustomEvent('safety:contacts-updated');
    rootElement.dispatchEvent(event);
  }
}

function findContact(contactId) {
  return contacts.find((contact) => contact.id === contactId) || null;
}

function generateContactId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `contact-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function buildContactsModal() {
  const { overlay, modal } = createModal('safety-contacts', 'Trusted contacts');

  const intro = document.createElement('p');
  intro.textContent = 'Save up to three trusted contacts locally. Details stay on this device.';
  modal.appendChild(intro);

  const list = document.createElement('ul');
  list.className = 'safety-contact-list';
  modal.appendChild(list);

  const emptyState = document.createElement('p');
  emptyState.textContent = 'No contacts saved yet.';
  modal.appendChild(emptyState);

  const form = document.createElement('form');
  form.className = 'safety-contact-form';
  form.noValidate = true;

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.name = 'contact-name';
  nameInput.placeholder = 'Contact name';
  nameInput.required = true;
  nameInput.setAttribute('autocomplete', 'name');
  nameInput.setAttribute('aria-label', 'Contact name');

  const phoneInput = document.createElement('input');
  phoneInput.type = 'tel';
  phoneInput.name = 'contact-phone';
  phoneInput.placeholder = 'Mobile number (SMS)';
  phoneInput.required = true;
  phoneInput.setAttribute('autocomplete', 'tel');
  phoneInput.setAttribute('aria-label', 'Contact phone number');
  phoneInput.inputMode = 'tel';

  const errorMessage = document.createElement('p');
  errorMessage.className = 'safety-error';
  errorMessage.hidden = true;

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'safety-primary';
  submitButton.textContent = 'Save contact';
  submitButton.setAttribute('data-initial-focus', '');

  form.append(nameInput, phoneInput, submitButton, errorMessage);

  const limitNote = document.createElement('p');
  limitNote.textContent = 'Contacts are never uploaded. You can remove them anytime.';

  modal.append(form, limitNote);

  function renderList() {
    list.innerHTML = '';
    if (!contacts.length) {
      emptyState.hidden = false;
    } else {
      emptyState.hidden = true;
    }
    contacts.forEach((contact) => {
      const item = document.createElement('li');
      item.className = 'safety-contact-item';
      const info = document.createElement('span');
      info.textContent = `${contact.name} · ${contact.phone}`;
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.textContent = 'Remove';
      removeButton.addEventListener('click', () => {
        contacts = contacts.filter((entry) => entry.id !== contact.id);
        saveContacts(contacts);
        renderList();
        notifyContactsChanged();
      });
      item.append(info, removeButton);
      list.appendChild(item);
    });
  }

  renderList();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const phone = phoneInput.value.replace(/\s+/g, '');

    if (contacts.length >= 3) {
      errorMessage.textContent = 'You can only store three contacts.';
      errorMessage.hidden = false;
      return;
    }

    if (!name || !phone) {
      errorMessage.textContent = 'Enter a name and mobile number.';
      errorMessage.hidden = false;
      return;
    }

    if (!/^\+?[\d\-().\s]{5,}$/.test(phone)) {
      errorMessage.textContent = 'Enter a valid phone number (SMS capable).';
      errorMessage.hidden = false;
      return;
    }

    if (contacts.some((contact) => contact.phone === phone)) {
      errorMessage.textContent = 'That number is already saved.';
      errorMessage.hidden = false;
      return;
    }

    contacts.push({ id: generateContactId(), name, phone });
    saveContacts(contacts);
    nameInput.value = '';
    phoneInput.value = '';
    errorMessage.hidden = true;
    renderList();
    notifyContactsChanged();
  });

  return {
    overlay,
    open: () => openModal(overlay),
    close: () => closeModal(overlay),
    render: renderList,
  };
}

function buildSafeWalkModal() {
  const { overlay, modal } = createModal('safety-safewalk', { key: 'safety.start' });

  const intro = document.createElement('p');
  intro.textContent = 'Choose a timer and contact. We will remind you before silently opening your message if you do not check in.';
  modal.appendChild(intro);

  const consent = document.createElement('p');
  consent.textContent = 'We only ask for your location now. It stays on this device except inside your message.';
  modal.appendChild(consent);

  const durationGroup = document.createElement('div');
  durationGroup.className = 'safety-form-group';
  const durationLabel = document.createElement('p');
  durationLabel.textContent = 'SafeWalk duration';
  durationGroup.appendChild(durationLabel);

  const durationOptions = document.createElement('div');
  durationOptions.className = 'safety-duration-options';
  const durations = [5, 10, 20];
  durations.forEach((minutes, index) => {
    const label = document.createElement('label');
    label.className = 'safety-duration-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'safety-duration';
    input.value = String(minutes);
    if (index === 0) {
      input.checked = true;
    }
    const span = document.createElement('span');
    setTextWithTranslation(span, 'safety.minutes', { minutes });
    label.append(input, span);
    durationOptions.appendChild(label);
  });
  durationGroup.appendChild(durationOptions);
  modal.appendChild(durationGroup);

  const contactGroup = document.createElement('div');
  contactGroup.className = 'safety-form-group';
  const contactLabel = document.createElement('label');
  contactLabel.setAttribute('for', 'safety-contact-select');
  contactLabel.textContent = 'Send to';
  const contactSelect = document.createElement('select');
  contactSelect.id = 'safety-contact-select';
  contactSelect.className = 'safety-select';
  contactSelect.required = true;
  contactSelect.setAttribute('data-initial-focus', '');
  contactGroup.append(contactLabel, contactSelect);
  modal.appendChild(contactGroup);
  registerContactSelect(contactSelect, 'Choose a contact');

  const manageButton = document.createElement('button');
  manageButton.type = 'button';
  manageButton.className = 'safety-secondary';
  setTextWithTranslation(manageButton, 'safety.contacts');
  manageButton.addEventListener('click', () => {
    closeModal(overlay);
    contactsModal.open();
  });
  modal.appendChild(manageButton);

  const startButton = document.createElement('button');
  startButton.type = 'button';
  startButton.className = 'safety-primary';
  setTextWithTranslation(startButton, 'safety.start');
  modal.appendChild(startButton);

  function updateStartState() {
    startButton.disabled = !contactSelect.value;
  }

  contactSelect.addEventListener('change', updateStartState);
  updateStartState();

  startButton.addEventListener('click', async () => {
    if (!contactSelect.value) {
      contactSelect.focus();
      return;
    }
    const selectedContact = findContact(contactSelect.value);
    if (!selectedContact) {
      contactSelect.focus();
      return;
    }
    const selectedDuration = Number(
      modal.querySelector('input[name="safety-duration"]:checked')?.value || 5,
    );
    closeModal(overlay);
    const location = await tryGetLocation();
    const message = await composeMessage(location);
    const startedAt = Date.now();
    const session = {
      contactName: selectedContact.name,
      contactPhone: selectedContact.phone,
      deadline: startedAt + selectedDuration * 60 * 1000,
      durationMinutes: selectedDuration,
      startedAt,
      message,
      location,
    };
    startCountdown(session);
    showToast(`SafeWalk started for ${selectedDuration} minutes.`);
  });

  return {
    overlay,
    open: () => openModal(overlay),
    close: () => closeModal(overlay),
    refresh: () => {
      refreshContactSelect(contactSelect);
      updateStartState();
    },
  };
}

function buildSosModal() {
  const { overlay, modal } = createModal('safety-sos', 'Silent SOS');

  const intro = document.createElement('p');
  intro.textContent = 'Send silent SOS? Choose who to alert silently. Triple press the Safety button to reach this quickly.';
  modal.appendChild(intro);

  const consent = document.createElement('p');
  consent.textContent = 'We only ask for your location now. It stays on this device except inside your message.';
  modal.appendChild(consent);

  const contactLabel = document.createElement('label');
  contactLabel.setAttribute('for', 'safety-sos-contact');
  contactLabel.textContent = 'Send silent SOS to';
  const contactSelect = document.createElement('select');
  contactSelect.id = 'safety-sos-contact';
  contactSelect.className = 'safety-select';
  contactSelect.required = true;
  contactSelect.setAttribute('data-initial-focus', '');
  registerContactSelect(contactSelect, 'Choose contact for SOS');
  modal.append(contactLabel, contactSelect);

  const buttons = document.createElement('div');
  buttons.style.display = 'flex';
  buttons.style.flexDirection = 'column';
  buttons.style.gap = '0.75rem';

  const sendButton = document.createElement('button');
  sendButton.type = 'button';
  sendButton.className = 'safety-primary';
  setTextWithTranslation(sendButton, 'safety.sendSOS');

  function updateSendState() {
    sendButton.disabled = !contactSelect.value;
  }

  contactSelect.addEventListener('change', updateSendState);
  updateSendState();

  sendButton.addEventListener('click', async () => {
    if (!contactSelect.value) {
      return;
    }
    const contact = findContact(contactSelect.value);
    if (!contact) {
      return;
    }
    closeModal(overlay);
    const location = await tryGetLocation();
    const message = await composeMessage(location);
    openDistressMessage(contact, message);
  });

  const manageButton = document.createElement('button');
  manageButton.type = 'button';
  manageButton.className = 'safety-secondary';
  setTextWithTranslation(manageButton, 'safety.contacts');
  manageButton.addEventListener('click', () => {
    closeModal(overlay);
    contactsModal.open();
  });

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'safety-secondary';
  cancelButton.textContent = 'Not now';
  cancelButton.addEventListener('click', () => closeModal(overlay));

  buttons.append(sendButton, manageButton, cancelButton);
  modal.appendChild(buttons);

  return {
    overlay,
    open: () => openModal(overlay),
    close: () => closeModal(overlay),
    refresh: () => {
      refreshContactSelect(contactSelect);
      updateSendState();
    },
  };
}

function handleTap() {
  const now = Date.now();
  tapHistory = tapHistory.filter((timestamp) => now - timestamp <= TAP_WINDOW_MS);
  tapHistory.push(now);
  if (tapHistory.length >= 3) {
    tapHistory = [];
    toggleMenu(false);
    sosModal.refresh();
    sosModal.open();
    if (fabButton) {
      fabButton.setAttribute('aria-expanded', 'false');
    }
  }
}

function toggleMenu(forceState) {
  if (!menuElement) {
    return;
  }
  let shouldOpen;
  if (typeof forceState === 'boolean') {
    shouldOpen = forceState;
  } else {
    shouldOpen = !menuElement.classList.contains('is-open');
  }
  menuElement.classList.toggle('is-open', shouldOpen);
  if (shouldOpen) {
    menuElement.setAttribute('aria-hidden', 'false');
  } else {
    menuElement.setAttribute('aria-hidden', 'true');
  }
  if (fabButton) {
    fabButton.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  }
}

function buildCountdown() {
  const container = document.createElement('div');
  container.className = 'safety-countdown';
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');

  const heading = document.createElement('h3');
  heading.textContent = 'SafeWalk active';

  const contactInfo = document.createElement('p');
  contactInfo.textContent = '';

  const timeElement = document.createElement('time');
  timeElement.dateTime = 'PT0S';
  timeElement.textContent = '00:00';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  setTextWithTranslation(cancelButton, 'safety.stop');
  cancelButton.addEventListener('click', () => stopCountdown(true));

  container.append(heading, contactInfo, timeElement, cancelButton);

  countdownContainer = container;
  countdownContact = contactInfo;
  countdownTime = timeElement;
  countdownCancelButton = cancelButton;

  return container;
}

function buildMenu() {
  const menu = document.createElement('div');
  menu.className = 'safety-menu';
  menu.id = 'safety-menu';
  menu.setAttribute('aria-hidden', 'true');

  const heading = document.createElement('h2');
  heading.textContent = 'Safety tools';
  menu.appendChild(heading);

  const safeWalkButton = document.createElement('button');
  safeWalkButton.type = 'button';
  translateValue('safety.start')
    .then((value) => {
      safeWalkButton.setAttribute('aria-label', value);
    })
    .catch(() => {
      safeWalkButton.setAttribute('aria-label', FALLBACK_TEXT['safety.start']);
    });
  const safeWalkLabel = document.createElement('span');
  setTextWithTranslation(safeWalkLabel, 'safety.safeWalk');
  const safeWalkIcon = document.createElement('span');
  safeWalkIcon.className = 'safety-menu-icon';
  safeWalkIcon.textContent = '⏱️';
  safeWalkButton.append(safeWalkLabel, safeWalkIcon);
  safeWalkButton.addEventListener('click', () => {
    toggleMenu(false);
    safeWalkModal.refresh();
    safeWalkModal.open();
  });

  const sosButton = document.createElement('button');
  sosButton.type = 'button';
  translateValue('safety.sendSOS')
    .then((value) => {
      sosButton.setAttribute('aria-label', value);
    })
    .catch(() => {
      sosButton.setAttribute('aria-label', FALLBACK_TEXT['safety.sendSOS']);
    });
  const sosLabel = document.createElement('span');
  setTextWithTranslation(sosLabel, 'safety.sos');
  const sosIconSpan = document.createElement('span');
  sosIconSpan.className = 'safety-menu-icon';
  sosIconSpan.textContent = '🆘';
  sosButton.append(sosLabel, sosIconSpan);
  sosButton.addEventListener('click', () => {
    toggleMenu(false);
    sosModal.refresh();
    sosModal.open();
  });

  menu.append(safeWalkButton, sosButton);

  menuElement = menu;

  return menu;
}

function buildFabButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'safety-fab-button';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-haspopup', 'true');
  button.setAttribute('aria-controls', 'safety-menu');
  button.setAttribute('aria-label', 'Open safety actions');

  const label = document.createElement('span');
  label.className = 'safety-fab-label';
  const labelStrong = document.createElement('strong');
  setTextWithTranslation(labelStrong, 'safety.fab');
  const labelSmall = document.createElement('span');
  labelSmall.textContent = 'Hold space for you';
  label.append(labelStrong, labelSmall);

  button.appendChild(label);

  button.addEventListener('click', () => {
    const willOpen = !menuElement.classList.contains('is-open');
    toggleMenu(willOpen);
  });

  button.addEventListener('pointerdown', handleTap);
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      handleTap();
    }
  });

  fabButton = button;

  return button;
}

function buildToast() {
  const toast = document.createElement('div');
  toast.className = 'safety-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toastElement = toast;
  return toast;
}

export function initSafetyFab() {
  rootElement = document.getElementById('safety-root');
  if (!rootElement) {
    return;
  }

  contacts = loadContacts();

  rootElement.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'safety-container';

  container.appendChild(buildCountdown());
  container.appendChild(buildMenu());
  container.appendChild(buildFabButton());

  rootElement.appendChild(container);
  rootElement.appendChild(buildToast());

  contactsModal = buildContactsModal();
  safeWalkModal = buildSafeWalkModal();
  sosModal = buildSosModal();

  rootElement.appendChild(contactsModal.overlay);
  rootElement.appendChild(safeWalkModal.overlay);
  rootElement.appendChild(sosModal.overlay);

  rootElement.addEventListener('safety:contacts-updated', () => {
    safeWalkModal?.refresh();
    sosModal?.refresh();
  });

  if (countdownCancelButton) {
    translateValue('safety.stop')
      .then((value) => {
        countdownCancelButton.setAttribute('aria-label', value);
      })
      .catch(() => {
        countdownCancelButton.setAttribute('aria-label', FALLBACK_TEXT['safety.stop']);
      });
  }

  const storedSession = loadSession();
  if (storedSession && storedSession.deadline > Date.now()) {
    startCountdown(storedSession);
  } else {
    clearSession();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && activeSession) {
      updateCountdown();
    }
  });
}

export default initSafetyFab;
