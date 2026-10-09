-- SIM role: 'balance' SIMs share the parents, a 'backup' SIM only sends when a balancing SIM is down
ALTER TABLE "whatsapp_accounts" ADD COLUMN IF NOT EXISTS "role" VARCHAR(20) NOT NULL DEFAULT 'balance';
