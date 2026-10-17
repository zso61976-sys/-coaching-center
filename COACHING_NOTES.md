# Coaching Center App — Notes & Protocol Findings

## App Info
- Source: `/var/www/coaching-center` on VPS (45.129.86.105)
- Docker containers: `coaching_backend` (port 2006), `coaching_admin` (port 2005), `coaching_kiosk` (port 2002)
- Served via nginx on port 80
- DB: `coaching_db` (separate from attendance app — do NOT touch from attendance context)
- Docker compose: `/var/www/coaching-center/docker/docker-compose-vps2.yml`

---

## ZKTeco uA500 Fingerprint Protocol (SN=CEBR212460092, name=Main)

**CRITICAL — apply when working on fingerprint features:**

1. **Wrong command: `DATA QUERY BIODATA PIN=xxx`** → returns `Return=-3` (unsupported)
   **Correct command: `DATA QUERY FINGERTMP PIN=xxx`** → returns `Return=0` + device uploads template

2. **Device sends FP data via `table=OPERLOG`**, NOT `table=FINGERTMP` or `table=BIODATA`
   - POST comes to `/iclock/cdata?table=OPERLOG`
   - Body format: `FP PIN=xxx\tFID=x\tSize=xxx\tValid=1\tTMP=<base64>`
   - OPERLOG handler MUST check for `FP ` + `TMP=` in body and call `handleFingerprintUpload`

3. **Parser must strip `FP ` prefix** from each line before key=value parsing
   - Line starts with `FP PIN=1001\t...` — if you don't strip `FP `, PIN reads as `FP PIN` → silently skipped

4. **FP data format**: `FP PIN=1001\tFID=6\tSize=1016\tValid=1\tTMP=<base64_data>`

5. **Handshake**: Added `FPTEMPStamp=0` and `FP` to TransFlag for auto-sync on device reconnect

**Why:** `DATA QUERY BIODATA` is for face templates on this model. Fingerprints use `FINGERTMP` table.

---

## Docker Rebuild Note
Docker Hub has intermittent TLS timeouts from this VPS.
- If `docker compose build` fails → patch compiled dist JS files directly in running container:
  - `/app/dist/src/modules/biometric/adms.controller.js`
  - `/app/dist/src/modules/biometric/biometric.service.js`
- Then `docker restart coaching_backend`
- Source files at `/var/www/coaching-center/backend/src/` are the canonical source

---

## Biometric Admin UI (`coaching_admin` container)
- Frontend source: `/var/www/coaching-center/frontend/admin-new/`
- Biometric page: `app/dashboard/biometric/page.tsx`
- To apply frontend changes: rebuild container
  ```bash
  cd /var/www/coaching-center/docker
  docker compose -f docker-compose-vps2.yml build admin
  docker compose -f docker-compose-vps2.yml up -d admin
  ```
- Container does NOT mount source — must rebuild to pick up changes

---

## Memory Location
Future coaching center notes → save to `D:\Claude\Cochingcenter\COACHING_NOTES.md`

---

## October 2026 updates
- What changed on 16-17 Oct 2026 (broadcast timing, student popup, classes on the Subjects page, About/FAQ, teacher bars): see `CHANGELOG_2026-10-16.md`.
- Classes are stored per company in `tenants.settings.classes` (API `GET/PUT /api/admin/classes`); subjects and fee data are still browser localStorage only.
- Backups: nightly on the VPS (`/root/backups/vps-full-backup.sh`, 02:45, keeps 14) and copied by hand to the PC with `D:\VPS-Backup\Backup-Now.bat`. Restore guide: `D:\VPS-Backup\README.md`.
- Before a deploy: `pg_dump` coaching_db to `/root/backups/` and `docker tag docker-<svc>:latest docker-<svc>:rollback-<date>`.
