import { JoinRequest } from '../src/join-request-store.ts';

export type StoredJoinRequest = {
  token: string;
  userJid: string;
  groupJid: string;
  expiresAt: Date;
  used: boolean;
};

export function stubJoinRequestStore(
  records = new Map<string, StoredJoinRequest>(),
): {
  records: Map<string, StoredJoinRequest>;
  restore: () => void;
} {
  const originalCreate = JoinRequest.create.bind(JoinRequest);
  const originalFindOne = JoinRequest.findOne.bind(JoinRequest);
  const originalUpdateOne = JoinRequest.updateOne.bind(JoinRequest);
  const originalDeleteOne = JoinRequest.deleteOne.bind(JoinRequest);

  JoinRequest.create = (async (data: StoredJoinRequest) => {
    records.set(data.token, { ...data });
    return data;
  }) as typeof JoinRequest.create;

  JoinRequest.findOne = ((query: { token: string }) => ({
    lean: async () => {
      const record = records.get(query.token);
      return record ? { ...record } : null;
    },
  })) as typeof JoinRequest.findOne;

  JoinRequest.updateOne = (async (query: { token: string }, update: { $set?: { used?: boolean } }) => {
    const record = records.get(query.token);
    if (record && typeof update.$set?.used === 'boolean') {
      record.used = update.$set.used;
    }
  }) as typeof JoinRequest.updateOne;

  JoinRequest.deleteOne = (async (query: { token: string }) => {
    records.delete(query.token);
  }) as typeof JoinRequest.deleteOne;

  return {
    records,
    restore: () => {
      JoinRequest.create = originalCreate;
      JoinRequest.findOne = originalFindOne;
      JoinRequest.updateOne = originalUpdateOne;
      JoinRequest.deleteOne = originalDeleteOne;
    },
  };
}
