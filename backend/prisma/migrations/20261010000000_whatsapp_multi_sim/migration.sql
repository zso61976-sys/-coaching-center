-- Several WhatsApp numbers (SIMs) per company, parents assigned to a SIM, welcome messages

CREATE TABLE IF NOT EXISTS "whatsapp_accounts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_accounts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "whatsapp_accounts_tenant_id_idx" ON "whatsapp_accounts"("tenant_id");

-- The existing single login per company becomes that company's "SIM 1" (account id = company id)
INSERT INTO "whatsapp_accounts" ("id", "tenant_id", "label", "enabled", "created_at", "updated_at")
SELECT DISTINCT "tenant_id", "tenant_id", 'SIM 1', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "whatsapp_auth"
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "whatsapp_auth" RENAME COLUMN "tenant_id" TO "account_id";

ALTER TABLE "whatsapp_message_logs" ADD COLUMN IF NOT EXISTS "account_id" UUID;
UPDATE "whatsapp_message_logs" SET "account_id" = "tenant_id"
WHERE "account_id" IS NULL AND "tenant_id" IN (SELECT "id" FROM "whatsapp_accounts");

ALTER TABLE "parents" ADD COLUMN IF NOT EXISTS "whatsapp_account_id" UUID;
ALTER TABLE "parents" ADD COLUMN IF NOT EXISTS "whatsapp_welcomed_phone" VARCHAR(30);
CREATE INDEX IF NOT EXISTS "parents_whatsapp_account_id_idx" ON "parents"("whatsapp_account_id");
