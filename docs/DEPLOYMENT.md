# Deployment guide

The system runs anywhere that has Docker, or Node.js 20+ with PostgreSQL 14+ (Redis optional). No special hardware.

## Option A — Docker Compose (recommended, local server or any cloud VM)

```bash
git clone <repo> mc2026-voting && cd mc2026-voting
cp .env.example .env
# edit .env: APP_SECRET, POSTGRES_PASSWORD, ADMIN_PASSWORD, PUBLIC_URL, SMS_*
docker compose up -d --build                 # nginx + 2 app replicas + Postgres + Redis
docker compose exec app node dist/cli/seed.js # optional: mock exhibitors for rehearsal
```
Open `http://<server>/admin`, sign in, then **Security → Set up two-factor**.

Scale the stateless tier at any time:
```bash
docker compose up -d --scale app=4
```

**Sizing for MC2026 (≈1,000 visitors):** 2 vCPU / 4 GB RAM VM is ample for everything on one host. Our load test pushed 1,000 full voting journeys through in about 7.5 seconds on a similar box.

### TLS
Put a certificate on nginx (uncomment the `listen 443` lines in `deploy/nginx.conf`, mount `/etc/nginx/certs`) or terminate TLS at your cloud load balancer. Geolocation **requires HTTPS** in browsers, so TLS is mandatory for the geofence to work on phones.

## Option B — Without Docker

```bash
# front-end
cd frontend && npm ci && npm run build && cd ..
# API (serves frontend/dist automatically)
cd backend && npm ci && npm run build
export DATABASE_URL=postgres://mc:secret@db-host:5432/mc2026
export REDIS_URL=redis://redis-host:6379      # optional
export APP_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")
export ADMIN_PASSWORD='a-long-password'  NODE_ENV=production  TRUST_PROXY=1  PUBLIC_URL=https://vote.example.org
npm start            # migrations run automatically on boot (advisory-locked, safe with many replicas)
```
Run 2+ processes (systemd / PM2) behind nginx using `deploy/nginx.conf`.

## Development

```bash
cd backend && npm install && cp ../.env.example .env   # set DATABASE_URL, APP_SECRET, OTP_DEV_ECHO=true
npm run build && npm run seed && npm start              # API on :3000
cd ../frontend && npm install && npm run dev            # React on :5173, proxies /api and /img to :3000
```

## Option C — Managed cloud (production-grade HA)

| Tier | AWS example | Azure example | GCP example |
|---|---|---|---|
| App (container, ≥2 instances, 2 AZs) | ECS Fargate / App Runner | Container Apps | Cloud Run (min instances 2) |
| PostgreSQL with automatic failover | RDS Multi-AZ | Flexible Server (zone-redundant HA) | Cloud SQL HA |
| Redis | ElastiCache | Azure Cache for Redis | Memorystore |
| TLS + LB | ALB | Front Door / App Gateway | HTTPS LB |

Set `TRUST_PROXY` to the number of proxy hops (usually `1`), and make sure the LB passes the real client IP in `X-Forwarded-For` — the on-site IP check depends on it. For SSE, set the LB idle timeout ≥ 60 s (the server sends a keep-alive every 20 s).

## Configuration reference

All event-level settings (categories, exhibitors, voting window, IP ranges, geofence, display key) are in the database and edited from **/admin**. Environment variables only cover infrastructure — see `.env.example` for the full list. Key ones:

| Variable | Purpose |
|---|---|
| `APP_SECRET` | Master secret (≥32 chars) — derives JWT, encryption and HMAC keys. **Back it up**: losing it makes stored names/phones unreadable. |
| `DATABASE_URL`, `REDIS_URL` | Datastores (Redis optional) |
| `TRUST_PROXY` | Proxy hops in front of the app — critical for the IP check |
| `PUBLIC_URL` | Base URL printed in QR codes and display links |
| `SMS_PROVIDER` + credentials | `console`, `twilio`, or `http` webhook |
| `OTP_DEV_ECHO` | Demo only — shows the code on screen; ignored in production |

## Venue network setup (on-site restriction)

1. Connect to the venue Wi-Fi and open **Admin › Settings › On-site access**. "This computer's network" shows the address the server sees. Click **Use this network**, or type the venue's address or range (one per line). Setting up remotely works too: type the venue's values instead of using the buttons.
2. At the venue, press **Use my location** (or type the coordinates from a map); 150–300 m radius suits most venues.
3. Choose **Venue Wi-Fi or location** so visitors on mobile data can still vote by sharing location, or **Wi-Fi and location** for the strictest check.
4. Test from a phone on the venue Wi-Fi (should pass) and from a phone off-site or on another network (should be refused).

### Local event server (phones on the same Wi-Fi)

The prototype can run entirely on one computer at the venue; voting keeps working if the internet drops (only SMS delivery needs it). Two things need care on a local server:

- **Phones only share GPS with HTTPS pages.**
- **Docker Desktop (Windows/macOS) hides visitors' addresses**: every phone would appear as Docker's own gateway (e.g. `172.19.0.1`), so the IP check could not tell phones apart.

`scripts/lan-gateway.mjs` solves both. It serves HTTPS to the phones with a local certificate and forwards each phone's real address to nginx.

```
phone ──HTTPS──▶ lan-gateway (:443) ──▶ nginx (127.0.0.1:3000) ──▶ app replicas
```

1. In `.env`:
   ```
   HTTP_PORT=3000
   HTTP_BIND=127.0.0.1              # nginx is reachable from this computer only
   REAL_IP_CONF=real-ip.lan.conf    # nginx trusts the address the gateway forwards
   PUBLIC_URL=https://<laptop Wi-Fi address>   # printed by the gateway; used by the QR code
   ```
2. `docker compose up -d`, then `node scripts/lan-gateway.mjs` (needs `openssl` once to create `deploy/certs/`; Git for Windows includes it). Keep the gateway window open during the event.
3. In **On-site access**, allow the Wi-Fi range the gateway prints (e.g. `192.168.1.0/24`).
4. Phones open the printed `https://` address and accept the certificate warning once (**Advanced › Proceed**).

Why it is safe: nginx is bound to `127.0.0.1`, so phones cannot reach it except through the gateway, and the gateway always overwrites `X-Forwarded-For` with the connecting phone's address, so a phone cannot claim another address. On a cloud or Linux server leave `HTTP_BIND` and `REAL_IP_CONF` unset: nginx then faces visitors directly and ignores `X-Forwarded-For`.

**Demo tip:** a second network shows both checks live. Turn on the laptop's mobile hotspot before starting the gateway (Windows uses `192.168.137.0/24`) and connect a phone to it. The page loads, but the phone is not on the allowed Wi-Fi range, so it is asked for its location: deny it and voting is refused; allow it inside the venue radius and it passes (with **Wi-Fi and location**, the hotspot phone is always refused).

## Event-day runbook

| When | Action |
|---|---|
| Day before | Rehearse with seeded data → **Results → Reset** (tick "delete visitors") → set the venue network and location in **Settings › On-site access** |
| Doors open | Open the results-screen link from the **Dashboard** on the TVs; **Dashboard → Open voting** |
| During | Watch the Dashboard (votes, votes in the last 5 min, on-site protection status). `/readyz` for health. |
| Close | **Close voting** → TV switches to "Final results" with winners highlighted → **Export CSV/JSON** |
| After | Export opted-in visitors for outreach; purge visitor data per retention policy |

## Monitoring

- `GET /healthz` — liveness (process up)
- `GET /readyz` — readiness (DB reachable; reports Redis state)
- Structured JSON logs on stdout (ship to CloudWatch / Loki / Azure Monitor)
- `audit_log` table for security review

## Backups

Daily `pg_dump` (or managed PITR). The `APP_SECRET` must be backed up separately — encrypted PII is unrecoverable without it.

## Testing

```bash
createdb mc2026_test
cd backend && TEST_DATABASE_URL=postgres://mc:mc@localhost:5432/mc2026_test npm test   # 30 Jest unit + e2e tests
OTP_DEV_ECHO=true npm start &   # then, with voting open, from the repo root:
node scripts/loadtest.js 1000 250 http://localhost:3000            # 1,000-visitor load test
node scripts/simulate.js 60 10                                      # realistic demo traffic
```
