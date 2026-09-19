# rescicle — first user build v0.0.3

Local-first desktop MVP for the first research user.

## Download

Windows (x64) installer:

**[Download rescicle Setup (latest release)](https://github.com/ShoheiImamura/rescicle-alpha/releases/latest/download/rescicle-0.0.3.Setup.exe)**

All versions are on the [Releases page](https://github.com/ShoheiImamura/rescicle-alpha/releases).

Run the downloaded `rescicle-0.0.3 Setup.exe`. The installer is not code-signed, so Windows SmartScreen may show a warning; choose **詳細情報** → **実行** to continue. rescicle installs per user (no administrator rights needed) and launches automatically when installation finishes.

### Uninstall

Remove rescicle from **設定 → アプリ → インストールされているアプリ** (or *Apps & features*) like any other application. This deletes the program files under `%LocalAppData%\rescicle` together with its shortcuts.

Your research folders are never touched: rescicle only references files in place.

The following are kept on purpose so that a reinstall picks up where you left off. Delete them by hand if you want a clean slate:

- `%AppData%\rescicle` — settings, the SQLite database with research objects and conversations, and the agent workspace.
- `%UserProfile%\.codex` — the ChatGPT sign-in kept by the bundled Codex. Use **サインアウト** in **AI接続** before uninstalling if you want it cleared.
- The Claude Code MCP registration, if you ran the setup command. Claude Code will otherwise keep reporting a failed `rescicle` server:

```powershell
claude mcp remove --scope user rescicle
```

## User experience

1. Install and launch rescicle.
2. Select an existing research folder. Files are referenced in place; rescicle does not move or upload them.
3. Open **AI接続**.
4. Choose one of the two agent paths:
   - **ChatGPT / Codex**: click **ChatGPTでサインイン**. No API key is required. rescicle launches the bundled Codex app-server and Codex manages the ChatGPT OAuth session.
   - **Claude Code**: click **Claude Code設定コマンドをコピー**, run it once in a terminal, then use Claude Code as the conversation UI through rescicle's local MCP server.
5. Talk normally about the research.
6. Question / Hypothesis / Prediction / Measurement appear as research objects and can be Confirmed / Rejected.
7. Existing local files can be registered as Assets.

## AI boundary

### Codex mode

Codex runs in an isolated rescicle agent directory, **not** in the research folder. rescicle sends:

- conversation text
- summarized Research Objects / Relations
- relative file names, size, modification time

v0 does **not** automatically send raw file contents.

Codex app-server `outputSchema` is used to obtain a typed `{ reply, operations }` response. rescicle Core validates operations before writing SQLite.

### Claude Code mode

rescicle can run as a local stdio MCP server. Claude Code receives tools for:

- reading current research context
- creating proposed objects
- creating proposed relations
- confirming/rejecting objects
- listing project file metadata
- registering an existing local file as an Asset

The generated setup command is equivalent to:

```powershell
claude mcp add --transport stdio --scope user rescicle -- "C:\\...\\rescicle.exe" --mcp-server
```

Open a Project in rescicle before using these MCP tools.

## Domain v0

Primary objects:

- Question
- Hypothesis
- Prediction
- Measurement
- Asset
- Note

Relations:

- `addresses`
- `predicts`
- `tested_by`
- `produces`
- `references`
- `related_to`

Each research object/relation records `origin` and `status` (`proposed`, `confirmed`, `rejected`).

## Development

Node.js 24 recommended.

```bash
npm install
npm test
npm start
```

Windows installer:

```bash
npm run make
```

The `@openai/codex` dependency is packaged with the desktop app, including its platform-specific binary dependency. End users do not need npm or a separately installed Codex CLI for the embedded ChatGPT/Codex path.

## Still intentionally out of scope

- Voice / realtime voice
- Always-on monitoring
- Jev
- Observation / Analysis / Result / Claim
- Literature search
- Paper generation
- Cloud sync
- Collaboration / publication
- Automatic updater / signing
