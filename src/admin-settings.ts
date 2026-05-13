import mongoose, { Schema, type Document, type Model } from 'mongoose';

const TERMS_GATE_ENABLED_KEY = 'termsGateEnabled';

interface IAdminSetting extends Document {
  key: string;
  value: unknown;
}

const AdminSettingSchema = new Schema<IAdminSetting>(
  {
    key:   { type: String, required: true, unique: true, index: true },
    value: { type: Schema.Types.Mixed, required: true },
  },
  { collection: 'admin_settings', timestamps: true },
);

export const AdminSetting: Model<IAdminSetting> =
  (mongoose.models.AdminSetting as Model<IAdminSetting> | undefined) ??
  mongoose.model<IAdminSetting>('AdminSetting', AdminSettingSchema);

export function parseTermsGateEnabledBody(body: unknown): boolean {
  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as { enabled?: unknown }).enabled !== 'boolean'
  ) {
    throw Object.assign(new Error('enabled must be a boolean'), { code: 'INVALID_BODY' });
  }

  return (body as { enabled: boolean }).enabled;
}

export async function getTermsGateEnabled(): Promise<boolean> {
  const setting = await AdminSetting.findOne({ key: TERMS_GATE_ENABLED_KEY }).lean();
  return setting?.value === true;
}

export async function setTermsGateEnabled(enabled: boolean): Promise<boolean> {
  await AdminSetting.updateOne(
    { key: TERMS_GATE_ENABLED_KEY },
    { $set: { value: enabled } },
    { upsert: true },
  );
  return enabled;
}
