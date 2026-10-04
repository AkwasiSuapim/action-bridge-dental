import type { DentalCase, LedgerEvent, LedgerPage, SavedStrategy } from '@actionbridge/contracts';
import type { CaseRepository, ReplaceOutcome } from '../features/cases/ports/case-repository.js';
import type { LedgerReader } from '../features/ledger/ports/ledger-reader.js';
import type { IdempotencyRecord, SaveOutcome, StrategyRepository, StrategySave } from '../features/strategies/ports/strategy-repository.js';

/**
 * Test and local-development adapter mirroring the single DynamoDB table: the same owner
 * scoping, conditional writes and atomic event recording. Lost on restart.
 */
export class InMemoryStore implements CaseRepository, StrategyRepository, LedgerReader {
  private readonly cases = new Map<string, DentalCase>();
  private readonly ledger = new Map<string, LedgerEvent[]>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private readonly strategies = new Map<string, SavedStrategy[]>();

  // ---- cases ----

  async create(record: DentalCase, event: LedgerEvent): Promise<void> {
    const key = this.key(record.ownerId, record.caseId);
    if (this.cases.has(key)) throw new Error('Case ID collision');
    this.cases.set(key, structuredClone(record));
    this.append(key, event);
  }

  async get(ownerId: string, caseId: string): Promise<DentalCase | null> {
    const item = this.cases.get(this.key(ownerId, caseId));
    return item === undefined ? null : structuredClone(item);
  }

  async replace(record: DentalCase, event: LedgerEvent, expectedRevision: number): Promise<ReplaceOutcome> {
    const key = this.key(record.ownerId, record.caseId);
    const current = this.cases.get(key);
    if (current === undefined || current.caseRevision !== expectedRevision) return 'revision_conflict';
    this.cases.set(key, structuredClone(record));
    this.append(key, event);
    return 'replaced';
  }

  // ---- strategies ----

  async findByIdempotencyKey(ownerId: string, caseId: string, idempotencyKey: string): Promise<IdempotencyRecord | null> {
    const record = this.idempotency.get(`${this.key(ownerId, caseId)}|${idempotencyKey}`);
    return record === undefined ? null : structuredClone(record);
  }

  async save(input: StrategySave): Promise<SaveOutcome> {
    const key = this.key(input.ownerId, input.strategy.caseId);
    const idempotencyKey = `${key}|${input.idempotencyKey}`;
    if (this.cases.get(key)?.caseRevision !== input.expectedRevision) return 'revision_conflict';
    if (this.idempotency.has(idempotencyKey)) return 'idempotency_key_taken';
    this.idempotency.set(idempotencyKey, structuredClone({ strategy: input.strategy, requestFingerprint: input.requestFingerprint }));
    this.strategies.set(key, [...(this.strategies.get(key) ?? []), structuredClone(input.strategy)]);
    this.append(key, input.event);
    return 'saved';
  }

  async listForCase(ownerId: string, caseId: string): Promise<SavedStrategy[]> {
    return structuredClone(this.strategies.get(this.key(ownerId, caseId)) ?? []);
  }

  // ---- ledger ----

  async list(ownerId: string, caseId: string, cursor: string | null, limit: number): Promise<LedgerPage> {
    const events = [...(this.ledger.get(this.key(ownerId, caseId)) ?? [])].reverse();
    const start = cursor === null ? 0 : Number(cursor);
    const page = events.slice(start, start + limit);
    return { events: structuredClone(page), nextCursor: start + limit < events.length ? String(start + limit) : null };
  }

  private append(key: string, event: LedgerEvent): void {
    this.ledger.set(key, [...(this.ledger.get(key) ?? []), structuredClone(event)]);
  }

  private key(ownerId: string, caseId: string): string {
    return `${ownerId}|${caseId}`;
  }
}
