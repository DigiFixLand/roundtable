# RoundTable — MSI Primary Host (2026-11-08)

## Operational decision

**MSI is the intended and current primary host. HUB-PC is no longer the RoundTable runtime.** This supersedes earlier HUB-PC deployment references in PRIVATE_DEPLOYMENT.md. Do not move the service back to HUB-PC without an explicit user decision.

## Verified deployment

- MSI user: `MSI\eksol`
- MSI working tree: `C:\Users\eksol\Documents\DFL-RoundTable\dfl-roundtable`
- GitHub: `DigiFixLand/roundtable`, branch `deploy/private-access-pwa`
- Local runtime: Next.js production server bound to `127.0.0.1:3000` on MSI, `HTTP 200`
- Scheduled Task: `DFL RoundTable MSI Server`, running as SYSTEM, starts at Windows boot
- MSI Windows cloudflared service: Running, Automatic, official version 2026.10.7
- Cloudflare Tunnel: `dfl-roundtable-private` (`367c8ec5-8a5c-4368-9ca9-b5644259b4c9`); Cloudflare shows **Healthy** and **1 active replica**
- Cloudflare hostname: `https://roundtable.digifixland.com`, CNAME to that tunnel; origin service URL `http://127.0.0.1:3000`
- Cloudflare Access application: `DFL RoundTable - Private`, exact-email Allow rule `digifixland@gmail.com` only; `Protect with Access` / tunnel-side JWT validation enabled. Team `restless-boat-d165` and its application AUD tag verified
- Anonymous external requests to `/`, `/api/providers`, `/api/history`, `/api/consensus` all returned HTTP 302 to the Cloudflare Access login, not API data
- MSI test suite: **595/595 PASS**; production build PASS; PWA manifest served HTTP 200
- MSI nightly backup task: `DFL RoundTable MSI SQLite Backup`, daily 20:00, SYSTEM; real task run LastTaskResult 0, integrity=ok, backups stored at `C:\Users\eksol\Documents\DFL-RoundTable\backups\roundtable`, retention 14
- MSI on AC power uses Windows sleep timeout 0 (never); battery power and lid behavior can still suspend the laptop. Keep MSI powered and awake for remote access

## Outstanding actions / limits

1. **API credentials are not migrated.** Local git-ignored `C:\Users\eksol\Documents\DFL-RoundTable\dfl-roundtable\.env.local` has placeholders `OPENROUTER_API_KEY=` and `OPENAI_API_KEY=`. Their values must be entered locally on MSI, never pasted in chat, commands, GitHub, screenshots, or public links. Secure automated cross-computer key transfer was blocked. Keys remain in the preserved HUB-PC local file as a fallback.
2. After adding credentials locally, restart `DFL RoundTable MSI Server` via Task Scheduler to reload the environment. Then verify the provider list and execute a low-budget real completion. Keep OpenRouter spend limits.
3. **Authenticated external browser/mobile test remains pending:** sign in with the allowlisted email (Cloudflare one-time login if prompted), confirm Setup/Run/History/export, and install PWA on the phone.
4. Perform a full application-level restore rehearsal later; only the SQLite backup/integrity checks are currently verified.
5. Cloudflare Tunnel token is stored by the Windows service installer in its service config, not in Git. A temporary origin-zone authorization certificate on MSI was removed after service installation.

## HUB-PC rollback state

- Earlier HUB-PC repository, `.env.local`, SQLite and backups are retained. HUB-PC history had 0 runs when checked.
- Tasks `DFL RoundTable Local Server` and `DFL RoundTable SQLite Backup` on HUB-PC were confirmed Disabled.
- No cloudflared service was installed on HUB-PC. Do not enable both hosts for the same remote-managed tunnel without an explicit multi-replica plan.

## On MSI: safe checks

```powershell
Get-Service cloudflared
Get-ScheduledTask -TaskName 'DFL RoundTable MSI Server'
Get-ScheduledTaskInfo -TaskName 'DFL RoundTable MSI SQLite Backup'
curl.exe --noproxy '*' -I http://127.0.0.1:3000/
```

Restart the app after credential edits (in an elevated PowerShell on MSI):

```powershell
Stop-ScheduledTask -TaskName 'DFL RoundTable MSI Server'
Start-ScheduledTask -TaskName 'DFL RoundTable MSI Server'
```

The installed app is PWA-ready via HTTPS, not a packaged native APK/EXE. All permitted users currently share the same SQLite history. There is no public anonymous access.
