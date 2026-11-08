# RoundTable — Private Mobile / Desktop Deployment

## Current verified state

- Repository: DigiFixLand/roundtable
- Working branch: `deploy/private-access-pwa` (do not merge into `main` before review).
- Target hostname (NOT YET LIVE): `roundtable.digifixland.com`
- Origin: `http://127.0.0.1:3000` on HUB-PC only.
- Windows Scheduled Task: `DFL RoundTable Local Server`, at Windows user logon.
- SQLite backup task: `DFL RoundTable SQLite Backup`, daily at 20:00 local time (while the Windows user session is available). `ops/windows/backup-roundtable.cjs` uses SQLite online backup, validates integrity, and retains the newest 14 backups outside Git at `C:\Users\MyPc\Documents\DFL-RoundTable\backups\roundtable`. A real backup was verified.
- PWA assets already existed; manifest now includes `id`, `start_url`, `scope`, 192/512 icons, and `standalone` display. Apple home-screen metadata enabled.
- Official `cloudflared` binary downloaded to `C:\Users\MyPc\Documents\DFL-RoundTable\bin\cloudflared.exe` (outside Git). Release SHA-256 and Authenticode signature were checked.
- DNS for `digifixland.com` uses Cloudflare. The proposed hostname was not resolved during preparation.
- No public tunnel route, DNS entry or Access policy has been created yet.
- No cloudflared tunnel token or Cloudflare API credential has been stored in the repo.

## Deployment order — security-critical

1. Sign into the owning Cloudflare account and verify `digifixland.com` is in that account. Do not touch the production apex or www records.
2. **Create a Cloudflare Access Self-hosted application FIRST**, with the exact hostname `roundtable.digifixland.com`. Enable an explicit Allow policy for approved owner email address(es) only, e.g. `digifixland@gmail.com`, after verifying intended recipients. Do not add broad domain-wide allow rules or bypass rules.
3. Test Access challenge and rejection behavior. Anonymous users must not reach `/api/history`, `/api/consensus`, or `/api/providers`.
4. Create a dedicated remote-managed tunnel named e.g. `dfl-roundtable-private`. Configure published application route for `roundtable.digifixland.com` to `http://127.0.0.1:3000`. Turn on **Protect with Access** / token validation at the tunnel when available.
5. Install the official tunnel connector as a Windows service using the token in Cloudflare's secure UI/service setup (never paste the token into chat, code or Git). Recheck the service after restart. Keep origin bound to 127.0.0.1 and do not open inbound firewall ports.
6. Verify from an unauthenticated Internet client that every route is blocked or redirected to Access login. Then authenticate with the permitted account and confirm the app, a tiny two-seat run, History persistence, and export. Recheck that credentials do not appear in client JSON.
7. On mobile HTTPS URL, use Safari > Share > Add to Home Screen (iOS) or Chrome > Install app/Add to Home screen (Android). On Windows use Edge/Chrome > Install this site as an app.
8. The scheduled SQLite backup and integrity verification are already in place. Before production use, also perform an isolated full restore exercise and monitor HUB uptime. If 24/7 availability is required, move the server to an always-on host with the same Access protections.

## Safety / caveats

- Current app has no native multi-user authorization. Cloudflare Access is mandatory for an Internet-accessible route. All authorized visitors currently share the same SQLite run history.
- Do not expose a random quick tunnel, do not create a public route before Access, and never publish the app directly on 0.0.0.0.
- Cost estimates for unpriced OpenRouter models can read as zero: this is unknown pricing, not free service. Keep OpenRouter key spending limits.
- PWA installability requires HTTPS (or same-device localhost). Offline use is not supported and must not cache customer history or API results.
- HUB-PC must be powered on and signed into Windows for the local scheduled task to run. The task is an at-logon task, not a boot service.
- Database file and `.env.local` are Git-ignored; do not commit either.
