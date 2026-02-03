# Telegram Notification Setup Guide

Complete guide to set up parent notifications via Telegram for the Coaching Center Attendance System.

---

## Overview

When a student checks in or out using the biometric device, their parents will instantly receive a Telegram notification like:

**Check-in:**
```
✅ Check-in Alert

Student: Ahmed Khan (STU001)
Time: 9:00 AM, Jan 28, 2026
Branch: Main Branch
Status: Checked In

— Coaching Center Attendance System
```

**Check-out:**
```
🚪 Check-out Alert

Student: Ahmed Khan (STU001)
Time: 2:30 PM, Jan 28, 2026
Branch: Main Branch
Duration: 5h 30m

— Coaching Center Attendance System
```

---

## Prerequisites

- Backend server running
- PostgreSQL database running
- Internet connection

---

## Step 1: Set Up Redis (Message Queue)

Redis is required for the message queue system. Choose ONE option:

### Option A: Upstash Free Cloud Redis (Recommended - No Installation)

1. **Create Account**
   - Go to: https://console.upstash.com
   - Sign up with Google/GitHub (free, no credit card)

2. **Create Database**
   - Click "Create Database"
   - Name: `coaching-attendance`
   - Type: Regional (free tier)
   - Region: Choose closest to you
   - Click "Create"

3. **Get Connection Details**
   After creation, note down:
   - **Endpoint:** `xxxx-xxxx-12345.upstash.io`
   - **Port:** `6379`
   - **Password:** (shown on dashboard)

4. **Update .env file**
   ```env
   REDIS_HOST=xxxx-xxxx-12345.upstash.io
   REDIS_PORT=6379
   REDIS_PASSWORD=your_password_here
   REDIS_TLS=true
   ```

### Option B: Docker (If Docker Desktop is installed)

1. **Start Redis Container**
   ```bash
   docker run -d --name redis-attendance -p 6379:6379 redis:alpine
   ```

2. **Update .env file**
   ```env
   REDIS_HOST=localhost
   REDIS_PORT=6379
   ```

### Option C: Local Windows Redis (Memurai)

1. **Download Memurai**
   - Go to: https://www.memurai.com/get-memurai
   - Download and install Memurai Developer Edition (free)

2. **Start Memurai**
   - It runs as a Windows service automatically

3. **Update .env file**
   ```env
   REDIS_HOST=localhost
   REDIS_PORT=6379
   ```

---

## Step 2: Create Telegram Bot

### 2.1 Open BotFather

1. Open Telegram (mobile or desktop)
2. Search for: `@BotFather`
3. Start a chat with BotFather

### 2.2 Create New Bot

Send this command to BotFather:
```
/newbot
```

BotFather will ask two questions:

**Question 1: Bot Name**
```
Alright, a new bot. How are we going to call it? Please choose a name for your bot.
```
Reply with a friendly name:
```
Coaching Center Attendance
```

**Question 2: Bot Username**
```
Good. Now let's choose a username for your bot. It must end in `bot`.
```
Reply with a unique username:
```
mycoaching_att_bot
```
(Must be unique - add numbers if taken, e.g., `mycoaching_att_2024_bot`)

### 2.3 Save Your Bot Token

BotFather will respond:
```
Done! Congratulations on your new bot. You will find it at t.me/mycoaching_att_bot.

Use this token to access the HTTP API:
7123456789:AAHx-xxxxxxxxxxxxxxxxxxxxxxxxxxxx

Keep your token secure and store it safely.
```

**IMPORTANT:** Copy and save this token securely!

### 2.4 Set Bot Description (Optional but Recommended)

Send to BotFather:
```
/setdescription
```

Select your bot, then send:
```
Official attendance notification bot for [Your Coaching Center Name]. Parents receive instant alerts when their children check in or out.
```

### 2.5 Set Bot Profile Picture (Optional)

Send to BotFather:
```
/setuserpic
```

Select your bot and send a logo image.

---

## Step 3: Configure Environment Variables

Edit the `.env` file in your backend folder:

```env
# Database
DATABASE_URL="postgresql://attendance:attendance_dev@localhost:8090/attendance_db"

# Redis (Update with your values from Step 1)
REDIS_HOST=your-redis-host.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_TLS=true

# JWT
JWT_SECRET=your-jwt-secret-key-min-32-characters-long-change-in-production
JWT_EXPIRES_IN=1h

# Kiosk
KIOSK_SECRET_KEY=kiosk-secret-key-change-in-production

# Telegram (Update with your values from Step 2)
TELEGRAM_BOT_TOKEN=7123456789:AAHx-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_BOT_USERNAME=mycoaching_att_bot
TELEGRAM_WEBHOOK_SECRET=any-random-secret-string-here

# Default Tenant
DEFAULT_TENANT_ID=550e8400-e29b-41d4-a716-446655440001

# Server
PORT=3000
NODE_ENV=development

# CORS
CORS_ORIGINS=http://localhost:3001,http://localhost:3002,http://localhost:3005
```

---

## Step 4: Restart Backend Server

After updating .env, restart the backend:

```bash
# Stop the current server (Ctrl+C)
# Then start again:
cd backend
npm run start:dev
```

You should see no errors related to Redis or Telegram.

---

## Step 5: Connect Parents to Telegram

### 5.1 Admin Panel - Generate Link

1. Open Admin Panel: http://localhost:3005
2. Go to **Dashboard** > Find the student
3. Click on **Parents** section
4. Find the parent and click **"Generate Telegram Link"**
5. A link will be generated like:
   ```
   https://t.me/mycoaching_att_bot?start=abc123xyz
   ```

### 5.2 Send Link to Parent

Share this link with the parent via:
- WhatsApp
- SMS
- Email
- Print on paper

### 5.3 Parent Connects

1. Parent clicks the link
2. Telegram opens with your bot
3. Parent presses **"Start"**
4. Bot confirms connection:
   ```
   ✓ Connected Successfully!

   You will now receive attendance alerts for:
   • Ahmed Khan (STU001)

   To disconnect, contact the institute.
   ```

---

## Step 6: Test the System

### 6.1 Manual Test

1. Have a student punch on the biometric device
2. Check backend logs for:
   ```
   Check-in notification queued for parent xxx
   ```
3. Parent should receive Telegram message within seconds

### 6.2 Verify in Admin Panel

1. Go to Admin Panel
2. Check Dashboard for "Telegram Stats":
   - Total Messages
   - Sent
   - Failed
   - Success Rate

---

## Troubleshooting

### Problem: "Redis connection refused"

**Solution:**
- Verify Redis is running
- Check REDIS_HOST and REDIS_PORT in .env
- For Upstash, ensure REDIS_TLS=true

### Problem: "Telegram token invalid"

**Solution:**
- Verify TELEGRAM_BOT_TOKEN in .env
- Ensure no extra spaces or quotes
- Get a new token from BotFather if needed

### Problem: Parent not receiving notifications

**Check:**
1. Parent is connected (check Admin Panel > Parents)
2. Parent hasn't blocked the bot
3. notificationEnabled is true for the parent
4. Redis queue is processing (check backend logs)

### Problem: "Parent link expired"

**Solution:**
- Links expire after 24 hours
- Generate a new link from Admin Panel

---

## Bot Commands (For Parents)

Parents can use these commands in the bot:

| Command | Description |
|---------|-------------|
| `/start` | Connect account (with link) |
| `/status` | Check connection status |
| `/help` | Show help message |

---

## Security Notes

1. **Bot Token:** Keep it secret. Never share publicly or commit to git.
2. **Webhook Secret:** Used to verify incoming webhooks (for production).
3. **Parent Links:** Expire after 24 hours for security.
4. **Disconnect:** Admins can disconnect parents from the Admin Panel.

---

## Production Deployment

For production, additional steps:

### 1. Set Up Webhook (Optional but Recommended)

Instead of polling, use webhooks for faster response:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://yourdomain.com/api/telegram/webhook", "secret_token": "your_webhook_secret"}'
```

### 2. Use Production Redis

For production, use:
- Upstash Pro plan
- AWS ElastiCache
- Redis Cloud

### 3. Monitor Message Delivery

Set up alerts for:
- High failure rate
- Queue backlog
- Bot blocking rate

---

## Quick Reference

| Item | Value |
|------|-------|
| Bot Creation | @BotFather on Telegram |
| Free Redis | https://upstash.com |
| Admin Panel | http://localhost:3005 |
| Backend API | http://localhost:3000 |
| Link Expiry | 24 hours |
| Retry Attempts | 4 times |
| Retry Delay | 1 minute (exponential) |

---

## Support

For issues:
1. Check backend logs for errors
2. Verify all .env values
3. Test Redis connection
4. Verify Telegram bot token

---

*Document Version: 1.0*
*Last Updated: January 2026*
