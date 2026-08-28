# Campus Netra — Frontend

React 18 · Vite · Tailwind · TanStack Query · Recharts

## Run

```bash
npm install
npm run dev      # http://localhost:5173
```

Vite proxies `/api`, `/media` and the twin WebSocket to `http://127.0.0.1:8000`,
so the app is same-origin in development and needs no CORS handling in the browser.

## Layout

```
src/
├── App.jsx            Routes, role guards, lazy loading
├── layouts/           App shell: role-aware sidebar, topbar, notifications
├── pages/             One file per screen
├── features/
│   ├── auth/          Auth shell and role tabs
│   ├── twin/          SVG floor plan renderer
│   └── assistant/     AI assistant drawer
├── components/ui/     Widget, Button, Field, Modal, StatusPill, Toaster…
└── lib/
    ├── api.js         Fetch client with single-flight token refresh
    ├── auth.js        Zustand session store
    └── format.js      Dates, SLA labels, status styling, twin palette
```

## Design system

Tokens live in `tailwind.config.js`; component classes in `styles/index.css`.
Use the named roles rather than hand-picking values:

```jsx
<h2 className="text-headline-md">…</h2>
<span className="text-label-caps uppercase text-ink-muted">…</span>
<td className="font-mono text-mono-data tabular">P-101</td>
<section className="widget"><div className="widget-body">…</div></section>
```

`TWIN_STATE` in `lib/format.js` must stay in step with `STATE_COLOURS` in the
backend's `services/twin.py` — they are the same palette on both sides of the wire.

## Live twin

`connectTwin(campusId, { onEvent })` opens the WebSocket and reconnects with
exponential backoff. The Digital Twin page invalidates its React Query caches on
each event, so the floor plan re-renders without a refresh, and pulses a ring
around any asset that changed in the last few seconds.
