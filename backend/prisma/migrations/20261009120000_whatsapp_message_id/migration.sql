-- WhatsApp message id, needed to resend a message when the recipient's phone asks for a retry
ALTER TABLE "whatsapp_message_logs" ADD COLUMN IF NOT EXISTS "wa_message_id" VARCHAR(100);
CREATE INDEX IF NOT EXISTS "whatsapp_message_logs_wa_message_id_idx" ON "whatsapp_message_logs"("wa_message_id");
