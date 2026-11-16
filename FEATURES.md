# Capability map

Existing branding, themes, three-state metric cards, audible critical alarms, CSV
exports, and independent lookbacks remain part of the application.

| Capability | Where to use it | Implementation |
|---|---|---|
| Device registration / provisioning | Add asset → open asset → Provisioning | Register an asset, issue an expiring device-scoped bearer credential, rotate or revoke it. Old credentials are rejected. |
| Real-time telemetry | Live stream indicator; device simulator | HTTP ingestion → Redis Stream → worker → PostgreSQL → tenant SSE → dashboard refresh. Ten-second polling is a reconnect fallback. |
| Device health | Asset status and Device health & digital twin | Last seen, configurable offline timeout, reported firmware, battery and signal. Unknown health remains “Not reported”. |
| Sensor configuration | Asset → Hierarchy, location & sensors | Enabled metrics, sampling interval and offline timeout are saved; devices fetch configuration and acknowledge its version. Disabled sensors are rejected at device ingestion. |
| Historical data | Per-view lookback and asset readings | Persisted TimescaleDB readings; independent 24-hour, 7-day and 30-day views. |
| Time-series charts | Overview / Analytics → Fleet telemetry | All metrics or one metric, bounded time buckets, native values in tooltips, min/max and worst threshold state. |
| Alert rules | Asset → Alert rules | Per-device high/low warning and critical overrides, validated against metric ranges and ordering. Blank fields inherit defaults. |
| Anomaly detection | Asset → statistical anomaly detection | Worker evaluates rolling outliers and sudden changes; per-device toggle leaves deterministic threshold rules enabled. |
| Maintenance scheduling | Maintenance / asset maintenance form | Due dates, status, notes and timestamped history; technicians have a dedicated authorized endpoint. |
| Asset hierarchy | Asset hierarchy; parent selector | Enterprise/region/plant/line/machine/sensor records, parent links, same-tenant parent checks and cycle prevention. |
| Geographical fleet view | Fleet map; asset latitude/longitude | World outline with saved coordinates; named demo sites supply fallback coordinates. Unlocated assets are counted explicitly. |
| Device digital twins | Asset → desired and reported state | Desired settings, reported measurements/health, configuration version and applied version. Older acknowledgments cannot overwrite newer ones. |
| Role-based access | Role-specific login; UI and API guards | SuperAdmin, FleetOperator, MaintenanceTech, Auditor and device-only credentials. Permissions are enforced on the API. |
| Audit logs | Audit logs | Tenant-filtered, paginated, append-only asset and alert change records; provisioning nonce is redacted. |
| Multi-tenancy | Server account configuration and tenant provisioning script | Identity selects the tenant; PostgreSQL row-level security isolates data. Even SuperAdmin is tenant-scoped. |

## Run a real device flow locally

1. Start the stack using README.md.
2. Add an asset; open it and save its sensor settings, coordinates and parent.
3. Click **Provision device**. Copy the credential; rotation invalidates the old one.
4. In a local terminal, enter the credential without putting it into shell history:

   ```bash
   read -rsp 'Device credential: ' DEVICE_TOKEN
   export DEVICE_TOKEN
   export API_URL=http://localhost:8000
   python3 scripts/device_simulator.py
   ```

5. The simulator fetches settings, acknowledges the version, reports health and
   submits enabled metrics at the configured interval. Inspect the updated twin,
   history and live dashboard. Stop with Ctrl+C, then `unset DEVICE_TOKEN`.
6. Revoke the credential in the asset inspector; subsequent device calls are rejected.

The simulator generates labeled test activity for the asset you choose. It does not
read real hardware. Device firmware must implement the configuration endpoints for
sampling settings to affect physical hardware.

## Roles and tenants

Development demo logins share password `Markup-Demo-2026!`:

| Email | Role |
|---|---|
| operator@markupventures.com | FleetOperator |
| technician@markupventures.com | MaintenanceTech |
| auditor@markupventures.com | Auditor |

Fleet operators configure and provision devices. Technicians read data, acknowledge
alerts and edit maintenance. Auditors read operational data and audit records.
SuperAdmin has all human permissions within its assigned tenant; there is no global
cross-tenant impersonation.

For real accounts, configure `AUTH_USERS_JSON` as a JSON array of objects containing
`email`, `password_hash`, `tenant_id` and `role`. It overrides the single-account
configuration. Use the existing password-hash instructions in README.md. Single-quote
JSON in a Compose .env file to preserve dollar signs in scrypt hashes. Disable demo
authentication for non-local environments.

Create each tenant first using `scripts/create_tenant.py --name "Tenant name"` with
`ADMIN_DATABASE_URL` set to an administrator connection in a Python environment with
the API dependencies. The script prints the new tenant UUID. The runtime API must
continue to use the restricted `markup_app` database account. Configure users with
that UUID, then recreate the API and worker. Accounts are managed through deployment
configuration; this application does not yet provide self-service user administration.

## Verification

```bash
# In a Python virtual environment with requirements-dev.txt installed:
python -m unittest discover -s tests -v
# Inside the running local API container, from the repository root:
docker compose exec -T api python < tests/live_platform.py
docker compose exec -T api python < tests/live_persistence.py
npm run test:chart
npm run typecheck
npm run build
```

The platform integration test registers temporary assets, checks configuration,
hierarchy cycles, role restrictions, tenant isolation, provisioning/revocation,
health/twin acknowledgment, queued telemetry, live events, custom rules, sparse
historical readings and audit redaction. It removes only its own test assets and
measurements; append-only audit evidence remains.

## Operating boundaries

- No migrations are needed for these features; configuration uses existing JSONB fields.
- Dashboard inventory is capped at 500 assets; audit history has cursor pagination.
- Statistical anomaly windows are bounded in-memory state in the single worker and
  restart empty. They are statistical checks, not an ML failure predictor.
- SSE reports committed telemetry, with reconnect polling. It is not a hard-real-time
  safety channel. The stream worker is designed for one consumer.
- Device credentials support expiry, rotation and revocation; automatic certificate
  enrollment, MQTT/mTLS ingestion and fleet OTA firmware deployment are not implemented.
- Audit logs cover asset and alert database changes, not authentication attempts.
- Existing lookback semantics, current inventory views and historical alarm behavior
  remain documented in README.md.
