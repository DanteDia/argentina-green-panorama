# Embed Guide — EventsVerified Widget

This guide is for developers on the **host site** (event organizer, partner, sponsor) who want to render a Verifiable Industries event map inside their own page. The widget is a small JavaScript loader that injects an iframe pointing at `verifiableindustries.com`. Cross-origin safe, CSS-isolated, no build step required on your side.

> **Internal developer docs** (how the system works, architecture, contribution notes) are in [README.md §Embedding](./README.md#embedding-an-event-map-on-your-site) and throughout `frontend/app/event/[slug]/embed/` + `frontend/public/embed/embed.js`.

---

## Quick start

Paste this into any page. Works on Webflow, WordPress, Squarespace, plain HTML, or any CMS that allows a custom HTML block.

```html
<div data-green-panorama-event="blockchainrio-2026" data-height="720"></div>
<script src="https://verifiableindustries.com/embed/v1.js" async></script>
```

That's it. The container div becomes the event map — interactive graph, AI chat, and opportunity matcher, rendered at 720px tall.

### Multiple widgets on one page

Supported. Each `<div data-green-panorama-event="…">` becomes its own iframe. Use different slugs or duplicate the same slug; the loader handles them independently.

---

## Configuration

Configure via `data-*` attributes on the container div. All are optional except the slug.

| Attribute                      | Default   | Description |
|--------------------------------|-----------|-------------|
| `data-green-panorama-event`    | *(required)* | Event slug. See [Available events](#available-events). |
| `data-height`                  | `720`     | Fixed pixel height. Use `"auto"` to track iframe content height via postMessage. |
| `data-theme`                   | `dark`    | `dark` or `light`. *(Light theme lands in a future release; dark is the supported default today.)* |
| `data-primary`                 | *(none)*  | Brand accent color as CSS-safe hex (e.g. `#00ffaa`). Applied as `--gp-primary`. URL-encode the `#` as `%23` if your CMS requires it. |
| `data-locale`                  | `es`      | `en`, `es`, or `pt`. |

### Example — full configuration

```html
<div
  data-green-panorama-event="blockchainrio-2026"
  data-height="auto"
  data-theme="dark"
  data-primary="#00ffaa"
  data-locale="en"
></div>
<script src="https://verifiableindustries.com/embed/v1.js" async></script>
```

---

## Versioning

Two URLs:

- **`/embed/v1.js`** — pinned to the v1 contract. Safe to use in production. We will never ship a breaking change to this URL. When v2 lands you opt in by changing the URL.
- **`/embed.js`** — always the latest version. Useful for internal testing and fast iteration. **Do not point production event pages at this URL** — we may ship breaking changes.

Browser cache: v1 is cached aggressively (1h browser, 24h CDN). Expect changes to propagate within an hour when we ship non-breaking fixes.

---

## JavaScript API

For hosts that want programmatic control or analytics callbacks. Available on `window.GreenPanorama` once the loader script has run.

```javascript
// Subscribe to widget events (for your analytics)
GreenPanorama.on("ready", ({ slug, iframe }) => {
  console.log("Event map ready:", slug);
});

GreenPanorama.on("resize", ({ slug, height }) => {
  // only fires when data-height="auto"
});

// Programmatic mount (if you create containers after page load)
const el = document.querySelector("#my-container");
GreenPanorama.mount(el, {
  slug: "blockchainrio-2026",
  theme: "dark",
  height: 720,
});

// Teardown
GreenPanorama.unmount(el);

// Rescan the DOM (SPAs adding containers dynamically)
GreenPanorama.scan(document);
```

The loader also auto-scans the DOM via `MutationObserver`, so in most SPAs you do not need to call `scan()` manually.

### Event payloads

| Event    | Payload                                    | Fires when |
|----------|--------------------------------------------|------------|
| `ready`  | `{ slug, iframe }`                         | Child iframe has mounted and is interactive |
| `resize` | `{ slug, iframe, height }`                 | Auto-resize mode only, each content-height change |
| `error`  | `{ el, message }`                          | Mount failed (missing slug, etc.) |

---

## postMessage protocol

If you prefer raw `postMessage` over the `GreenPanorama` API (e.g., inside an iframe on *your* site, or a non-browser environment), here is the contract.

All messages from the widget share this shape:
```json
{ "type": "gp:<verb>", "version": 1, "slug": "blockchainrio-2026", ... }
```

### Messages the widget sends to your page

| `type`        | Extra fields   | Meaning |
|---------------|----------------|---------|
| `gp:ready`    | —              | Iframe mounted and ready to interact |
| `gp:resize`   | `height: number` | Content height changed (auto-resize mode only) |

### Messages you can send to the widget

| `type`        | Fields                                      | Effect |
|---------------|---------------------------------------------|--------|
| `gp:config`   | `theme?, primary?, locale?`                 | Update runtime config after mount |

Post to the iframe's `contentWindow` with target origin `https://verifiableindustries.com`.

### Security note

Always check `event.origin === "https://verifiableindustries.com"` AND `event.source === iframe.contentWindow` before acting on a message. Our loader does this for you; if you hand-roll a listener, you must too — otherwise any iframe on your page could spoof resize events.

---

## Available events

| Slug                  | Event                  | Dates           |
|-----------------------|------------------------|-----------------|
| `blockchainrio-2026`  | BlockchainRio 2026     | Aug 5–7, 2026   |

New events are added via `frontend/lib/event-configs.ts`. To request an event map, contact us.

---

## Security & isolation

- **Cross-origin iframe** — your page and the widget share no DOM or JS context. Your CSS cannot accidentally break ours and vice versa.
- **CSP** — we serve `/event/[slug]/embed` with `Content-Security-Policy: frame-ancestors *`. Your page's `frame-src` directive must allow `https://verifiableindustries.com`; if your CSP is strict, add it to your `frame-src` / `child-src` allowlist.
- **No cookies shared** — the iframe runs in its own storage partition on modern browsers.
- **CORS** — the loader script is served with `Access-Control-Allow-Origin: *`.
- **No data collected from your page** — the widget does not read your page's DOM, cookies, or localStorage. It receives only the slug and optional theme/primary/locale/height attributes from the container div.

---

## Local testing

Run it against a local dev build before pushing to your production site.

```bash
# 1. Start the Verifiable Industries dev server
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

Create a test host page on a different port (cross-origin, to match production):

```bash
mkdir -p /tmp/gp-test
cat > /tmp/gp-test/index.html <<'EOF'
<!doctype html>
<html>
<body style="font-family: system-ui; padding: 24px;">
  <h1>Local embed test</h1>
  <div data-green-panorama-event="blockchainrio-2026" data-height="720"></div>
  <script>
    window.addEventListener("message", e => {
      if (e.data?.type?.startsWith("gp:")) console.log("[host]", e.data);
    });
  </script>
  <script src="http://localhost:3000/embed.js" async></script>
</body>
</html>
EOF

cd /tmp/gp-test && python3 -m http.server 8080
# → http://localhost:8080
```

Open `http://localhost:8080/` in your browser. You should see the map render, and `gp:ready` appear in the console.

### Point the dev loader at production

The dev loader substitutes `__EMBED_ORIGIN__` with the request origin (so in dev it serves iframes from `http://localhost:3000`). To test the production iframe from a local host page:

```bash
NEXT_PUBLIC_EMBED_ORIGIN=https://verifiableindustries.com npm run dev
```

---

## Troubleshooting

**Iframe is blank / stuck loading**
Open your browser devtools and check the Network tab for the iframe URL. If it's 404, the slug is wrong. Check the Console for CSP errors — if you see `Refused to frame 'https://verifiableindustries.com/…'`, your page's CSP needs `frame-src https://verifiableindustries.com`.

**Iframe renders but height is wrong**
The default is a fixed 720px. If you set `data-height="auto"`, the widget posts resize events — confirm your CSP isn't blocking `postMessage` (it shouldn't, but some overly-strict CSPs do). You can also just set a larger fixed height: `data-height="1000"`.

**`GreenPanorama` is undefined**
The loader script hasn't run yet. Either: (a) wait for `DOMContentLoaded`, (b) move your `GreenPanorama.on(...)` calls to a later script, or (c) remove `async` from the script tag so it runs synchronously.

**Multiple widgets — one doesn't render**
Check that each container has a unique position in the DOM and no duplicate `data-gp-mounted="1"` attributes (that attribute is our idempotency guard — we skip containers already marked mounted).

**Nothing works on Safari private mode / strict tracking prevention**
Rare, but possible. Third-party iframe limits in private browsing may affect the widget. Normal browsing works fine.

---

## Getting help

- **Bugs / feature requests**: open an issue at the repository
- **New event request**: contact us — we'll add the slug and ingest the attendee data
- **Partnership / pricing**: see [STRATEGY.md](./STRATEGY.md)
