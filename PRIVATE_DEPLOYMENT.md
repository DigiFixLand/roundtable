# RoundTable — Private Mobile / Desktop Deployment

## Current verified state

- Repository: DigiFixLand/roundtable
- Working branch: `deploy/private-access-pwa` (do not merge into `main` before review).
- Protected hostname: `https://roundtable.digifixland.com` (DNS and Access redirect active; the connector is **not yet running**, so authenticated requests cannot reach the app yet).
- Origin: `http://127.0.0.1:3000` on HUB-PC only.
- Windows Scheduled Task: `DFL RoundTable Local Server`, at Windows user logon.
- SQLite backup task: `DFL RoundTable SQLite Backup`, daily at 20:00 local time (while the Windows user session is available). `ops/windows/backup-roundtable.cjs` uses SQLite online backup, validates integrity, and retains the newest 14 backups outside Git at `C:\Users\MyPc\Documents\DFL-RoundTable\backups\roundtable`. A real backup was verified.
- PWA assets already existed; manifest now includes `id`, `start_url`, `scope`, 192/512 icons, and `standalone` display. Apple home-screen metadata enabled.
- Official `cloudflared` binary downloaded to `C:\Users\MyPc\Documents\DFL-RoundTable\bin\cloudflared.exe` (outside Git). Release SHA-256 and Authenticode signature were checked.
- Cloudflare Zero Trust Free enabled. Access application `DFL RoundTable - Private` protects the exact hostname with an Allow policy for the single email `digifixland@gmail.com`; other users are deny-by-default.
- Dedicated remotely-managed Cloudflare Tunnel `dfl-roundtable-private` exists (ID `367c8ec5-8a5c-4368-9ca9-b5644259b4c9`). Published CNAME/route points to `http://127.0.0.1:3000`; no apex/www change.
- `Protect with Access` is enabled on the published route; persisted team name was verified as `restless-boat-d165` (not `restless-boat-dl65`) and the application's AUD tag is configured.
- Anonymous HTTPS requests for `/`, `/api/history`, `/api/providers`, and `/api/consensus` all returned a `302` redirect to the Cloudflare Access login. No API data was returned.
- The tunnel connector is not installed and the dashboard reported no connection. A local `cloudflared tunnel run <name>` failed because remotely-managed tunnel credentials were missing; this is expected until the official service installation is completed.
- No Cloudflare Tunnel token or API credential has been stored in the repo. A temporary unneeded RSA key file from setup was removed. The Cloudflare account authorization certificate remains outside Git on HUB-PC.

## Deployment order — security-critical

1. Sign into the owning Cloudflare account and verify `digifixland.com` is in that account. Do not touch the production apex or www records.
2. **Create a Cloudflare Access Self-hosted application FIRST**, with the exact hostname `roundtable.digifixland.com`. Enable an explicit Allow policy for approved owner email address(es) only, e.g. `digifixland@gmail.com`, after verifying intended recipients. Do not add broad domain-wide allow rules or bypass rules.
3. Test Access challenge and rejection behavior. Anonymous users must not reach `/api/history`, `/api/consensus`, or `/api/providers`.
4. Create a dedicated remote-managed tunnel named e.g. `dfl-roundtable-private`. Configure published application route for `roundtable.digifixland.com` to `http://127.0.0.1:3000`. Turn on **Protect with Access** / token validation at the tunnel when available.
5. **REMAINING OPERATOR ACTION:** On HUB-PC open Cloudflare > Tunnels > `dfl-roundtable-private` > Overview > Add a replica > Windows. Copy the Cloudflare-provided `cloudflared.exe service install <TOKEN>` command locally. Open Command Prompt **as Administrator**, `cd /d "C:\Users\MyPc\Documents\DFL-RoundTable\bin"`, and paste the service-install command. Never paste the command/token into chat, the repository, or a shared log. Confirm the `cloudflared` Windows service reports Running. Afterward, recheck after a Windows restart. Keep the app bound to 127.0.0.1; open no inbound firewall ports.
6. **ANONYMOUS ACCESS CHECK PASS:** `/` and all three API paths redirect to Access login. **STILL PENDING:** With the connector running, authenticate using the allowlisted account, verify the app and a two-seat run, History persistence, and export. Recheck that API credentials never appear in client JSON.
7. On mobile HTTPS URL, use Safari > Share > Add to Home Screen (iOS) or Chrome > Install app/Add to Home screen (Android). On Windows use Edge/Chrome > Install this site as an app.
8. The scheduled SQLite backup and integrity verification are already in place. Before production use, also perform an isolated full restore exercise and monitor HUB uptime. If 24/7 availability is required, move the server to an always-on host with the same Access protections.

## Safety / caveats

- Current app has no native multi-user authorization. Cloudflare Access is mandatory for an Internet-accessible route. All authorized visitors currently share the same SQLite run history.
- Do not expose a random quick tunnel, do not create a public route before Access, and never publish the app directly on 0.0.0.0.
- Cost estimates for unpriced OpenRouter models can read as zero: this is unknown pricing, not free service. Keep OpenRouter key spending limits.
- PWA installability requires HTTPS (or same-device localhost). Offline use is not supported and must not cache customer history or API results.
- HUB-PC must be powered on and signed into Windows for the local scheduled task to run. The task is an at-logon task, not a boot service.
- Database file and `.env.local` are Git-ignored; do not commit either.
