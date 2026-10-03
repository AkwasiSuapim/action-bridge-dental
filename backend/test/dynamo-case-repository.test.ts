import { DentalCaseSchema, type DentalCase, type LedgerEvent, type SavedStrategy } from '@actionbridge/contracts';
import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it } from 'vitest';
import { caseKey, DynamoCaseRepository, type DocumentClient } from '../src/features/cases/infrastructure/dynamo-case-repository.js';
import { decodeCursor, DynamoLedgerReader, encodeCursor } from '../src/features/ledger/infrastructure/dynamo-ledger.js';
import { DynamoStrategyRepository } from '../src/features/strategies/infrastructure/dynamo-strategy-repository.js';
import { fixtureCreateRequest } from './helpers.js';

const OWNER = 'demo:device-maya-0000000001';
const PK = 'USER#demo%3Adevice-maya-0000000001#CASE#case-1';

function record(ownerId = OWNER): DentalCase {
  return DentalCaseSchema.parse({
    ...fixtureCreateRequest(),
    caseRevision: 1,
    caseId: 'case-1',
    ownerId,
    status: 'ready',
    sourceFacts: [],
    createdAt: '2026-10-03T15:00:00.000Z',
    updatedAt: '2026-10-03T15:00:00.000Z',
  });
}

const event = (action: LedgerEvent['action'] = 'case_created'): LedgerEvent => ({
  eventId: 'ev-1',
  caseId: 'case-1',
  action,
  actor: 'user',
  caseRevision: 1,
  summary: 'Case created',
  strategyId: null,
  at: '2026-10-03T15:00:00.000Z',
});

function stubClient(respond: (command: unknown) => unknown): DocumentClient & { sent: any[] } {
  const sent: any[] = [];
  return {
    sent,
    send: (async (command: unknown) => {
      sent.push(command);
      return respond(command);
    }) as DocumentClient['send'],
  };
}

const cancelled = (...codes: string[]) =>
  Object.assign(new Error('Transaction cancelled'), { name: 'TransactionCanceledException', CancellationReasons: codes.map((Code) => ({ Code })) });

describe('DynamoCaseRepository', () => {
  it('creates the case and its ledger event in one transaction, owner-scoped, with an optional TTL', async () => {
    const client = stubClient(() => ({}));
    await new DynamoCaseRepository(client, 'cases-table').create(record(), event(), 1_760_000_000);

    const command = client.sent[0] as TransactWriteCommand;
    expect(command).toBeInstanceOf(TransactWriteCommand);
    const [casePut, ledgerPut] = command.input.TransactItems!;
    expect(casePut?.Put).toMatchObject({
      TableName: 'cases-table',
      ConditionExpression: 'attribute_not_exists(pk)',
      Item: { pk: PK, sk: 'CASE', caseRevision: 1, expiresAt: 1_760_000_000 },
    });
    expect(ledgerPut?.Put?.Item).toMatchObject({ pk: PK, sk: 'LEDGER#2026-10-03T15:00:00.000Z#ev-1', event: event(), expiresAt: 1_760_000_000 });
  });

  it('encodes owner IDs so they cannot forge another key', () => {
    expect(caseKey('user:a#CASE#x', 'case-1').pk).toBe('USER#user%3Aa%23CASE%23x#CASE#case-1');
  });

  it('replaces only when the stored revision matches, with its event in the same transaction', async () => {
    const client = stubClient(() => ({}));
    const outcome = await new DynamoCaseRepository(client, 't').replace({ ...record(), caseRevision: 2 }, event('case_updated'), 1, null);
    expect(outcome).toBe('replaced');
    const [casePut, ledgerPut] = (client.sent[0] as TransactWriteCommand).input.TransactItems!;
    expect(casePut?.Put?.ConditionExpression).toBe('attribute_exists(pk) AND caseRevision = :expected');
    expect(casePut?.Put?.ExpressionAttributeValues).toEqual({ ':expected': 1 });
    expect(casePut?.Put?.Item).not.toHaveProperty('expiresAt');
    expect(ledgerPut?.Put?.Item?.event.action).toBe('case_updated');
  });

  it('maps a failed revision condition to a conflict and rethrows anything else', async () => {
    const repo = new DynamoCaseRepository(stubClient(() => Promise.reject(cancelled('ConditionalCheckFailed', 'None'))), 't');
    await expect(repo.replace(record(), event(), 1, null)).resolves.toBe('revision_conflict');

    const throttled = Object.assign(new Error('slow down'), { name: 'ProvisionedThroughputExceededException' });
    const failing = new DynamoCaseRepository(stubClient(() => Promise.reject(throttled)), 't');
    await expect(failing.replace(record(), event(), 1, null)).rejects.toThrow('slow down');
  });

  it('reads with strong consistency and validates the stored record', async () => {
    const stored = record();
    const client = stubClient(() => ({ Item: { ...caseKey(stored.ownerId, 'case-1'), case: stored } }));
    await expect(new DynamoCaseRepository(client, 't').get(stored.ownerId, 'case-1')).resolves.toEqual(stored);
    expect((client.sent[0] as GetCommand).input).toMatchObject({ ConsistentRead: true, Key: caseKey(stored.ownerId, 'case-1') });
  });

  it('returns null for a missing item or an owner mismatch', async () => {
    await expect(new DynamoCaseRepository(stubClient(() => ({})), 't').get('demo:x', 'case-1')).resolves.toBeNull();
    const foreign = stubClient(() => ({ Item: { case: record('demo:someone-else-000000') } }));
    await expect(new DynamoCaseRepository(foreign, 't').get(OWNER, 'case-1')).resolves.toBeNull();
  });
});

describe('DynamoStrategyRepository', () => {
  const strategy = { strategyId: 'st-1', caseId: 'case-1', caseRevision: 1 } as SavedStrategy;
  const save = { ownerId: OWNER, idempotencyKey: 'key-12345678', requestFingerprint: 'alt-1@1', expectedRevision: 1, strategy, event: event('strategy_saved'), expiresAtEpochSeconds: null };

  it('checks the revision and the key, then writes strategy, idempotency record and event atomically', async () => {
    const client = stubClient(() => ({}));
    await expect(new DynamoStrategyRepository(client, 't').save(save)).resolves.toBe('saved');
    const items = (client.sent[0] as TransactWriteCommand).input.TransactItems!;
    expect(items[0]?.ConditionCheck).toMatchObject({ Key: { pk: PK, sk: 'CASE' }, ConditionExpression: 'caseRevision = :expected' });
    expect(items[1]?.Put).toMatchObject({ Item: { pk: PK, sk: 'IDEMPOTENCY#key-12345678', requestFingerprint: 'alt-1@1' }, ConditionExpression: 'attribute_not_exists(pk)' });
    expect(items[2]?.Put?.Item).toMatchObject({ pk: PK, sk: 'STRATEGY#st-1' });
    expect(items[3]?.Put?.Item?.event.action).toBe('strategy_saved');
  });

  it('tells a stale revision apart from an already-used key', async () => {
    const stale = new DynamoStrategyRepository(stubClient(() => Promise.reject(cancelled('ConditionalCheckFailed', 'None', 'None', 'None'))), 't');
    await expect(stale.save(save)).resolves.toBe('revision_conflict');
    const taken = new DynamoStrategyRepository(stubClient(() => Promise.reject(cancelled('None', 'ConditionalCheckFailed', 'None', 'None'))), 't');
    await expect(taken.save(save)).resolves.toBe('idempotency_key_taken');
  });
});

describe('DynamoLedgerReader', () => {
  it('queries only the owner’s case partition, newest first, and pages with an opaque cursor', async () => {
    const client = stubClient(() => ({ Items: [{ event: event() }], LastEvaluatedKey: { pk: PK, sk: 'LEDGER#2026-10-03T15:00:00.000Z#ev-1' } }));
    const page = await new DynamoLedgerReader(client, 't').list(OWNER, 'case-1', null, 20);
    expect(page.events).toEqual([event()]);
    expect(decodeCursor(page.nextCursor!)).toBe('LEDGER#2026-10-03T15:00:00.000Z#ev-1');
    expect((client.sent[0] as QueryCommand).input).toMatchObject({
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: { ':pk': PK, ':prefix': 'LEDGER#' },
      ScanIndexForward: false,
      Limit: 20,
    });
  });

  it('rebuilds the partition from the owner, so a cursor cannot point at another user', async () => {
    const client = stubClient(() => ({ Items: [] }));
    await new DynamoLedgerReader(client, 't').list(OWNER, 'case-1', encodeCursor('LEDGER#x'), 20);
    expect((client.sent[0] as QueryCommand).input.ExclusiveStartKey).toEqual({ pk: PK, sk: 'LEDGER#x' });
    expect(decodeCursor(encodeCursor('CASE'))).toBeNull();
  });
});
