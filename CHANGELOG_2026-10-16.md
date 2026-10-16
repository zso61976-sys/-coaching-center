# Changelog - October 16-17, 2026

All changes below are deployed on the VPS (45.129.86.105) and committed on `main`.
Before each deploy a DB backup was taken (`/root/backups/coaching_db_before_*.dump`)
and the running images were tagged `rollback-*` (`docker images | grep rollback`).

---

### 1. Broadcasts start right away, one message every ~2 minutes, optional schedule
**Commit:** `03d0f44`

**Before:** a broadcast waited for the 9 AM - 9 PM sending window and sent one message about every 5 minutes.

**Now:**
- Sending starts as soon as the broadcast is saved; the sending-hours window is gone.
- One message about every 2 minutes (`GAP_MS`, jitter 0.3), so 150 parents take about 5 hours. The gap is global across all SIMs.
- "Send now / Schedule for later" with a date-time picker. `startAt` may be at most 1 minute in the past and 30 days ahead (`resolveStart`).
- Broadcasts that haven't started show an amber "Scheduled · time" badge.

**Files:**
- `backend/src/modules/whatsapp/whatsapp-broadcast.service.ts`
- `backend/src/modules/whatsapp/whatsapp.controller.ts` (optional `startAt` on preview and create)
- `frontend/admin-new/app/dashboard/broadcast/BroadcastCard.tsx`

---

### 2. About and FAQ in the dashboard menu; Inter font bundled
**Commit:** `929338b`

- New sidebar items **About** and **FAQ**, visible to every role: `app/dashboard/about/page.tsx` (company details in `about/company.ts`, Tawdeeh Technical Services LLC) and `app/dashboard/faq/page.tsx`.
- The admin Docker build used to fail fetching the Inter font from Google Fonts (flaky DNS on the VPS build network). The font is now in `app/fonts/Inter-latin.woff2` and loaded with `next/font/local` in `app/layout.tsx`.

---

### 3. Students: edit in a popup
**Commit:** `f37c8f6`

**Before:** Edit opened the form at the top of the Students page.

**Now:**
- Clicking a Student ID (blue) or Edit opens a large popup with sections **Profile, Parents, Subjects & Fees, Devices** (Devices only when the company has devices).
- Previous / Next go through the students in table order, with an "n / total" counter.
- Cancel, ✕, Esc and clicking outside close it; with unsaved changes it asks "You have unsaved changes. Discard them?".
- The popup can be dragged by its header; double-click re-centres it. On phones it fills the screen.
- "+ Add New Student" opens the same popup, empty. Errors show inside the popup.

**Files:**
- `frontend/admin-new/app/dashboard/StudentModal.tsx` (new: popup frame, `ModalSectionBlock`)
- `frontend/admin-new/app/dashboard/page.tsx`

---

### 4. Classes are managed on the Subjects page
**Commit:** `a41b12c`

**Before:** classes were fixed in the code as 9th, 10th, 11th and 12th.

**Now:**
- The Subjects page has a **Classes** card: add a class (max 20 characters) or remove one with ×. Each class shows its number of students and subjects.
- The list is kept per company in `tenants.settings.classes` (no migration needed) and sorted numerically (8th, 9th, 10th...).
- Classes that students, teachers or schedules already use are always included, even if never added (Excell Coaching Center had students in 8th).
- A class still used by active students, teachers or schedules can't be removed (server check); one with subjects can't be removed either (browser check, since subjects are in localStorage).
- Every class picker uses the list: student popup, subject form and filter, teachers, schedules, reports and the Biometric page.

**New API:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/classes` | `{ classes: string[], usage: { [class]: { students, teachers, schedules } } }` |
| PUT | `/api/admin/classes` | Body `{ classes: string[] }`; saves the list, 400 if a used class is removed, a name is too long or listed twice |

**Files:**
- `backend/src/modules/admin/admin.service.ts` (`getClasses`, `updateClasses`)
- `backend/src/modules/admin/admin.controller.ts` (`UpdateClassesDto`, two routes)
- `frontend/admin-new/app/dashboard/useClasses.ts` (new hook, default list until the server answers)
- `frontend/admin-new/app/dashboard/page.tsx`, `frontend/admin-new/app/dashboard/biometric/page.tsx`

---

### 5. Dashboard: "Teachers today" as vertical bars
**Commit:** `f1ed05f`

The single horizontal stacked bar became three vertical bars (Present, Left, Not arrived) with a whole-number axis, in the same style as "Present by class".

**File:** `frontend/admin-new/app/dashboard/TeacherStatusCard.tsx`

---

## Backups (outside the repo)

- **Coaching DB, nightly:** root cron `30 2 * * *` runs `/root/backups/coaching-nightly-backup.sh` → `/root/backups/nightly/`, keeps 14 days.
- **Every app on the VPS, nightly:** root cron `45 2 * * *` runs `/root/backups/vps-full-backup.sh` → `/root/backups/full/<date_time>/<App>/` (database.dump, code.tar.gz with .env files, WhatsApp sessions, nginx/SSL, cron, PM2), keeps 14 nights.
- **Copy on the office PC:** `D:\VPS-Backup`, one folder per application. Run `Backup-Now.bat` by hand (the PC is not always on); it makes a fresh backup and downloads every one the PC doesn't have. `D:\VPS-Backup\README.md` has the full restore guide.

## Known limitations (not changed)

- **Subjects and student fee data** (fees paid, due date, discount) are stored in the browser's localStorage, not on the server: other computers don't see them and the backups don't contain them.
- Commits from `03d0f44` on are not pushed to GitHub yet.
