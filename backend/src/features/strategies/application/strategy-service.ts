import type { LedgerEvent, SavedStrategy, SaveStrategyRequest, SaveStrategyResponse } from '@actionbridge/contracts';
import { compareSchedules } from '@actionbridge/benefits-engine';
import { expiresAtFrom } from '../../../shared/dynamo.js';
import { HttpError } from '../../../shared/http.js';
import { revisionConflict, toEngineInput, type CaseService } from '../../cases/application/case-service.js';
import type { IdempotencyRecord, StrategyRepository } from '../ports/strategy-repository.js';

export interface StrategyServiceDeps {
  cases: CaseService;
  strategies: StrategyRepository;
  now: () => Date;
  newId: () => string;
  retentionDays: number | null;
}

/**
 * Saves the user's chosen scenario (T6-01). The scenario is recomputed on the server for the
 * expected revision — the client never supplies amounts. One idempotency key = one logical save.
 */
export class StrategyService {
  constructor(private readonly deps: StrategyServiceDeps) {}

  async save(ownerId: string, caseId: string, idempotencyKey: string, request: SaveStrategyRequest): Promise<SaveStrategyResponse> {
    const fingerprint = `${request.scenarioId}@${request.expectedRevision}`;
    const existing = await this.deps.strategies.findByIdempotencyKey(ownerId, caseId, idempotencyKey);
    if (existing) return replay(existing, fingerprint);

    const record = await this.deps.cases.getAtRevision(ownerId, caseId, request.expectedRevision);
    const comparison = compareSchedules(toEngineInput(record));
    if (comparison.status !== 'estimated') {
      throw new HttpError('INCONSISTENT_INPUT', 'This case can’t be estimated yet, so there is no option to save.');
    }
    const scenario = [comparison.baseline, ...comparison.alternatives].find((s) => s.scenarioId === request.scenarioId);
    if (scenario === undefined) {
      throw new HttpError('NOT_FOUND', 'That option isn’t available for this version of the case. Recalculate and choose again.');
    }

    const savedAt = this.deps.now().toISOString();
    const strategy: SavedStrategy = { strategyId: this.deps.newId(), caseId, caseRevision: record.caseRevision, scenario, savedAt };
    const event: LedgerEvent = {
      eventId: this.deps.newId(),
      caseId,
      action: 'strategy_saved',
      actor: 'user',
      caseRevision: record.caseRevision,
      summary: `Strategy saved: ${scenario.scenarioId}`,
      strategyId: strategy.strategyId,
      at: savedAt,
    };

    const outcome = await this.deps.strategies.save({
      ownerId,
      idempotencyKey,
      requestFingerprint: fingerprint,
      expectedRevision: request.expectedRevision,
      strategy,
      event,
      expiresAtEpochSeconds: expiresAtFrom(this.deps.now(), this.deps.retentionDays),
    });
    if (outcome === 'revision_conflict') throw revisionConflict();
    if (outcome === 'idempotency_key_taken') {
      // A concurrent request with the same key won the race; return its result.
      const raced = await this.deps.strategies.findByIdempotencyKey(ownerId, caseId, idempotencyKey);
      if (raced) return replay(raced, fingerprint);
      throw new HttpError('IDEMPOTENCY_CONFLICT', 'This save is already being processed. Try again in a moment.');
    }
    return { strategy, replayed: false };
  }
}

function replay(existing: IdempotencyRecord, fingerprint: string): SaveStrategyResponse {
  if (existing.requestFingerprint !== fingerprint) {
    throw new HttpError('IDEMPOTENCY_CONFLICT', 'This save key was already used for a different choice. Start a new save.');
  }
  return { strategy: existing.strategy, replayed: true };
}
