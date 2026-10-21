# Chatss

**Chatss** is an offline, privacy-first viewer for chats exported from WhatsApp. Import a `.txt` or `.zip` export, choose which participant you are, and read the conversation in a familiar mobile chat layout. It works on Android, iPhone, tablets and desktop browsers, and keeps working offline once installed.

> Your conversations are stored locally on this device. Chatss does not upload your messages to a server.

Chatss is an independent project. It is not affiliated with, endorsed by, or connected to WhatsApp or Meta, and it cannot send messages.

---

## Features

| Area | What you get |
| --- | --- |
| **Import** | Guided wizard. Accepts `.txt` exports (UTF-8, UTF-8 with BOM, UTF-16 with BOM), `.zip` exports with media, or pasted text. Pick a file on a phone, or drag and drop it on desktop. Parsing runs in a Web Worker so the UI stays responsive. |
| **Parser** | Reads Android (`12/05/26, 10:30 pm - Name: text`) and iOS (`[12/05/26, 22:30:15] Name: text`) formats, 12-hour and 24-hour clocks, `/` `.` `-` date separators, 2-digit and 4-digit years, and year-first dates. Also handles narrow no-break spaces and invisible direction marks, multiline messages, colons inside messages, names with spaces, emoji, system and group events, media placeholders, attached files, and the deleted, edited and call markers. Text it can't parse is kept and reported, never dropped. |
| **Date ambiguity** | Day/month order is checked against every header. If both readings are valid and keep the chat in order, the wizard asks you to choose and shows sample dates under each option. |
| **Who am I** | After import, Chatss asks **"Who are you in this conversation?"** Your messages show on the right and everyone else's on the left, with sender names in groups. You can choose "None of these" to show every message on the left. Change it any time from the chat menu; switching never rewrites the stored messages. |
| **Participant mapping** | Rename how people are shown, or mark two sender names as the same person (for example a phone number and a saved name). Names that look ambiguous are flagged for review. |
| **Preview** | Before anything is saved, the whole parsed chat is shown in the real chat UI. You can switch perspective in the preview. |
| **Chat UI** | Mobile-first layout with doodle wallpaper, bubble tails, grouping of consecutive messages, and date separators (Today, Yesterday, weekday, date). Includes a floating date chip while scrolling, timestamps, WhatsApp text formatting (`*bold*` `_italic_` `~strike~` ```` ```mono``` ````), safe links, large emoji, system notices, and indicators for edited and deleted messages, calls and import warnings. Light and dark themes. Two-pane layout on desktop. |
| **Large chats** | Virtualized message list: only the rows on screen are in the DOM. Tested with 50,000 messages end-to-end and 200,000 messages in unit tests. |
| **Search** | Search chat names, participants and message text across all chats (debounced, capped, cancellable). In-chat search shows a result count, highlights matches, and moves between results with ↑/↓ or Enter / Shift+Enter. Jump to any date. |
| **Media** | Shows photos (with a viewer), video, audio and voice notes, stickers and documents from ZIP exports, matched by exact file name. Media that isn't in the export is clearly labelled as not included. Documents can only be downloaded, except PDFs, which can also be opened; imported HTML or SVG is never rendered. |
| **Management** | Rename chats and participants, change perspective, export a chat back to `.txt`, delete a chat or all data (with confirmation), see storage usage, request persistent storage, and back up and restore (see below). |
| **PWA** | Installable, with offline app shell via a service worker and a safe "update available" prompt. Works under a sub-path such as GitHub Pages. |

## Privacy and security

- **No backend.** There are no accounts, analytics, telemetry or third-party requests. The production build ships a strict Content-Security-Policy (`connect-src 'self'`) that blocks the page from contacting any other host.
- **Local storage only.** Chats, participants and media are stored in IndexedDB in this browser on this device. The service worker caches only the static app files, never chat content.
- **Untrusted input.** Message text is always rendered as text, never as HTML. Only `http(s)` links are clickable and they open with `noopener noreferrer`. ZIP entries are checked for path traversal, absolute paths, control characters, entry counts, sizes and suspicious compression ratios.
- **No private data in URLs.** Navigation and the Android back button use history state that holds only a depth number.
- **Not encrypted.** Anyone who can open Chatss on your unlocked device can read the chats. A future app lock (see `docs/ARCHITECTURE.md`) would only gate the UI and would not encrypt the data.
- **Storage is not guaranteed forever.** Chatss asks the browser for persistent storage (Storage Manager API) after the first import, and you can ask again in Settings. Browsers may still clear data. Clearing site data, uninstalling the PWA or resetting the browser can delete your chats, so **keep backups**.

## Getting started (local development)

Requirements: Node.js **20.19+** and npm.

```bash
npm ci                 # install exact versions from package-lock.json
npm run dev            # dev server at http://localhost:5173
```

Other commands:

```bash
npm run lint           # ESLint
npm run typecheck      # TypeScript (no emit)
npm test               # unit + component tests (Vitest, jsdom, fake-indexeddb)
npm run build          # type-check + production build into dist/
npm run preview        # serve dist/ at http://localhost:4173 (service worker active)
npx playwright install chromium   # one-time browser download for e2e tests
npm run test:e2e       # Playwright end-to-end tests against the production build
npm run icons          # regenerate PNG icons from public/favicon.svg
npm run check          # lint + typecheck + test + build
```

If Playwright can't download its browser (for example behind a firewall), use an installed browser: `PW_CHANNEL=chrome npm run test:e2e`, or `PW_CHANNEL=msedge`.

The service worker is only registered in production builds. Use `npm run build && npm run preview` to test offline behaviour locally.

## Install on Android

1. Open the hosted Chatss URL in **Chrome** on your phone (for example your GitHub Pages URL, see below). You can also open it from a computer on your local network with `npm run preview -- --host`, but installing needs **HTTPS** or `localhost`.
2. Tap **⋮ → Install app** (or **Add to Home screen**). Chatss → Settings → *Install Chatss* also shows a button when the browser allows it.
3. Open Chatss from the home screen once while online, so the app files are cached.

**Get a chat into Chatss:** in WhatsApp, open the chat → **⋮ → More → Export chat** → *Without media* (`.txt`) or *Include media* (`.zip`) → save to Files/Downloads. Then in Chatss tap the green import button and select the file.

**iPhone/iPad:** open the URL in Safari → Share → **Add to Home Screen**. iOS exports are supported (`_chat.txt` inside the ZIP).

## Verify offline operation

1. Open Chatss online (production build or hosted URL) and wait a moment so the service worker caches the app.
2. Import a chat, then close the app.
3. Turn on airplane mode, or disable the network in DevTools.
4. Reopen Chatss. The chat list loads.
5. Open the conversation, search messages, and change *who I am*.
6. Reload while still offline. Everything keeps working.

This exact sequence is automated in `e2e/chatss.spec.ts` ("works offline after the first visit").

## Backup and restore

- **Create a backup:** Settings → *Backup & restore* → **Create backup**. This downloads `chatss-backup-YYYY-MM-DD.zip`.
- **Restore:** Settings → **Restore backup** → pick the file. Chatss checks the whole backup first and shows each chat. Chats that already exist on the device are **never overwritten**: you can skip them or restore them as a copy with new identifiers. If any part of the backup is damaged, nothing is written.
- Backups contain your private messages. Store them somewhere you trust and never commit them to git (`.gitignore` excludes `*.zip` and common export names).

**Backup format v1** (ZIP):

```
manifest.json                         { format: "chatss-backup", version: 1, createdAt, app, conversations: [...] }
conversations/<conversationId>.json   { conversation, participants, messages, attachments }
attachments/<attachmentId>            raw media bytes
```

## GitHub Actions

`.github/workflows/ci.yml` runs on every push and pull request to `main`, and can also be started manually. It:

1. installs dependencies with `npm ci` from the committed lockfile, with npm caching
2. runs lint, type-check, and the unit and component tests
3. builds the production app and **uploads `dist/` as the artifact `chatss-dist`**
4. installs Chromium and runs the Playwright end-to-end tests, including the offline test

The workflow uses minimal permissions (`contents: read`). Actions are pinned to major release tags (`@v4`/`@v5`). For stricter supply-chain control, replace these tags with full commit SHAs.

**Trigger a build:** push to `main`, open a pull request, or go to **Actions → CI → Run workflow**.
**Download the build:** open the workflow run in the **Actions** tab, scroll to **Artifacts**, and download **chatss-dist**. Extract it and serve the folder with any static file server.

A CI build does **not** publish anything. Deployment is a separate, optional workflow.

## Optional: deploy to GitHub Pages

`.github/workflows/pages.yml` builds Chatss with the correct sub-path (`BASE_PATH=/<repo>/`) and deploys it with the official Pages actions.

1. Push the repository to GitHub.
2. Go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Go to **Actions → Deploy to GitHub Pages (optional) → Run workflow**.
4. The site appears at `https://<user>.github.io/<repo>/`.

The workflow runs only when you start it manually. To deploy on every push, add `push: branches: [main]` under `on:` in `pages.yml`. GitHub Pages hosts only the app's static files. Chats never leave each visitor's browser.

To build for any other sub-path yourself, run `BASE_PATH=/some/path/ npm run build`. The manifest, service worker scope, icons and asset URLs all follow `BASE_PATH`. Git Bash on Windows rewrites values that start with `/` into Windows paths, so prefix the command with `MSYS_NO_PATHCONV=1`, or use PowerShell: `$env:BASE_PATH='/some/path/'; npm run build`.

## Project structure

```
src/
  lib/
    parser/        parseChat.ts (header patterns + state machine), classify.ts (system/media/deleted/edited), dates.ts (date-order detection)
    importer/      draft.ts (file → parsed draft), build.ts (draft + choices → records), worker.ts/client.ts (Web Worker), ambiguity.ts
    db/            db.ts (Dexie schema v1), repo.ts (CRUD, batched import with rollback, search), backup.ts, storage.ts
    zip.ts         safe ZIP listing/extraction (fflate)
    decode.ts      BOM / encoding detection
    perspective.ts sideOf(): which side a message is drawn on
    rows.ts        date separators and sender grouping for the virtual list
    search.ts      in-chat search index and highlighting
    richText.ts    WhatsApp formatting + safe links (rendered as text)
    format.ts, media.ts, exportText.ts, settings.ts, pwaStore.ts …
  components/
    home/          ChatList, ChatListItem
    chat/          ChatView, MessageList (react-virtuoso), MessageBubble, MediaContent, RichText
    import/        ImportWizard, SourceStep, DateStep, DetailsStep
    dialogs/       PerspectiveDialog, ChatInfoDialog, ImageViewer, confirm/prompt/date dialogs
    settings/      SettingsPanel (theme, privacy, storage, backup/restore, install, delete all)
    ui/            Avatar, Dialog, Menu, IconButton, Toast
tests/             unit + component tests and synthetic fixtures
e2e/               Playwright tests (Android-sized phone + desktop)
docs/ARCHITECTURE.md  data model, timestamp convention, design decisions
```

## Known limitations

- **Languages:** system notices are classified from English patterns. Notices in other languages are still shown as centred system messages when they have no `Name:` prefix. A notice that contains `": "` in another language may show up as a message from an odd sender. You can fix that in the participant review step.
- **Localized media markers:** `(file attached)` and `<Media omitted>` are recognized in English. Other languages show as plain text, but no text is lost.
- **Quoted replies, reactions, polls and view-once media** are not part of WhatsApp's text export, so Chatss can't show them. Polls appear as their exported text.
- **Media matching** uses exact file names only, which is reliable but means renamed files aren't matched.
- **Very large ZIPs** are loaded into memory to read them. The limits are 1 GB per archive and 300 MB per media file; phones with little RAM may still struggle below those limits. Backups are created and restored on the main thread, so the UI may pause briefly for large backups.
- **HEIC photos** are stored but only display in browsers that support HEIC (mainly Safari).
- **Storage** depends on the browser's quota. Quota errors are caught: the import rolls back and you get a clear message.
- **Global message search** scans IndexedDB and stops at 60 results. On very large libraries, searching inside a chat is faster.
- **Timestamps** are kept as written (floating local time) and are not converted between time zones.
