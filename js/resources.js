import { t } from './lib/i18n.js';

const STORAGE_KEY = 'resources:progress';
const MANAGER_KEY = 'resources:manager:visible';

const resourceList = document.getElementById('resourceList');
const emptyDetail = document.getElementById('emptyDetail');
const detailHeader = document.getElementById('detailHeader');
const detailTitle = document.getElementById('detailTitle');
const detailEstimate = document.getElementById('detailEstimate');
const mapLink = document.getElementById('mapLink');
const managerToggle = document.getElementById('managerToggle');
const stepList = document.getElementById('stepList');
const managerCard = document.getElementById('managerCard');
const managerLead = document.getElementById('managerLead');
const managerLines = document.getElementById('managerLines');
const pageTitleEl = document.getElementById('pageTitle');
const pageDescriptionEl = document.getElementById('pageDescription');

const DEFAULT_UI = {
  pageTitle: 'Guided Playbooks',
  pageDescription: 'Follow step-by-step checklists for common tasks and keep your progress.',
  playbookListLabel: 'Playbooks',
  showManager: 'Show to Manager',
  hideManager: 'Hide Manager Card',
  viewMap: 'Open map',
  managerLead: 'Show this screen to your manager.',
  emptyDetail: 'Select a playbook to see the checklist and manager card.'
};

const UI_KEYS = {
  pageTitle: 'resources.pageTitle',
  pageDescription: 'resources.pageDescription',
  playbookListLabel: 'resources.playbookListLabel',
  showManager: 'resources.actions.showManager',
  hideManager: 'resources.actions.hideManager',
  viewMap: 'resources.actions.viewMap',
  managerLead: 'resources.managerLead',
  emptyDetail: 'resources.emptyState'
};

const state = {
  resources: [],
  selectedId: null,
  ui: { ...DEFAULT_UI },
  progress: loadProgress(),
  managerVisible: loadManagerVisible()
};

bootstrap().catch((error) => {
  console.error('Failed to initialize resources page', error);
});

async function bootstrap() {
  await loadUiStrings();
  applyUiText();
  await loadResources();
  attachEventHandlers();
  if (state.resources.length) {
    selectResource(state.resources[0].id);
  }
}

function attachEventHandlers() {
  resourceList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-resource-id]');
    if (!button) {
      return;
    }
    const { resourceId } = button.dataset;
    if (resourceId) {
      selectResource(resourceId);
    }
  });

  stepList.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    if (!input.classList.contains('step-checkbox')) {
      return;
    }
    const stepId = input.dataset.stepId;
    if (!stepId || !state.selectedId) {
      return;
    }

    if (!state.progress[state.selectedId]) {
      state.progress[state.selectedId] = {};
    }
    state.progress[state.selectedId][stepId] = input.checked;
    saveProgress();
  });

  managerToggle.addEventListener('click', () => {
    state.managerVisible = !state.managerVisible;
    managerToggle.setAttribute('aria-pressed', String(state.managerVisible));
    saveManagerVisible();
    updateManagerToggle();
    renderManagerCard();
  });
}

async function loadResources() {
  try {
    const response = await fetch('data/resources.json', { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`Unable to load resources (status ${response.status})`);
    }
    state.resources = await response.json();
    await renderResourceList();
  } catch (error) {
    console.error(error);
    resourceList.innerHTML = '';
    const message = document.createElement('p');
    message.textContent = 'Unable to load resources right now. Please refresh to try again.';
    resourceList.appendChild(message);
  }
}

async function loadUiStrings() {
  const entries = Object.entries(UI_KEYS);
  const resolved = await Promise.all(
    entries.map(async ([key, translationKey]) => {
      const value = await maybeTranslate(translationKey, DEFAULT_UI[key]);
      return [key, value];
    })
  );

  for (const [key, value] of resolved) {
    state.ui[key] = value;
  }
}

function applyUiText() {
  document.title = state.ui.pageTitle;
  const activeLang = localStorage.getItem('lang') || 'en';
  document.documentElement.setAttribute('lang', activeLang);
  pageTitleEl.textContent = state.ui.pageTitle;
  pageDescriptionEl.textContent = state.ui.pageDescription;
  resourceList.setAttribute('aria-label', state.ui.playbookListLabel);
  mapLink.textContent = state.ui.viewMap;
  emptyDetail.textContent = state.ui.emptyDetail;
  managerToggle.textContent = state.ui.showManager;
  managerToggle.setAttribute('aria-pressed', String(state.managerVisible));
}

async function renderResourceList() {
  resourceList.innerHTML = '';
  for (const resource of state.resources) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'resource-item';
    button.dataset.resourceId = resource.id;
    button.setAttribute('aria-current', resource.id === state.selectedId ? 'true' : 'false');

    const titleSpan = document.createElement('span');
    titleSpan.className = 'resource-item-title';
    titleSpan.textContent = await maybeTranslate(
      `resources.playbooks.${resource.id}.title`,
      resource.title
    );

    const estimateSpan = document.createElement('span');
    estimateSpan.className = 'resource-item-estimate';
    estimateSpan.textContent = await maybeTranslate(
      'resources.estimate',
      ({ minutes }) => `≈ ${minutes} min`,
      { minutes: resource.est_min }
    );

    button.append(titleSpan, estimateSpan);
    resourceList.appendChild(button);
  }
}

async function selectResource(resourceId) {
  if (state.selectedId === resourceId) {
    return;
  }
  state.selectedId = resourceId;
  await renderResourceList();
  await renderDetail();
}

async function renderDetail() {
  const resource = state.resources.find((entry) => entry.id === state.selectedId);
  if (!resource) {
    detailHeader.hidden = true;
    stepList.hidden = true;
    managerCard.hidden = true;
    managerCard.classList.remove('is-visible');
    emptyDetail.hidden = false;
    return;
  }

  emptyDetail.hidden = true;
  detailHeader.hidden = false;
  stepList.hidden = false;

  detailTitle.textContent = await maybeTranslate(
    `resources.playbooks.${resource.id}.title`,
    resource.title
  );

  detailEstimate.textContent = await maybeTranslate(
    'resources.estimate',
    ({ minutes }) => `≈ ${minutes} min`,
    { minutes: resource.est_min }
  );

  if (resource.map_link) {
    mapLink.href = resource.map_link;
    mapLink.removeAttribute('aria-disabled');
  } else {
    mapLink.href = '#';
    mapLink.setAttribute('aria-disabled', 'true');
  }

  await renderSteps(resource);
  await renderManagerCard(resource);
  updateManagerToggle();
}

async function renderSteps(resource) {
  const resourceProgress = state.progress[resource.id] || {};
  stepList.innerHTML = '';

  for (const step of resource.steps || []) {
    const listItem = document.createElement('li');
    listItem.className = 'step-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'step-checkbox';
    checkbox.dataset.stepId = step.id;
    checkbox.id = `step-${resource.id}-${step.id}`;
    checkbox.checked = Boolean(resourceProgress[step.id]);

    const label = document.createElement('label');
    label.setAttribute('for', checkbox.id);
    label.textContent = await maybeTranslate(
      `resources.playbooks.${resource.id}.steps.${step.id}`,
      step.label
    );

    listItem.append(checkbox, label);
    stepList.appendChild(listItem);
  }
}

async function renderManagerCard(resource = state.resources.find((entry) => entry.id === state.selectedId)) {
  if (!resource) {
    managerCard.hidden = true;
    managerCard.classList.remove('is-visible');
    return;
  }

  if (!state.managerVisible) {
    managerCard.hidden = true;
    managerCard.classList.remove('is-visible');
    return;
  }

  managerCard.hidden = false;
  managerCard.classList.add('is-visible');

  managerLead.textContent = state.ui.managerLead;
  managerLines.innerHTML = '';

  const lines = await Promise.all(
    (resource.manager_card || []).map((line, index) =>
      maybeTranslate(
        `resources.playbooks.${resource.id}.manager_card.${index}`,
        line
      )
    )
  );

  for (const line of lines) {
    const p = document.createElement('p');
    p.className = 'manager-card-line';
    p.textContent = line;
    managerLines.appendChild(p);
  }
}

function updateManagerToggle() {
  if (state.managerVisible) {
    managerToggle.textContent = state.ui.hideManager;
  } else {
    managerToggle.textContent = state.ui.showManager;
  }
  managerToggle.setAttribute('aria-pressed', String(state.managerVisible));
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn('Unable to parse stored progress', error);
    return {};
  }
}

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
  } catch (error) {
    console.warn('Unable to save progress', error);
  }
}

function loadManagerVisible() {
  const stored = localStorage.getItem(MANAGER_KEY);
  if (stored === null) {
    return false;
  }
  return stored === 'true';
}

function saveManagerVisible() {
  try {
    localStorage.setItem(MANAGER_KEY, String(state.managerVisible));
  } catch (error) {
    console.warn('Unable to save manager card preference', error);
  }
}

async function maybeTranslate(key, fallback, vars = {}) {
  try {
    const translated = await t(key, vars);
    if (typeof translated === 'string' && translated !== key) {
      return translated;
    }
  } catch (error) {
    console.warn(`Translation lookup failed for ${key}`, error);
  }

  if (typeof fallback === 'function') {
    return fallback(vars);
  }

  return fallback;
}
