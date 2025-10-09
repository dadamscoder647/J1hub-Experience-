const PRESETS = {
  onboarding: {
    label: 'Onboarding',
    path: '/',
    search: { view: 'onboarding' },
  },
  events: {
    label: 'Events',
    path: '/events.html',
  },
  resources: {
    label: 'Resources',
    path: '/resources.html',
  },
};

const qrWrapper = document.getElementById('qr-wrapper');
const form = document.getElementById('qr-form');
const baseInput = document.getElementById('base-url');
const pathInput = document.getElementById('destination-path');
const propertyInput = document.getElementById('property-code');
const languageSelect = document.getElementById('language-select');
const urlPreviewInput = document.getElementById('generated-url');
const downloadButton = document.getElementById('download-btn');
const copyButton = document.getElementById('copy-btn');
const formMessage = document.getElementById('form-message');
const presetButtons = Array.from(document.querySelectorAll('[data-preset]'));
const QRCodeLibrary = window.QRCode;

let qrCodeInstance = null;
let presetSearchParams = new URLSearchParams();
let activePresetKey = null;

function resetQrWrapper() {
  qrWrapper.innerHTML = '';
  qrWrapper.classList.remove('empty');
}

function setMessage(message = '', tone = 'neutral') {
  if (!formMessage) {
    return;
  }
  formMessage.textContent = message || '';
  formMessage.hidden = !message;
  formMessage.classList.remove('is-error', 'is-success');
  if (!message) {
    return;
  }
  if (tone === 'error') {
    formMessage.classList.add('is-error');
  } else if (tone === 'success') {
    formMessage.classList.add('is-success');
  }
}

function buildDestinationUrl() {
  const baseValue = (baseInput?.value || '').trim();
  if (!baseValue) {
    return null;
  }

  let baseUrl;
  try {
    baseUrl = new URL(baseValue);
  } catch (error) {
    return null;
  }

  const rawPath = (pathInput?.value || '').trim() || '/';
  let destinationUrl;
  try {
    destinationUrl = new URL(rawPath, baseUrl);
  } catch (error) {
    return null;
  }

  const searchParams = new URLSearchParams(destinationUrl.search);
  presetSearchParams.forEach((value, key) => {
    if (value === null || typeof value === 'undefined') {
      return;
    }
    searchParams.set(key, value);
  });

  const propertyValue = (propertyInput?.value || '').trim();
  if (propertyValue) {
    searchParams.set('prop', propertyValue.toUpperCase());
  } else {
    searchParams.delete('prop');
  }

  const langValue = (languageSelect?.value || '').trim();
  if (langValue) {
    searchParams.set('lang', langValue);
  } else {
    searchParams.delete('lang');
  }

  const query = searchParams.toString();
  destinationUrl.search = query;
  return destinationUrl.toString();
}

function updateUrlPreview() {
  const builtUrl = buildDestinationUrl();
  if (urlPreviewInput) {
    urlPreviewInput.value = builtUrl || '';
  }
  return builtUrl;
}

function setActivePreset(key) {
  activePresetKey = key;
  presetButtons.forEach((button) => {
    const isActive = button.dataset.preset === key;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function applyPreset(key) {
  const preset = PRESETS[key];
  if (!preset) {
    return;
  }
  setActivePreset(key);
  const nextPath = typeof preset.path === 'string' ? preset.path : '/';
  pathInput.value = nextPath;
  presetSearchParams = new URLSearchParams();
  if (preset.search) {
    Object.entries(preset.search).forEach(([searchKey, value]) => {
      if (typeof value === 'undefined' || value === null) {
        return;
      }
      presetSearchParams.set(searchKey, value);
    });
  }
  setMessage('');
  updateUrlPreview();
}

function clearPresetIfEdited() {
  if (!activePresetKey) {
    return;
  }
  setActivePreset(null);
  presetSearchParams = new URLSearchParams();
}

function createQrCode(url) {
  if (!QRCodeLibrary) {
    console.warn('QR code library unavailable');
    return;
  }
  resetQrWrapper();
  qrCodeInstance = new QRCodeLibrary(qrWrapper, {
    text: url,
    width: 220,
    height: 220,
    colorDark: '#1f2937',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H,
  });
}

function enableDownload() {
  if (!downloadButton) {
    return;
  }
  const canvas = qrWrapper.querySelector('canvas');
  const image = qrWrapper.querySelector('img');
  if (!canvas && !image) {
    downloadButton.disabled = true;
    downloadButton.removeAttribute('data-file-name');
    return;
  }

  const propertyValue = (propertyInput?.value || '').trim().toUpperCase();
  const langValue = (languageSelect?.value || '').trim();
  const pieces = ['j1hub'];
  if (propertyValue) {
    pieces.push(propertyValue);
  }
  if (langValue) {
    pieces.push(langValue);
  }
  const fileName = `${pieces.join('-')}-qr.png`;
  downloadButton.dataset.fileName = fileName;
  downloadButton.disabled = false;
  downloadButton.onclick = () => {
    let dataUrl = '';
    if (canvas) {
      dataUrl = canvas.toDataURL('image/png');
    } else if (image) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = image.width;
      tempCanvas.height = image.height;
      const ctx = tempCanvas.getContext('2d');
      if (!ctx) {
        return;
      }
      ctx.drawImage(image, 0, 0);
      dataUrl = tempCanvas.toDataURL('image/png');
    }
    if (!dataUrl) {
      return;
    }
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    link.click();
  };
}

function sanitizeAndSetProperty(value) {
  if (!propertyInput) {
    return;
  }
  const sanitized = (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  propertyInput.value = sanitized;
}

function initializePresetButtons() {
  presetButtons.forEach((button) => {
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      const presetKey = button.dataset.preset;
      if (!presetKey) {
        return;
      }
      applyPreset(presetKey);
    });
  });
}

function hydrateFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const base = params.get('base');
  const path = params.get('path');
  const prop = params.get('prop');
  const lang = params.get('lang');
  const preset = params.get('preset');

  if (base && baseInput) {
    baseInput.value = base;
  }
  if (path && pathInput) {
    pathInput.value = path;
  }
  if (prop) {
    sanitizeAndSetProperty(prop);
  }
  if (
    lang &&
    languageSelect &&
    languageSelect.querySelector(`option[value="${lang}"]`)
  ) {
    languageSelect.value = lang;
  }
  if (preset && PRESETS[preset]) {
    applyPreset(preset);
    return;
  }
  updateUrlPreview();
}

function attachFormListeners() {
  if (!form) {
    return;
  }
  if (baseInput) {
    baseInput.addEventListener('input', () => {
      setMessage('');
      updateUrlPreview();
    });
  }

  if (pathInput) {
    pathInput.addEventListener('input', () => {
      clearPresetIfEdited();
      setMessage('');
      updateUrlPreview();
    });
  }

  if (propertyInput) {
    propertyInput.addEventListener('input', (event) => {
      const originalPosition = event.target.selectionStart || 0;
      sanitizeAndSetProperty(event.target.value);
      if (typeof event.target.setSelectionRange === 'function') {
        event.target.setSelectionRange(originalPosition, originalPosition);
      }
      updateUrlPreview();
    });
  }

  if (languageSelect) {
    languageSelect.addEventListener('change', () => {
      updateUrlPreview();
    });
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const builtUrl = updateUrlPreview();
    if (!builtUrl) {
      setMessage('Please enter a valid base URL to build the QR link.', 'error');
      qrWrapper.innerHTML = '';
      qrWrapper.classList.add('empty');
      if (downloadButton) {
        downloadButton.disabled = true;
      }
      return;
    }

    setMessage('');

    if (qrCodeInstance) {
      qrCodeInstance.clear();
    }
    createQrCode(builtUrl);
    setTimeout(enableDownload, 50);
  });

  if (!copyButton) {
    return;
  }

  copyButton.addEventListener('click', async () => {
    const value = urlPreviewInput.value;
    if (!value) {
      setMessage('Generate a link before copying.', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setMessage('Link copied to clipboard.', 'success');
    } catch (error) {
      console.warn('Unable to copy link', error);
      setMessage('Copy unavailable in this browser.', 'error');
    }
  });
}

function logHitPixel() {
  const hitUrl = window.HIT_URL;
  if (!hitUrl) {
    return;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const pixelParams = new URLSearchParams({
      p: window.location.pathname || '/',
      prop: params.get('prop') || '',
      lang: params.get('lang') || '',
      ts: Date.now().toString(),
    });
    const pixel = new Image(1, 1);
    pixel.decoding = 'async';
    pixel.referrerPolicy = 'no-referrer-when-downgrade';
    pixel.alt = '';
    pixel.src = `${hitUrl}?${pixelParams.toString()}`;
    pixel.style.position = 'absolute';
    pixel.style.width = '1px';
    pixel.style.height = '1px';
    pixel.style.opacity = '0';
    document.body.appendChild(pixel);
  } catch (error) {
    console.warn('Unable to send analytics hit', error);
  }
}

function init() {
  if (!form || !qrWrapper) {
    return;
  }
  initializePresetButtons();
  hydrateFromQuery();
  attachFormListeners();
  logHitPixel();
  if (!QRCodeLibrary) {
    setMessage('QR code library failed to load.', 'error');
    return;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
