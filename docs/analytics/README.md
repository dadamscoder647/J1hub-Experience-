# Analytics Pixel & Hit Logger

This project uses a lightweight tracking pixel to understand which property and language combinations are loading each page. Hits are processed by a Google Apps Script web app that writes to a Google Sheet.

## Apps Script deployment

1. Open [script.google.com](https://script.google.com/) with the Google account that owns the target spreadsheet.
2. Create a new **Apps Script** project and connect it to the Google Sheet where you want to store the logs.
3. Replace the default code with the contents of [`apps-script/hitlogger.gs`](../../apps-script/hitlogger.gs).
4. Click **Deploy → Test deployments** to grant script permissions, then choose **Deploy → Manage deployments** and create a **Web app** deployment:
   - **Execute as:** Me
   - **Who has access:** Anyone with the link (or restrict to your allowlist as needed)
5. Copy the web app URL; this is your `HIT_URL`.

The spreadsheet will automatically create a `Hits` sheet with the columns `timestamp`, `path`, `prop`, `lang`, `userAgent`, and `ip` on the first request.

## Adding the pixel to the site

Set a global JavaScript variable before loading any page-specific bundles:

```html
<script>
  window.HIT_URL = 'https://script.google.com/macros/s/DEPLOYMENT_ID/exec';
</script>
```

Add the snippet (ideally inside `index.html` so it propagates through shared layouts). Pages that load `js/qr.js` will automatically request the 1×1 GIF at:

```
${HIT_URL}?p=${path}&prop=${prop}&lang=${lang}&ts=${Date.now()}
```

`prop` and `lang` values are taken from the current page URL query string to avoid storing any PII.

## Regenerating the QR preset page

`qr.html` now imports `js/qr.js`, which builds property-specific links (with language presets) and renders QR codes through the CDN-hosted `qrcodejs` library. Ensure the pixel snippet above runs before `js/qr.js` so analytics hits reach the Apps Script endpoint on each page view.
