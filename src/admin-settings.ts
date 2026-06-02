import mongoose, { Schema, type Document, type Model } from 'mongoose';

const TERMS_GATE_ENABLED_KEY = 'termsGateEnabled';
const DIRECT_WEB_JOIN_ENABLED_KEY = 'directWebJoinEnabled';
const APP_URL_KEY = 'appUrl';
const DEFAULT_APP_URL = 'http://localhost:3000';

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

export function parseDirectWebJoinEnabledBody(body: unknown): boolean {
  return parseTermsGateEnabledBody(body);
}

export function normalizeAppUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw Object.assign(new Error('appUrl must be an absolute http(s) URL'), { code: 'INVALID_BODY' });
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw Object.assign(new Error('appUrl must be an absolute http(s) URL'), { code: 'INVALID_BODY' });
  }

  return url.toString().replace(/\/+$/, '');
}

export function parseAppUrlBody(body: unknown): string {
  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as { appUrl?: unknown }).appUrl !== 'string'
  ) {
    throw Object.assign(new Error('appUrl must be an absolute http(s) URL'), { code: 'INVALID_BODY' });
  }

  return normalizeAppUrl((body as { appUrl: string }).appUrl);
}

export function resolveAppUrl(mongoValue: unknown, envValue: string | undefined): string {
  if (typeof mongoValue === 'string' && mongoValue.trim()) return normalizeAppUrl(mongoValue);
  if (envValue?.trim()) return normalizeAppUrl(envValue);
  return DEFAULT_APP_URL;
}

export async function getTermsGateEnabled(): Promise<boolean> {
  const setting = await AdminSetting.findOne({ key: TERMS_GATE_ENABLED_KEY }).lean();
  return setting?.value === true;
}

export async function getDirectWebJoinEnabled(): Promise<boolean> {
  const setting = await AdminSetting.findOne({ key: DIRECT_WEB_JOIN_ENABLED_KEY }).lean();
  return setting?.value === true;
}

export async function getAppUrl(): Promise<string> {
  const setting = await AdminSetting.findOne({ key: APP_URL_KEY }).lean();
  return resolveAppUrl(setting?.value, process.env.APP_URL);
}

export async function setTermsGateEnabled(enabled: boolean): Promise<boolean> {
  await AdminSetting.updateOne(
    { key: TERMS_GATE_ENABLED_KEY },
    { $set: { value: enabled } },
    { upsert: true },
  );
  return enabled;
}

export async function setDirectWebJoinEnabled(enabled: boolean): Promise<boolean> {
  await AdminSetting.updateOne(
    { key: DIRECT_WEB_JOIN_ENABLED_KEY },
    { $set: { value: enabled } },
    { upsert: true },
  );
  return enabled;
}

export async function setAppUrl(appUrl: string): Promise<string> {
  const normalized = normalizeAppUrl(appUrl);
  await AdminSetting.updateOne(
    { key: APP_URL_KEY },
    { $set: { value: normalized } },
    { upsert: true },
  );
  return normalized;
}
