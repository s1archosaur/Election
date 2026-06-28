# CR Election (Admin + Spectator)

Two-page static setup:

- `spectator.html`: dashboard-only screen (16:9 locked view, black letterbox outside)
- `admin.html`: vote entry and candidate management

Shared logic is in `assets/main.js` and styles in `assets/styles.css`.

## Local run

Use any static server from the project root.

```powershell
python -m http.server 8000
```

Then open:

- `http://localhost:8000/` (spectator)
- `http://localhost:8000/admin` (admin)

## Vercel deploy

`vercel.json` is already configured with clean routes:

- `/` -> `spectator.html`
- `/spectator` -> `spectator.html`
- `/admin` -> `admin.html`

Deploy commands:

```powershell
npm i -g vercel
vercel login
vercel --prod
```

## Live update behavior

- After each vote/candidate change, pages update automatically without manual refresh.
- This is immediate between open tabs/windows on the same browser origin.

Important: current storage uses browser `localStorage`, so different devices do not share data yet.
If you need shared live data across phones/laptops, add a backend (e.g., Firebase, Supabase, or Vercel KV + API route).
