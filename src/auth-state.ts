import mongoose, { Schema, type Document, type Model } from 'mongoose';
import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataSet,
  type SignalDataTypeMap,
} from '@whiskeysockets/baileys';

interface IBaileysAuth extends Document {
  category: string;
  id: string;
  value: string;
}

const BaileysAuthSchema = new Schema<IBaileysAuth>(
  {
    category: { type: String, required: true },
    id:       { type: String, required: true },
    value:    { type: String, required: true },
  },
  { collection: 'baileys_auth', timestamps: true },
);

BaileysAuthSchema.index({ category: 1, id: 1 }, { unique: true });

export const BaileysAuth: Model<IBaileysAuth> =
  (mongoose.models.BaileysAuth as Model<IBaileysAuth> | undefined) ??
  mongoose.model<IBaileysAuth>('BaileysAuth', BaileysAuthSchema);

function serialize(value: unknown): string {
  return JSON.stringify(value, BufferJSON.replacer);
}

function deserialize<T>(value: string): T {
  return JSON.parse(value, BufferJSON.reviver) as T;
}

async function readAuthValue<T>(category: string, id: string): Promise<T | null> {
  const record = await BaileysAuth.findOne({ category, id }).lean();
  return record ? deserialize<T>(record.value) : null;
}

async function writeAuthValue(category: string, id: string, value: unknown): Promise<void> {
  await BaileysAuth.updateOne(
    { category, id },
    { $set: { value: serialize(value) } },
    { upsert: true },
  );
}

async function removeAuthValue(category: string, id: string): Promise<void> {
  await BaileysAuth.deleteOne({ category, id });
}

export async function useMongoAuthState(): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const creds = (await readAuthValue<AuthenticationCreds>('creds', 'creds')) ?? initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};

          await Promise.all(ids.map(async (id) => {
            let value = await readAuthValue<SignalDataTypeMap[T]>(type, id);
            if (type === 'app-state-sync-key' && value !== null) {
              value = proto.Message.AppStateSyncKeyData.fromObject(
                value as { [key: string]: unknown },
              ) as unknown as SignalDataTypeMap[T];
            }

            if (value !== null) {
              data[id] = value;
            }
          }));

          return data;
        },
        set: async (data: SignalDataSet) => {
          const tasks: Array<Promise<void>> = [];

          for (const category of Object.keys(data) as Array<keyof SignalDataSet>) {
            const records = data[category];
            if (!records) continue;

            for (const id of Object.keys(records)) {
              const value = records[id];
              tasks.push(
                value !== null
                  ? writeAuthValue(category, id, value)
                  : removeAuthValue(category, id),
              );
            }
          }

          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      await writeAuthValue('creds', 'creds', creds);
    },
  };
}
