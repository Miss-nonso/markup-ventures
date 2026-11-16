# Markup Ventures · Industrial Intelligence

A React / Next.js industrial dashboard connected to a tenant-isolated FastAPI, PostgreSQL/TimescaleDB, and Redis backend.

## Run locally — from a fresh checkout

### Prerequisites

- Docker Desktop (running) or Docker Engine with the Compose plugin.
- Node.js 22.6+ and npm for the frontend. Node.js 24 LTS is also supported.
- A Bash-compatible terminal (Linux, macOS or Windows WSL) for the commands below.
- Free local ports **3000** (frontend) and **8000** (API).

Run every command from the repository root, the directory containing `compose.yaml` and `package.json`.

### 1. Configure the local environment

```sh
cp -n .env.example .env
openssl rand -hex 32
```

Open `.env`, choose a database password, and paste the generated random value as `JWT_SECRET`:

```dotenv
POSTGRES_PASSWORD=choose-a-local-database-password
JWT_SECRET=paste-the-generated-random-value-here
APP_ENV=development
DEMO_LOGIN_ENABLED=true
WEB_ORIGIN=http://localhost:3000
API_ORIGIN=http://localhost:8000
```

Do not commit `.env`; it is ignored by Git. Existing databases retain the password used at initialization, so keep your existing password if you have already started the project.

### 2. Start the backend and databases

```sh
docker compose up -d --build db redis api worker
docker compose ps
```

The first run downloads images and installs API dependencies. Compose initializes the PostgreSQL/TimescaleDB schema automatically on a fresh volume and starts Redis, FastAPI and the telemetry worker. No manual migration command is needed.

Check http://localhost:8000/readyz — it should return `{"status":"ready"}`. To investigate startup errors:

```sh
docker compose logs --tail=100 api worker db redis
```

### 3. Start the frontend

```sh
npm ci
npm run dev
```

Keep this terminal running. Open **http://localhost:3000/login** and sign in:

- Email: `operator@markupventures.com`
- Password: `Markup-Demo-2026!`

These public credentials work only when local demo authentication is enabled. The login page shows them for convenience. Click **Load sample fleet** once to populate saved sample assets, readings and alerts, or use **Add asset** to start with your own records.

For an entirely Docker-based setup, replace this frontend step with:

```sh
docker compose up -d --build web
```

Do not run both frontend instances on port 3000. The local Next.js server connects to `http://127.0.0.1:8000`; Compose configures the Docker frontend to use `http://api:8000`. For a different backend address, set `API_INTERNAL_URL` in `apps/web/.env.local` and restart Next.js. If you change browser origins/ports, update WEB_ORIGIN/API_ORIGIN too and recreate the API.

### 4. Use, stop and restart

- Dashboard: http://localhost:3000
- Interactive API documentation: http://localhost:8000/docs
- In Swagger, execute `/auth/login` first; the browser then sends the session cookie automatically to endpoints such as `/alerts`.
- Always browse using `localhost` (or the supported development loopback aliases), not the server bind address `0.0.0.0`.
- Use **Light mode / Dark mode** in the header or login screen to switch themes. The browser remembers your preference; dark is the initial default.
- Fleet telemetry opens with **All metrics** selected. It draws one line per metric, normalizing each metric's observed range to 0–100 so different units can be compared. Constant series sit at 50; tooltips show original values and units. Select a single metric to see its original engineering scale. Missing readings are never turned into zeros.

Press Ctrl+C in the frontend terminal and stop the backend with:

```sh
docker compose down
```

This preserves database volumes and saved records. Restart with steps 2 and 3. **Do not use `docker compose down -v` unless you intend to delete the database.**

### Common setup problems

| Symptom | What to check |
|---|---|
| Database asks for POSTGRES_PASSWORD | Use `docker compose up -d db` from the project root. Running the raw image through Docker Desktop does not inherit this project's `.env`. |
| Login says backend unavailable | Start `api`, `db`, and `redis`; check `/readyz` and container logs. |
| Untrusted request origin | Open `http://localhost:8000/docs`; avoid `0.0.0.0`. Keep configured browser origins consistent. |
| Authentication required | Log in in the same browser/client; sessions expire after one hour. |
| Too many login attempts | Wait 15 minutes. Do not repeatedly retry; the development proxy shares an IP limit. |
| Port already allocated | Stop the previous app/container using that port, or configure new ports and matching origins. |
| Database password changed but login still fails | Editing `.env` does not reset a password stored in an existing volume. Use the original database password or change it through PostgreSQL. |

PostgreSQL administrator `markup` uses POSTGRES_PASSWORD. The restricted API account `markup_app` currently uses `local-development-only`. Replace that account's password and its connection string before shared deployment; production setup is described below.

## Saved operations

The dashboard loads persisted assets, alerts, metric definitions and history through the same-origin Next.js `/api/backend/...` proxy. Authentication uses the existing HttpOnly session cookie; the browser never receives database credentials.

- Register assets with location and equipment type.
- Open an asset inspector to save name, location, firmware, maintenance due date, status and notes.
- Record operator-entered measurements; device telemetry still uses the queued `/telemetry` endpoint.
- Acknowledge alerts individually or in a batch. Success is shown after the API commits; failures are surfaced.
- Reload or sign in again: saved records remain in PostgreSQL.
- Browse history over 24 hours, 7 days or 30 days. Charts use actual UTC timestamps, aggregated into at most 120 time buckets. Combined charts use normalized scales; tooltips retain engineering units.
- Export the filtered asset list with every registered metric to CSV.

The UI subscribes to authenticated tenant events for live updates, with ten-second polling as a fallback; it can be paused using the connection indicator. The dashboard currently displays up to 500 assets and 500 open alerts; total counts are reported separately. Metric summary cards aggregate all tenant readings in the selected period and flag their worst threshold condition; they are not promises of current device freshness. Assets are considered offline after their configured timeout (five minutes by default), based on telemetry or device heartbeats. There is no invented uptime percentage.

The geographic fleet view plots saved latitude/longitude coordinates on a world outline, with six named sample-site fallbacks. Assets without coordinates are counted as unlocated. Maintenance is a saved operator schedule, not an ML predictor.

## Metrics

The API registry at `/metrics` defines units and validation bounds:

| Metric key | Unit |
|---|---|
| temperature | °C |
| pressure | bar |
| vibration | mm/s |
| humidity | % |
| power_kw | kW |
| energy_kwh | kWh (cumulative meter) |
| voltage | V |
| current_a | A |
| rpm | rpm |
| flow_lpm | L/min |
| runtime_hours | h |
| efficiency_pct | % |

Metrics use the existing telemetry JSONB column and asset reported state; no new database migration is required. Unknown names, nonnumeric values, nonfinite values, out-of-range values and timestamps more than five minutes in the future are rejected. Missing values display as unavailable, not zero. Power and energy cards sum the latest displayed readings; other cards show their mean. The energy card is a meter total, not period consumption.

Manual measurements and the stream worker share storage and threshold alert handling. The worker also evaluates rolling anomalies. Existing open alerts for the same asset and metric are not duplicated. Manual measurement writes and asset changes are tenant-scoped; reported-state changes and acknowledgments are audited.

For a populated development environment, click **Load sample fleet** after login. This explicit, development-only action writes five labeled sample assets and 24 hours of readings covering all 12 metrics, plus two threshold alerts. Repeating it leaves existing sample assets untouched. Sample timestamps age normally; it does not simulate live devices forever. It never replaces user assets.

## API map

| Method | Path | Used for |
|---|---|---|
| POST | `/auth/login` | Sign in |
| GET | `/auth/me` | Session identity |
| POST | `/auth/logout` | Revoke session |
| GET | `/dashboard` | Saved assets, open alerts and counts |
| GET | `/metrics` | Metric labels, units and bounds |
| GET | `/telemetry/history?metric=temperature&hours=24` | Fleet mean history; optional `device_id` |
| GET / POST | `/assets` | List / register assets |
| PATCH | `/assets/{id}` | Save configuration and maintenance |
| POST | `/assets/{id}/readings` | Save an operator measurement |
| GET | `/alerts` | Raw alert records including acknowledged alerts |
| POST | `/alerts/{id}/acknowledge` | Persist acknowledgment |
| POST | `/telemetry` | Enqueue device ingestion (Device or SuperAdmin bearer permission) |
| POST | `/demo/seed` | Idempotent local sample fleet |
| GET | `/healthz`, `/readyz` | Liveness / database and Redis connectivity |

Swagger: http://localhost:8000/docs. Execute `/auth/login` first, then `/alerts` in the same browser. Use `localhost`, not `0.0.0.0` (a bind address). Cookie-based CLI POST/PATCH requests must include `Origin: http://localhost:8000`. Development accepts loopback aliases on configured ports. If Origin is absent, a trusted Referer is required. Explicit untrusted/null origins remain rejected.

## Authentication and deployment boundaries

One configured FleetOperator account is supported without a user-table migration. Sessions are stored in Redis, expire after one hour, rotate on login and are revoked on logout or account-configuration change. Cookies are HttpOnly and SameSite=Strict, with Secure enabled outside development. Login attempts are limited to 10 per connection IP per 15 minutes; users behind the Next.js proxy currently share that conservative limit. Production per-client limits require a configured trusted ingress.

To use a private account, generate a hash interactively:

```sh
docker compose run --rm --no-deps api python -c 'from getpass import getpass; from app.auth import password_hash; print(password_hash(getpass("New password: ")))'
```

Use a unique password of at least 16 characters. Configure `.env` (single-quote the hash to preserve `$`):

```dotenv
APP_ENV=production
DEMO_LOGIN_ENABLED=false
AUTH_EMAIL=operator@yourcompany.com
AUTH_PASSWORD_HASH='scrypt$your-salt$your-digest'
AUTH_TENANT_ID=11111111-1111-4111-8111-111111111111
WEB_ORIGIN=https://your-dashboard.example.com
API_ORIGIN=https://your-api.example.com
```

The tenant must exist. Use a random JWT_SECRET of at least 32 characters and HTTPS. `API_INTERNAL_URL` defaults to `http://127.0.0.1:8000` for a local frontend; Docker Compose sets it to `http://api:8000`. The API refuses to start with public demo authentication outside development. External bearer JWTs remain supported for device/service access (`iss=markup-auth`, `aud=markup-api`, `sub`, `exp`, `tenant_id`, `role`).

The optional MQTT profile launches a local broker simulator; the MQTT/mTLS bridge remains unimplemented. Other production work includes identity-provider integration, MFA/recovery, proper migration management, a delivery outbox, external notifications, scalable consumers, retention policies and monitoring. The stream worker currently uses a single consumer name and unbounded retention. The application is a functional foundation, not a production-certified deployment.

## Verification

```sh
npm run typecheck
npm run test:chart
npm run build
# In a Python virtual environment:
pip install -r apps/api/requirements-dev.txt
python -m unittest discover -s tests -v
# Against the running development stack:
docker compose exec -T api python < tests/live_persistence.py
```

The live test creates a temporary asset, verifies measurements, configuration, acknowledgments, new-session persistence and tenant isolation, then removes its own asset/readings/alerts. Append-only audit records remain as evidence of the test. It does not modify existing user assets.

## Operational conditions, sound, and lookbacks

Every metric has a shared threshold definition in `apps/api/app/metrics.py`, served by
`GET /metrics`. These are **demo operating envelopes**; tune them for the equipment.
Values strictly beyond the listed boundaries change state; the boundary itself stays
in the less severe band. Missing readings are gray (“No data”).

| Metric | Warning (amber) | Error (red) |
|---|---|---|
| Temperature | >60 °C | >70 °C |
| Pressure | >75 bar | >90 bar |
| Vibration | >5 mm/s | >8.5 mm/s |
| Humidity | <25 or >70 % | <15 or >85 % |
| Power demand | >50 kW | >75 kW |
| Energy meter | >10,000 kWh | >15,000 kWh |
| Voltage | <210 or >250 V | <200 or >260 V |
| Current | >60 A | >80 A |
| Rotational speed | >1,800 rpm | >2,200 rpm |
| Flow rate | <60 or >160 L/min | <40 or >200 L/min |
| Operating hours | >4,000 h | >5,000 h |
| Efficiency | <85 % | <75 % |

Other recorded values are green (“Good”). Energy and runtime are cumulative meter
milestones, not instantaneous faults or calculated consumption. Rebuild API and
worker after editing thresholds. Existing alert records retain their original severity
until a subsequent reading escalates them; historical chart conditions are evaluated
with the current threshold configuration.

Metric cards show a mean over the selected period and the **worst raw reading’s state**,
so a fleet average cannot conceal a single-device breach. Chart lines also use the
worst state in their selected period, with dash patterns and labeled legends to distinguish
metrics. Tooltips show bucket means, minima and maxima in original units. Asset
inspectors show each metric’s latest value within the period. Green indicates within
thresholds, not a guarantee that an offline device is currently healthy.

Click **Enable critical alarms** to unlock browser audio and hear a test tone.
While enabled, a beep repeats every 15 seconds while critical metric readings from
the last five minutes persist. Click **Mute alarms** to silence it. Pausing polling
also pauses the alarm. The control shows the live critical count and whether sound
is on. Historical critical cards remain red but do not trigger a live alarm.
Sound must be enabled again after a reload because browsers require a user gesture.
This is a foreground dashboard aid, not a background notification service.

Each navigation view retains its own **24 hours / 7 days / 30 days** range while
the dashboard is open. Overview and Analytics filter metric summaries, charts,
reading counts, alerts and exported metric values. Fleet map and Digital twins show
assets with readings during their selected period. Asset metric values are the latest
recorded per metric within that range; blanks mean no reading in the range. Inventory,
asset configuration, current connectivity and upcoming maintenance schedules remain
explicitly current, rather than being presented as historical snapshots.

Alert center includes open and acknowledged alerts created in its selected period;
acknowledgment is only available for open records. Maintenance shows timestamped
schedule/status/note changes in its selected period alongside current schedules.
Maintenance history begins with edits made after this feature was installed; old
schedule changes cannot be reconstructed. History is stored in the existing JSONB
asset configuration, so no migration is required. Dashboard lists/history are capped
at 500 items; metric aggregates cover all matching tenant readings.

## Brand identity

See [BRAND.md](BRAND.md) for the Markup Ventures visual identity, typography, color semantics and interface writing rules. Fonts are self-hosted; no external font service is required.

## Platform capabilities

See [FEATURES.md](FEATURES.md) for all 15 capabilities, device provisioning and simulator instructions, role-based demo accounts, multi-tenant account setup, verification commands and operating boundaries.

## Analytical workspace and responsive layouts

Analytics has its own metric selector and independent time range. It displays:

- Counters for raw metric measurements, distinct reporting devices, 95th percentile
  and population standard deviation.
- Mean/minimum/maximum trend lines in up to 120 time buckets.
- A histogram of raw readings in ten equal-width bins (one bin for a constant series).
  Bins include their lower boundary; the last also includes the maximum.
- The ten sites with the highest mean for the selected metric, with units and counts.
- A current fleet-health donut, explicitly scoped to the displayed inventory.
- Expandable histogram and site data tables for exact values and keyboard access.

The authenticated `GET /analytics?metric=temperature&hours=24` endpoint calculates
aggregates across all matching tenant readings, not a sample of chart bucket averages.
Current fleet health is intentionally separate from the historical metric filter.
Empty periods show no-data states rather than fabricated values.

Layouts adapt to phones, tablets and desktop displays. Charts stack on narrow
screens; dense tables scroll within their panels. Dialogs and asset inspectors are
bounded by the viewport and scroll vertically. Device settings collapse into a
single column with larger touch inputs. Browser checks cover all eight dashboard
views at 320, 768, 1024 and 1440 pixels, plus 390px charts and dialogs.
