# Daybook

A personal, phone-first planner for running several businesses at once. It is an installable web app (PWA): no account, no server, no subscription. All data stays on your phone.

## Features

| Screen | What it does |
|---|---|
| **Today** | Your day across every business: Top 3 (★), Overdue, Today, Carried over, and a progress bar. **Plan my day** pulls tasks in from all businesses. |
| **Inbox** | Capture anything instantly, then sort it into a business with one tap. |
| **Spaces** | One space per business. Each has a List view and a Board view (To do → Doing → Done). Adding a new business can include a ready-made **New business setup** checklist (registration, GST, bank account, branding, website, social handles, accounting, hiring, 90-day goals). Archive a business you pause without losing its history. |
| **Lists** | **Waiting on** (work you delegated, with a chase date), **Decisions** only you can make, **Ideas** parked by business, and **Upcoming** (next 2 weeks). |
| **Review** | Weekly review: tasks done per business, where your attention went, neglected-business warnings, and a review checklist. |

You can also:

- **Quick add with shortcuts.** For example, `Call client tomorrow 4pm @agency !high` or `Team call every monday 10am @news`.
  - Business: `@agency`, `@news`, or "for personal"
  - Priority: `!high`, `!med`, `!low` or "urgent"
  - Dates: `today`, `tomorrow`, `fri`, `next week`, `in 3 days`, `15 dec`, `2/12` (day/month), `tonight`
  - Time: `4pm`, `10:30`
  - Repeat: `daily`, `weekdays`, `every week`, `every monday`, `every month`
- **Add tasks by voice** with the mic button in Chrome on Android.
- **Set up recurring tasks.** When you complete one, the next occurrence is created automatically.
- **Break tasks down** with checklists (subtasks), notes, priority and status.
- **Undo** completes, moves and deletes.
- **Use dark mode**, and the **Android back button** closes open panels.
- **Work offline**, and launch "Quick add" straight from the home-screen icon (long-press the icon).

## Put it on your Android phone

The app has to be served over **HTTPS** before Chrome will install it. Pick one of these options; each takes a few minutes and is free.

**Option A: Netlify Drop (easiest)**
1. On a computer, go to https://app.netlify.com/drop and sign up for a free account.
2. Drag the `daybook` folder onto the page. You get a link like `https://something.netlify.app`.
3. Open that link in **Chrome on your phone**, then tap **⋮ → Add to Home screen → Install**.

**Option B: GitHub Pages**
1. In the GitHub repo, open **Settings → Pages**, set Source to the branch, and set the folder to `/ (root)`.
2. Open `https://<your-username>.github.io/<repo>/daybook/` in Chrome on your phone, then use **⋮ → Add to Home screen**.

GitHub Pages on a private repo requires a paid GitHub plan.

## Your data

- Tasks are saved in the browser storage of the installed app on your phone. They never leave the phone.
- **Back up regularly** from **⚙ Settings → Export backup**. The backup is a `.json` file saved in Downloads. **Restore backup** loads it back, for example on a new phone.
- Uninstalling the app or clearing Chrome's site data deletes your tasks, so export a backup first.

## Run it locally

```bash
cd daybook
python3 -m http.server 8000
# open http://localhost:8000
```

## Updating the app

After changing any file, bump `CACHE` in `sw.js` (for example to `daybook-v2`) so installed copies pick up the new version. They update the next time the app is opened twice.

## Files

- `index.html`: page shell and bottom tab bar
- `styles.css`: phone-first styles with light and dark themes
- `app.js`: all app logic (data, quick-add parser, views, sheets)
- `sw.js`: service worker for offline use
- `manifest.webmanifest` and `icons/`: install metadata and icons
