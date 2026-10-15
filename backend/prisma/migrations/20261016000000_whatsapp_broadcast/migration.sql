-- Broadcast messages to the parents of selected classes, spread out over the day
CREATE TABLE IF NOT EXISTS "whatsapp_broadcasts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "classes" JSONB NOT NULL,
    "only_welcomed" BOOLEAN NOT NULL DEFAULT true,
    "total" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'running',
    "first_send_at" TIMESTAMP(3),
    "last_send_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "whatsapp_broadcasts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "whatsapp_broadcasts_tenant_id_created_at_idx" ON "whatsapp_broadcasts"("tenant_id", "created_at");

ALTER TABLE "whatsapp_message_logs" ADD COLUMN IF NOT EXISTS "broadcast_id" UUID;
CREATE INDEX IF NOT EXISTS "whatsapp_message_logs_broadcast_id_idx" ON "whatsapp_message_logs"("broadcast_id");
