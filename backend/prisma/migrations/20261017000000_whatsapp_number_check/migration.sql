-- Result of checking a parent's mobile on WhatsApp ('ok', 'invalid', 'not_on_whatsapp'),
-- the number that was checked (a changed number needs a new check) and when
ALTER TABLE "parents" ADD COLUMN IF NOT EXISTS "whatsapp_check" VARCHAR(20);
ALTER TABLE "parents" ADD COLUMN IF NOT EXISTS "whatsapp_checked_phone" VARCHAR(20);
ALTER TABLE "parents" ADD COLUMN IF NOT EXISTS "whatsapp_checked_at" TIMESTAMP(3);
