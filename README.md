# Personal OS — Productivity Dashboard

A zero-dependency desktop and web productivity dashboard built with vanilla HTML, CSS, native ES modules, and a **Tauri v2 + Rust-owned SQLite (`rusqlite`)** backend for permanent local disk storage.

## Features

- **Dashboard**: Quick-glance counters (`Active Tasks`, `Upcoming Events`, `Active Goals`, `Monthly Subscriptions`), due/overdue Kanban items, upcoming events, 30-day subscription renewals, goal progress overview, and Kanban summary.
- **Kanban**: Three-column board (`To Do`, `In Progress`, `Done`) with priority levels (`Low`, `Medium`, `High`), due-date indicators (`Overdue`, `Due today`, `Upcoming`), priority filtering, full card editing, and drag-and-drop between columns.
- **Calendar**: Month grid paired with a chronological events list (`Upcoming`, selected day, `All`) for appointments, birthdays, events, and holidays.
- **Subscriptions**: Recurring commitment tracker across 12 categories and 4 frequencies (`Weekly`, `Monthly`, `Quarterly`, `Yearly`), with automatic next-renewal calculation and 30-day renewal highlighting.
- **Goals**: Measurable long-term objectives with progress bars, remaining amounts, inline step/custom adjustments, and completion highlighting.
- **Global Search**: Instant search (`Ctrl+K` / `Cmd+K`) across Kanban titles/notes, Calendar titles/notes, Subscription names/categories/notes, and Goal titles.
- **Permanent SQLite Storage + JSON Backup**: Stores all data atomically in SQLite (WAL mode) when running the desktop app, with automatic `localStorage` fallback in browsers and validated JSON export/import.

## Project Structure

```text
Dashboard/
├── package.json               # Tauri CLI scripts (dev, build, serve)
├── dashboard.html             # Original standalone single-file offline version
├── README.md
├── .gitignore
├── src/                       # Modular static frontend (no bundler needed)
│   ├── index.html             # App shell
│   ├── assets/favicon.svg
│   ├── css/
│   │   ├── tokens.css         # Design tokens & light/dark theme variables
│   │   ├── base.css           # Reset, layout shell, shared UI & modal styles
│   │   └── views.css          # View-specific styles & responsive breakpoints
│   └── js/
│       ├── main.js            # Entry point, routing, topbar/sidebar & shortcuts
│       ├── constants.js       # App ID/version, columns, categories & SVG icons
│       ├── state.js           # Tauri SQLite bridge + localStorage fallback & theme
│       ├── utils.js           # Date math, renewal calculator, formatting & escaping
│       ├── ui.js              # Modals, confirmations, toasts & global search
│       ├── backup.js          # JSON export, schema validation & import
│       └── views/
│           ├── dashboard.js
│           ├── kanban.js
│           ├── calendar.js
│           ├── subscriptions.js
│           └── goals.js
└── src-tauri/                 # Tauri v2 + Rust SQLite backend
    ├── Cargo.toml
    ├── build.rs
    ├── tauri.conf.json
    ├── capabilities/default.json
    ├── icons/
    └── src/
        ├── main.rs            # Windows entrypoint
        ├── lib.rs             # Tauri app builder & IPC commands
        └── db.rs              # SQLite schema, WAL mode & transactional state I/O
```

## Running & Building

### Desktop App (Tauri + SQLite)

```bash
# Install the Tauri CLI (once)
npm install

# Launch the desktop app in development mode
npm run dev

# Build a standalone Windows executable & installer
npm run build

# Build a Debian/Linux Mint .deb package (when running on Linux)
npm run build:deb
```

When running in Tauri, your SQLite database is stored permanently on disk:

- **Windows:** `%APPDATA%\com.personalos.dashboard\personal-os.db`
- **Linux Mint:** `~/.local/share/com.personalos.dashboard/personal-os.db`

### Building a `.deb` Installer on Linux Mint

Tauri compiles native desktop installers on the target OS (a `.deb` must be built on Linux, not Windows). On a Linux Mint 21.x or 22.x machine:

1. **Install prerequisites (once):**
   - **System packages:**
     ```bash
     sudo apt-get update
     sudo apt-get install -y build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libwebkit2gtk-4.1-dev pkg-config
     ```
   - **Rust (`>= 1.87.0`):**
     ```bash
     curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
     source "$HOME/.cargo/env"
     ```
   - **Node.js (v20+ LTS) & npm:** install via `apt`, `nvm`, or [nodejs.org](https://nodejs.org/).

2. **Build the `.deb` package:**
   ```bash
   chmod +x scripts/build-deb.sh
   ./scripts/build-deb.sh
   ```
   *(You can also pass `./scripts/build-deb.sh --install-deps` to have the script run the `apt-get` prerequisite install automatically, or run `npm install && npm run build:deb` directly.)*

3. **Install on Linux Mint:**
   ```bash
   sudo apt install ./src-tauri/target/release/bundle/deb/*.deb
   ```
   *(Or double-click the `.deb` file in Nemo to open it with GDebi.)*

4. **Uninstall later (optional):**
   ```bash
   sudo apt remove personal-os-dashboard
   ```

> **Note:** `scripts/build-deb.sh` uses Unix LF line endings (`.gitattributes` enforces `*.sh text eol=lf`). If you copy files from Windows to Linux Mint via a ZIP or USB drive rather than Git, run `chmod +x scripts/build-deb.sh` before executing it.

### Building the `.deb` from Windows via Docker

If Docker Desktop is running on Windows, you can build a Linux Mint 21.x/22.x-compatible `.deb` (via Ubuntu 22.04) directly into `dist-linux/`:

```bash
npm run build:deb:docker
```

The exported installer is written to `dist-linux/*.deb`.

### Browser Mode (`localStorage` fallback)

You can also serve `src/` in any browser without compiling Rust:

```bash
npm run serve
```

Then open `http://localhost:8080/`.

> **Single-file offline fallback:** `dashboard.html` remains at the root and can still be opened directly via `file://`.

## Migrating Data from `dashboard.html`

1. Open `dashboard.html` and click **Export data** in the bottom-left sidebar.
2. Open the Tauri desktop app (or `http://localhost:8080/`) and click **Import data** to load your JSON backup directly into SQLite.

## Keyboard Shortcuts

- `Ctrl+K` / `Cmd+K` — Focus global search
- `ArrowUp` / `ArrowDown` / `Enter` — Navigate and jump to search results
- `Escape` — Clear search or close active modal
