import { PrismaService } from '../../common/prisma.service';

/**
 * Baileys auth state stored in the database instead of files, so the
 * WhatsApp login survives container rebuilds. Mirrors Baileys'
 * useMultiFileAuthState, one row per key per WhatsApp account (SIM).
 */
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

  const removeData = async (key: string) => {
    await prisma.whatsappAuth.deleteMany({ where: { accountId, key } });
  };

  const creds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type: string, ids: string[]) => {
          const data: Record<string, any> = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            }),
          );
          return data;
        },
        set: async (data: Record<string, Record<string, any>>) => {
          const tasks: Promise<void>[] = [];
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(key, value) : removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData('creds', creds),
  };
}

export async function clearDbAuthState(prisma: PrismaService, accountId: string) {
  await prisma.whatsappAuth.deleteMany({ where: { accountId } });
}
