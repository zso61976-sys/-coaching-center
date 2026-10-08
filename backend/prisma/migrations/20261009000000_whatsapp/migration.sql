-- WhatsApp parent notifications
CREATE TABLE IF NOT EXISTS "whatsapp_auth" (
    "tenant_id" UUID NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_auth_pkey" PRIMARY KEY ("tenant_id", "key")
);

CREATE TABLE IF NOT EXISTS "whatsapp_message_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_id" UUID,
    "parent_id" UUID,
    "attendance_id" UUID,
    "student_name" VARCHAR(255),
    "parent_name" VARCHAR(255),
    "phone" VARCHAR(30) NOT NULL,
    "message_type" VARCHAR(50) NOT NULL,
    "message_text" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'queued',
    "error_text" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_message_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "whatsapp_message_logs_tenant_id_created_at_idx" ON "whatsapp_message_logs"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "whatsapp_message_logs_status_idx" ON "whatsapp_message_logs"("status");
