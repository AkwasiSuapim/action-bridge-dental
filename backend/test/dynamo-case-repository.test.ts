import { DentalCaseSchema, type DentalCase } from '@actionbridge/contracts';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it } from 'vitest';
import { caseKey, DynamoCaseRepository, type DocumentClient } from '../src/features/cases/infrastructure/dynamo-case-repository.js';
import { fixtureCreateRequest } from './helpers.js';

function record(ownerId = 'demo:device-maya-0000000001'): DentalCase {
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

function stubClient(respond: (command: unknown) => unknown): DocumentClient & { sent: unknown[] } {
  const sent: unknown[] = [];
  return {
    sent,
    send: (async (command: unknown) => {
      sent.push(command);
      return respond(command);
    }) as DocumentClient['send'],
  };
}

describe('DynamoCaseRepository', () => {
  it('creates with an owner-scoped key, a no-overwrite condition and an optional TTL', async () => {
    const client = stubClient(() => ({}));
    await new DynamoCaseRepository(client, 'cases-table').create(record(), 1_760_000_000);

    const command = client.sent[0] as PutCommand;
    expect(command).toBeInstanceOf(PutCommand);
    expect(command.input).toMatchObject({
      TableName: 'cases-table',
      ConditionExpression: 'attribute_not_exists(pk)',
      Item: { pk: 'USER#demo%3Adevice-maya-0000000001#CASE#case-1', sk: 'CASE', caseRevision: 1, expiresAt: 1_760_000_000 },
    });
  });

  it('encodes owner IDs so they cannot forge another key', () => {
    expect(caseKey('user:a#CASE#x', 'case-1').pk).toBe('USER#user%3Aa%23CASE%23x#CASE#case-1');
  });

  it('replaces only when the stored revision matches', async () => {
    const client = stubClient(() => ({}));
    const outcome = await new DynamoCaseRepository(client, 't').replace({ ...record(), caseRevision: 2 }, 1, null);
    expect(outcome).toBe('replaced');
    const input = (client.sent[0] as PutCommand).input;
    expect(input.ConditionExpression).toBe('attribute_exists(pk) AND caseRevision = :expected');
    expect(input.ExpressionAttributeValues).toEqual({ ':expected': 1 });
    expect(input.Item).not.toHaveProperty('expiresAt');
  });

  it('maps a failed condition to a revision conflict and rethrows anything else', async () => {
    const conflict = Object.assign(new Error('failed'), { name: 'ConditionalCheckFailedException' });
    const repo = new DynamoCaseRepository(stubClient(() => Promise.reject(conflict)), 't');
    await expect(repo.replace(record(), 1, null)).resolves.toBe('revision_conflict');

    const throttled = Object.assign(new Error('slow down'), { name: 'ProvisionedThroughputExceededException' });
    const failing = new DynamoCaseRepository(stubClient(() => Promise.reject(throttled)), 't');
    await expect(failing.replace(record(), 1, null)).rejects.toThrow('slow down');
  });

  it('reads with strong consistency and validates the stored record', async () => {
    const stored = record();
    const client = stubClient(() => ({ Item: { ...caseKey(stored.ownerId, 'case-1'), case: stored } }));
    const repo = new DynamoCaseRepository(client, 't');
    await expect(repo.get(stored.ownerId, 'case-1')).resolves.toEqual(stored);
    expect((client.sent[0] as GetCommand).input).toMatchObject({ ConsistentRead: true, Key: caseKey(stored.ownerId, 'case-1') });
  });

  it('returns null for a missing item or an owner mismatch', async () => {
    await expect(new DynamoCaseRepository(stubClient(() => ({})), 't').get('demo:x', 'case-1')).resolves.toBeNull();
    const foreign = stubClient(() => ({ Item: { case: record('demo:someone-else-000000') } }));
    await expect(new DynamoCaseRepository(foreign, 't').get('demo:device-maya-0000000001', 'case-1')).resolves.toBeNull();
  });
});
