import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DirectJoinAudit,
  createDirectJoinAudit,
  listRecentDirectJoinAudits,
  markDirectJoinAuditAdded,
  markDirectJoinAuditFailed,
} from '../src/direct-join-store.ts';

test('direct join audit schema expires records at expiresAt', () => {
  const ttlIndex = DirectJoinAudit.schema.indexes().find(([fields]) => fields.expiresAt === 1);
  assert.deepEqual(ttlIndex, [{ expiresAt: 1 }, { expireAfterSeconds: 0 }]);
});

test('creates and updates direct join audit records', async () => {
  const originalCreate = DirectJoinAudit.create.bind(DirectJoinAudit);
  const originalUpdateOne = DirectJoinAudit.updateOne.bind(DirectJoinAudit);
  const updates: unknown[] = [];
  DirectJoinAudit.create = (async (data: unknown) => ({ _id: 'audit-1', ...data })) as typeof DirectJoinAudit.create;
  DirectJoinAudit.updateOne = (async (...args: unknown[]) => {
    updates.push(args);
  }) as typeof DirectJoinAudit.updateOne;

  try {
    const audit = await createDirectJoinAudit({
      userJid: '15551234567@s.whatsapp.net',
      termsAcceptedAt: new Date('2026-06-02T12:00:00Z'),
      termsVersion: 'v1',
      expiresAt: new Date('2026-08-31T12:00:00Z'),
    });
    await markDirectJoinAuditAdded(audit.id, '200');
    await markDirectJoinAuditFailed(audit.id, { whatsappStatus: '403', reason: 'Rejected.' });
  } finally {
    DirectJoinAudit.create = originalCreate;
    DirectJoinAudit.updateOne = originalUpdateOne;
  }

  assert.equal(updates.length, 2);
  assert.deepEqual(updates[0], [
    { _id: 'audit-1' },
    { $set: { status: 'added', whatsappStatus: '200' }, $unset: { failureReason: 1 } },
  ]);
  assert.deepEqual(updates[1], [
    { _id: 'audit-1' },
    { $set: { status: 'failed', whatsappStatus: '403', failureReason: 'Rejected.' } },
  ]);
});

test('lists the most recent direct join audits newest first', async () => {
  const originalFind = DirectJoinAudit.find.bind(DirectJoinAudit);
  let sort: unknown;
  let limit: unknown;
  DirectJoinAudit.find = (() => ({
    sort(value: unknown) {
      sort = value;
      return this;
    },
    async limit(value: unknown) {
      limit = value;
      return [{
        _id: 'audit-1',
        userJid: '15551234567@s.whatsapp.net',
        termsAcceptedAt: new Date('2026-06-02T12:00:00Z'),
        termsVersion: 'v1',
        status: 'added',
        expiresAt: new Date('2026-08-31T12:00:00Z'),
        createdAt: new Date('2026-06-02T12:00:00Z'),
        updatedAt: new Date('2026-06-02T12:00:01Z'),
      }];
    },
  })) as unknown as typeof DirectJoinAudit.find;

  try {
    const audits = await listRecentDirectJoinAudits();
    assert.equal(audits[0]?.id, 'audit-1');
  } finally {
    DirectJoinAudit.find = originalFind;
  }

  assert.deepEqual(sort, { createdAt: -1 });
  assert.equal(limit, 50);
});
