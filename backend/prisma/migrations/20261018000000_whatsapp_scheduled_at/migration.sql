-- When a queued message is due to go out (welcomes are spaced out, broadcasts can be scheduled)
ALTER TABLE "whatsapp_message_logs" ADD COLUMN IF NOT EXISTS "scheduled_at" TIMESTAMP(3);
