import { PrismaService } from '../../common/prisma.service';

/**
 * Baileys auth state stored in the database instead of files, so the
 * WhatsApp login survives container rebuilds. Mirrors Baileys'
 * useMultiFileAuthState, one row per key per WhatsApp account (SIM).
 */
// Baileys can hand over thousands of keys at once (e.g. after a reconnect).
// Writing them in parallel exhausted Prisma's connection pool and crashed the
// backend, so keys are read with one query and written in sequential batches.
const WRITE_BATCH = 100;

export async function useDbAuthState(prisma: PrismaService, accountId: string, baileys: any) {
  const { initAuthCreds, BufferJSON, proto } = baileys;

  const readData = async (key: string) => {
    const row = await prisma.whatsappAuth.findUnique({
      where: { accountId_key: { accountId, key } },
    });
    return row ? JSON.parse(row.value, BufferJSON.reviver) : null;
  };

  const writeData = async (key: string, data: any) => {
    const value = JSON.stringify(data, BufferJSON.replacer);
    await prisma.whatsappAuth.upsert({
      where: { accountId_key: { accountId, key } },
      create: { accountId, key, value },
      update: { value },
    });
  };

  const creds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type: string, ids: string[]) => {
          const rows = await prisma.whatsappAuth.findMany({
            where: { accountId, key: { in: ids.map((id) => `${type}-${id}`) } },
          });
          const byKey = new Map(rows.map((r) => [r.key, r.value]));
          const data: Record<string, any> = {};
          for (const id of ids) {
            const raw = byKey.get(`${type}-${id}`);
            let value = raw ? JSON.parse(raw, BufferJSON.reviver) : null;
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          }
          return data;
        },
        set: async (data: Record<string, Record<string, any>>) => {
          const writes: { key: string; value: string }[] = [];
          const removals: string[] = [];
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              if (value) writes.push({ key, value: JSON.stringify(value, BufferJSON.replacer) });
              else removals.push(key);
            }
          }
          for (let i = 0; i < writes.length; i += WRITE_BATCH) {
            await prisma.$transaction(
              writes.slice(i, i + WRITE_BATCH).map(({ key, value }) =>
                prisma.whatsappAuth.upsert({
                  where: { accountId_key: { accountId, key } },
                  create: { accountId, key, value },
                  update: { value },
                }),
              ),
            );
          }
          if (removals.length) {
            await prisma.whatsappAuth.deleteMany({ where: { accountId, key: { in: removals } } });
          }
        },
      },
    },
    saveCreds: () => writeData('creds', creds),
  };
}

export async function clearDbAuthState(prisma: PrismaService, accountId: string) {
  await prisma.whatsappAuth.deleteMany({ where: { accountId } });
}
