# Contributing Guidelines

## Code Style
- Use modern ES modules with `import`/`export` syntax.
- Avoid frameworks; stick to vanilla JavaScript and browser APIs.
- Build HTML fragments with template strings and inject them via the DOM APIs.

## Accessibility
- Prefer semantic HTML elements for structure and meaning.
- Provide descriptive `aria-label` or `aria-labelledby` attributes where needed.
- Ensure all interactive elements have visible focus states.

## Internationalization (i18n)
- Route all user-facing strings through the shared `t(key, vars?)` helper.
- Define translations per language in `/translations/{lang}.json` files.
- Keep translation keys descriptive and consistent across pages.

## Performance
- Lazy-load large datasets or modules when they are first needed.
- Use the service worker with a stale-while-revalidate strategy for remote assets and JSON data.
- Audit bundle size and network requests before shipping new features.

## Security & Privacy
- Do not collect or store personally identifiable information (PII) unless absolutely required.
- Request explicit consent before accessing geolocation or other sensitive APIs.
- Communicate clearly to users who can view any submitted information.
