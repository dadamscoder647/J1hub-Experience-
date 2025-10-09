# Contributing Guidelines

## Code Style
- Use modern ES modules with `import`/`export` syntax.
- Avoid frameworks; stick to vanilla JavaScript and browser APIs.
- Build HTML fragments with template strings and inject them via the DOM APIs.

## Project Layout
- Keep the public entry point at `/index.html`; secondary pages live in `/pages`.
- Store shared styles and scripts in `/assets/css` and `/assets/js` respectively.
- Persist JSON content and localization files under `/assets/data` and `/assets/i18n`.
- PWA resources (manifest, service worker, offline shell) live in `/pwa`.

## Accessibility
- Prefer semantic HTML elements for structure and meaning.
- Provide descriptive `aria-label` or `aria-labelledby` attributes where needed.
- Ensure all interactive elements have visible focus states.

## Internationalization (i18n)
- Route all user-facing strings through the shared `t(key, vars?)` helper.
- Define translations per language in `/assets/i18n/{lang}.json` files.
- Keep translation keys descriptive and consistent across pages.

## Performance
- Lazy-load large datasets or modules when they are first needed.
- Use the service worker with a stale-while-revalidate strategy for remote assets and JSON data.
- Audit bundle size and network requests before shipping new features.

## Security & Privacy
- Do not collect or store personally identifiable information (PII) unless absolutely required.
- Request explicit consent before accessing geolocation or other sensitive APIs.
- Communicate clearly to users who can view any submitted information.
