const translationsCache = new Map();
const defaultLang = 'en';

async function loadTranslations(lang) {
  if (translationsCache.has(lang)) {
    return translationsCache.get(lang);
  }

  const loader = (async () => {
    const response = await fetch(`/translations/${lang}.json`, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`Failed to load translations for "${lang}"`);
    }
    return response.json();
  })();

  translationsCache.set(lang, loader);
  return loader;
}

function resolveKey(translations, key) {
  return key.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), translations);
}

function formatTemplate(template, vars) {
  if (typeof template !== 'string') {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, varKey) => {
    return Object.prototype.hasOwnProperty.call(vars, varKey) ? vars[varKey] : `{${varKey}}`;
  });
}

export async function t(key, vars = {}) {
  const lang = localStorage.getItem('lang') || defaultLang;

  try {
    const translations = await loadTranslations(lang);
    const value = resolveKey(translations, key);
    if (value !== undefined) {
      return formatTemplate(value, vars);
    }
  } catch (error) {
    if (lang !== defaultLang) {
      console.warn(error);
    } else {
      console.warn(`i18n: ${error.message}`);
    }
  }

  if (lang !== defaultLang) {
    const fallbackTranslations = await loadTranslations(defaultLang);
    const fallbackValue = resolveKey(fallbackTranslations, key);
    if (fallbackValue !== undefined) {
      return formatTemplate(fallbackValue, vars);
    }
  }

  return formatTemplate(key, vars);
}
