# ZK Device Integration — Technical Reference

This document explains exactly how ZK biometric devices connect to the backend, how users are synced to devices, and how users are deleted from devices. Intended for developers building a new application with the same ZK ADMS protocol.

---

## 1. Overview

ZK devices use the **ADMS (Attendance Data Management System) push protocol** over HTTP. The device acts as a client — it calls the server, not the other way around. The server queues commands; the device polls and executes them.

```
ZK Device  ──────────────────────────────────►  Backend Server
           GET /iclock/cdata       (handshake)
           POST /iclock/cdata      (push punch logs / fingerprints)
           GET /iclock/getrequest  (poll for commands)
           POST /iclock/devicecmd  (report command result)
```

---

## 2. Device Registration

Before a device can connect, it must be registered in the database with its serial number.

**Database table:** `BiometricDevice`

| Field           | Description                                      |
|----------------|--------------------------------------------------|
| serialNumber    | Unique serial from the ZK device                 |
| name            | Friendly name (e.g., "Main Gate")               |
| model           | Device model (e.g., ZK400)                      |
| location        | Physical location                                |
| ipAddress       | Device IP (optional, for reference only)         |
| timezoneOffset  | Absolute UTC offset (e.g., 4=Dubai, 5=Pakistan) |
| status          | "active" or "inactive"                           |
| lastSyncAt      | Updated every time device polls                  |

If a device connects with an unregistered serial number, the handshake returns HTTP 403 and the device is rejected.

---

## 3. Connection Flow — Handshake

**Endpoint:** `GET /iclock/cdata?SN=<serial>&options=...&pushver=...`

The device calls this on startup and reconnect. The server responds with configuration options including the current time and timezone.

### Server Response Format (plain text, newline separated):
```
GET OPTION FROM: <SN>
ServerTime=2026-03-07 14:30:00
Stamp=9999
OpStamp=9999
PhotoStamp=9999
ErrorDelay=60
Delay=10
TransTimes=00:00;14:05
TransInterval=1
TransFlag=TransData AttLog OpLog BioData
TimeZone=5
Realtime=1
Encrypt=0
ServerVer=2.4.1
ATTLOGStamp=0
OPERLOGStamp=0
BIODATAStamp=0
```

### Key fields:
| Field         | Value                          | Meaning                                              |
|---------------|-------------------------------|------------------------------------------------------|
| ServerTime    | `YYYY-MM-DD HH:MM:SS`         | Device local time (UTC + timezoneOffset). Device sets its clock to this. |
| TimeZone      | Integer (e.g., 5)             | Absolute UTC offset. Device uses this to display GMT label. |
| Delay         | 10                            | Seconds between polls to `/iclock/getrequest`        |
| TransFlag     | `TransData AttLog OpLog BioData` | What data types the device should push             |
| Realtime      | 1                             | Push punches immediately, not in batches             |

### Timezone logic:
- `timezoneOffset` stored in DB = absolute UTC offset (NOT relative to any base timezone)
- `ServerTime` = `UTC now + (timezoneOffset * 3600 seconds)` — computed server-side so device sets its clock correctly regardless of server's own timezone
- Example: device in Pakistan (UTC+5), server in UTC → ServerTime = UTC + 5 hours

---

## 4. Punch Data Flow — Attendance Logs

**Endpoint:** `POST /iclock/cdata?SN=<serial>&table=ATTLOG`

The device POSTs attendance punches in real time (when `Realtime=1`).

### ATTLOG line format (tab-separated):
```
<PIN>\t<DateTime>\t<Status>\t<Verify>\t<WorkCode>
```

**Example:**
```
1001	2026-03-07 09:15:33	0	1	0
```

| Field    | Example              | Meaning                                              |
|----------|---------------------|------------------------------------------------------|
| PIN      | `1001`              | User ID on the device (matches `deviceUserId` in DB) |
| DateTime | `2026-03-07 09:15:33` | Punch time in device's local timezone              |
| Status   | `0`                 | 0=check-in, 1=check-out (device-side, not always reliable) |
| Verify   | `1`                 | Verification method (see table below)                |
| WorkCode | `0`                 | Optional work code                                   |

### Verify method codes:
| Code | Method              |
|------|---------------------|
| 0    | Password            |
| 1    | Fingerprint         |
| 2    | Card                |
| 3    | Fingerprint + Password |
| 4    | Fingerprint + Card  |
| 15   | Face recognition    |

### Punch processing logic:
1. Look up device by serial number → get `tenantId` and `timezoneOffset`
2. Parse `AttTime` by appending timezone suffix so JS Date parses correctly:
   - e.g., `"2026-03-07 09:15:33"` + `"+05:00"` → stored as UTC `04:15:33`
3. Look up enrollment by `deviceId + PIN` → get `studentId`
4. Check for duplicate punch within ±1 minute (ignore if duplicate)
5. Determine punch type (in/out):
   - If student has no open attendance session → **check-in**
   - If student has an open session on the same date → **check-out**
   - If open session is from a previous date → auto-close it, treat as new **check-in**
6. Create/update `AttendanceSession` record
7. Send Telegram notification to parents (if configured)
8. Log punch in `BiometricPunchLog`

---

## 5. Command Queue — How Server Controls Device

**Endpoint:** `GET /iclock/getrequest?SN=<serial>`

The device polls this endpoint every `Delay` seconds (default: 10s). The server responds with queued commands.

### Response format (plain text):
```
C:<id>:<command_data>
```

Multiple commands = multiple lines. If no commands pending, server returns `OK`.

**Example:**
```
C:1:DATA UPDATE USERINFO PIN=1001	Name=Ali Khan	Pri=0	Passwd=	Card=	Grp=1	TZ=0000000100000000
C:2:DATA DELETE USERINFO PIN=1002
```

### Command result reporting:
**Endpoint:** `POST /iclock/devicecmd?SN=<serial>&ID=<id>&Return=<0|error>`

The device reports back after executing each command:
- `Return=0` → success
- `Return=-1` or non-zero → failed

### Important: Short ID mapping
ZK devices truncate long IDs. The backend maps database UUIDs → short sequential integers (1, 2, 3...) for the device, and maintains an in-memory map to resolve them back on the `devicecmd` callback.

---

## 6. Syncing Users to Device (SET_USER)

When a student/user is enrolled, the backend queues a `SET_USER` command so the device learns who that PIN belongs to.

### Command format:
```
DATA UPDATE USERINFO PIN=<pin>\tName=<name>\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000
```

| Field | Value     | Meaning                        |
|-------|-----------|--------------------------------|
| PIN   | e.g. `1001` | User ID on the device        |
| Name  | e.g. `Ali Khan` | Display name on device   |
| Pri   | `0`       | Privilege (0=normal user)      |
| Grp   | `1`       | Group number                   |
| TZ    | `0000000100000000` | Time zone schedule    |

### When is this triggered?
- Admin enrolls a student via the UI → `enrollStudent()` is called → `queueSetUserCommand()` queues the command
- Admin triggers "Sync All Enrollments" → all active enrollments are re-pushed

### Database flow:
```
Admin UI → POST /biometric/enrollments
         → BiometricEnrollment record created
         → DeviceCommand record created (status=pending, type=set_user)
         → Device polls /iclock/getrequest → gets the command
         → Device executes SET_USER
         → Device POSTs /iclock/devicecmd with Return=0
         → DeviceCommand updated to status=executed
```

---

## 7. Deleting Users from Device (DELETE_USER)

When a student's enrollment is removed, the device must also remove that user so they can no longer punch in.

### Command format:
```
DATA DELETE USERINFO PIN=<pin>
```

### When is this triggered?
- Admin removes an enrollment via the UI → `removeEnrollment()` is called → `queueDeleteUserCommand()` queues the command before the DB record is deleted

### Database flow:
```
Admin UI → DELETE /biometric/enrollments/:id
         → DeviceCommand record created (status=pending, type=delete_user)
         → BiometricEnrollment record deleted from DB
         → Device polls /iclock/getrequest → gets the DELETE command
         → Device removes user locally
         → Device POSTs /iclock/devicecmd with Return=0
         → DeviceCommand updated to status=executed
```

---

## 8. Fingerprint Template Management

Fingerprints are stored centrally so they can be pushed to any device a user is enrolled on.

### Upload from device to server:
Device sends fingerprint data via:
- `POST /iclock/cdata?table=BIODATA` or `table=FINGERTMP`
- `POST /iclock/fdata`

### Fingerprint data format:
**Key=Value format:**
```
PIN=1001\tFID=0\tSize=512\tValid=1\tTMP=<base64_template>
```

**Positional tab-separated format:**
```
1001\t0\t512\t1\t<base64_template>
```

| Field | Meaning                          |
|-------|----------------------------------|
| PIN   | User ID                          |
| FID   | Finger index (0=right thumb, etc) |
| Size  | Template size in bytes           |
| Valid | 1=valid, 0=invalid               |
| TMP   | Base64 encoded fingerprint template |

Templates are stored in `FingerprintTemplate` table and upserted (update if exists, create if not).

### Push fingerprint to device:
```
DATA UPDATE BIODATA PIN=<pin>\tNo=<fid>\tIndex=<fid>\tValid=1\tDuress=0\tType=0\tMajorVer=0\tMinorVer=0\tFormat=0\tTmp=<template>
```

### Auto-push on enrollment:
When a student is enrolled on a new device, the backend automatically checks if that student has stored fingerprint templates and queues upload commands for all of them.

### Download fingerprint from device:
```
DATA QUERY BIODATA PIN=<pin>
```
Device responds with the fingerprint data via `/iclock/devicecmd` body.

---

## 9. Device Online Status

A device is considered **online** if `lastSyncAt` is within the last **5 minutes**.

`lastSyncAt` is updated on every:
- Handshake (`GET /iclock/cdata`)
- Poll (`GET /iclock/getrequest`)
- Successful punch processing

---

## 10. DeviceCommand Status Lifecycle

```
pending → sent → executed
                → failed
```

| Status   | Meaning                                      |
|----------|----------------------------------------------|
| pending  | Created, waiting for device to poll          |
| sent     | Delivered to device in a getrequest response |
| executed | Device reported Return=0 (success)           |
| failed   | Device reported non-zero Return value        |

---

## 11. Database Tables Summary

| Table                | Purpose                                         |
|---------------------|-------------------------------------------------|
| BiometricDevice      | Registered ZK devices                          |
| BiometricEnrollment  | Links students/teachers to device PINs         |
| BiometricPunchLog    | Raw punch records from devices                 |
| DeviceCommand        | Queued commands to send to devices             |
| FingerprintTemplate  | Centrally stored fingerprint templates         |
| AttendanceSession    | Processed check-in/check-out records           |

---

## 12. API Endpoints Summary

| Method | Path                                    | Description                          |
|--------|----------------------------------------|--------------------------------------|
| GET    | /iclock/cdata                           | Device handshake (called by device)  |
| POST   | /iclock/cdata?table=ATTLOG             | Device pushes punch logs             |
| POST   | /iclock/cdata?table=BIODATA            | Device pushes fingerprint data       |
| GET    | /iclock/getrequest                     | Device polls for commands            |
| POST   | /iclock/devicecmd                      | Device reports command result        |
| POST   | /iclock/fdata                          | Device pushes fingerprint data (alt) |
| GET    | /biometric/devices                     | List all devices (admin API)         |
| POST   | /biometric/devices                     | Register a new device                |
| POST   | /biometric/enrollments                 | Enroll a student on a device         |
| DELETE | /biometric/enrollments/:id             | Remove enrollment (queues delete)    |
| POST   | /biometric/devices/:id/sync-time       | Queue time sync (REBOOT command)     |
| POST   | /biometric/sync-enrollments            | Re-push all users to their devices   |
| POST   | /biometric/enrollments/:id/sync-fingerprints | Push fingerprints to device    |

---

## 13. Key Implementation Notes for New Application

1. **Device connects to your server, not the other way around.** Configure the ZK device's "Server Address" in its network settings to point to your backend host:port.

2. **ServerTime must be device local time.** Compute it as `UTC + device.timezoneOffset`. Do NOT send UTC time — the device sets its internal clock directly to ServerTime.

3. **Short command IDs.** ZK devices truncate UUIDs. Use short sequential integers (1, 2, 3...) as command IDs in the `C:<id>:<data>` format and maintain a server-side map to resolve them back to your internal IDs.

4. **Punch time timezone.** The device sends punch times in its own local time. Append the timezone suffix (`+05:00`) when parsing so your server stores correct UTC timestamps.

5. **Command delivery is async.** There is no push from server to device. Commands sit in the queue until the device's next poll (every 10 seconds by default).

6. **Duplicate punch protection.** Devices sometimes send the same punch twice. Check for existing punches within ±1 minute before processing.

7. **Fingerprint templates are portable.** Store them centrally and push to any device the user is enrolled on. This allows a user enrolled on multiple devices to have their fingerprints everywhere without re-scanning.
