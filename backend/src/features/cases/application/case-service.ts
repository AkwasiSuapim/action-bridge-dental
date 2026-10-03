import type {
  CaseStatus,
  CreateCaseRequest,
  CreateCaseResponse,
  DentalCase,
  DentalCaseInput,
  PatchCaseRequest,
} from '@actionbridge/contracts';
import { estimateCase } from '@actionbridge/benefits-engine';
import { HttpError } from '../../../shared/http.js';
import type { CaseRepository } from '../ports/case-repository.js';

export interface CaseServiceDeps {
  repository: CaseRepository;
  now: () => Date;
  newId: () => string;
  /** Demo data retention; null keeps records without a TTL. */
  retentionDays: number | null;
}

export class CaseService {
  constructor(private readonly deps: CaseServiceDeps) {}

  async create(ownerId: string, request: CreateCaseRequest): Promise<CreateCaseResponse> {
    const timestamp = this.deps.now().toISOString();
    const input: DentalCaseInput = {
      caseRevision: 1,
      currency: request.currency,
      policy: request.policy,
      planYears: request.planYears,
      procedures: request.procedures,
    };
    const record: DentalCase = {
      ...input,
      caseId: this.deps.newId(),
      ownerId,
      status: deriveStatus(input),
      sourceFacts: request.sourceFacts ?? [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.deps.repository.create(record, this.expiresAt());
    return { caseId: record.caseId, caseRevision: record.caseRevision };
  }

  async get(ownerId: string, caseId: string): Promise<DentalCase> {
    const record = await this.deps.repository.get(ownerId, caseId);
    if (record === null) throw new HttpError('NOT_FOUND', 'Case not found.');
    return record;
  }

  /** Loads the case only if the caller is working from its current revision. */
  async getAtRevision(ownerId: string, caseId: string, expectedRevision: number): Promise<DentalCase> {
    const record = await this.get(ownerId, caseId);
    if (record.caseRevision !== expectedRevision) throw revisionConflict();
    return record;
  }

  async patch(ownerId: string, caseId: string, request: PatchCaseRequest): Promise<CreateCaseResponse> {
    const current = await this.getAtRevision(ownerId, caseId, request.expectedRevision);
    const { changes } = request;
    const input: DentalCaseInput = {
      caseRevision: current.caseRevision + 1,
      currency: current.currency,
      policy: changes.policy !== undefined ? changes.policy : current.policy,
      planYears: changes.planYears ?? current.planYears,
      procedures: changes.procedures ?? current.procedures,
    };
    const updated: DentalCase = {
      ...current,
      ...input,
      status: deriveStatus(input),
      sourceFacts: changes.sourceFacts ?? current.sourceFacts,
      updatedAt: this.deps.now().toISOString(),
    };
    const outcome = await this.deps.repository.replace(updated, current.caseRevision, this.expiresAt());
    if (outcome === 'revision_conflict') throw revisionConflict();
    return { caseId, caseRevision: updated.caseRevision };
  }

  private expiresAt(): number | null {
    if (this.deps.retentionDays === null) return null;
    return Math.floor(this.deps.now().getTime() / 1000) + this.deps.retentionDays * 86_400;
  }
}

/** The calculation-relevant snapshot passed to the engine. */
export function toEngineInput(record: DentalCase): DentalCaseInput {
  return {
    caseRevision: record.caseRevision,
    currency: record.currency,
    policy: record.policy,
    planYears: record.planYears,
    procedures: record.procedures,
  };
}

/** `ready` once the engine can produce an estimate; otherwise the case is still a `draft`. */
function deriveStatus(input: DentalCaseInput): CaseStatus {
  return estimateCase(input).status === 'estimated' ? 'ready' : 'draft';
}

function revisionConflict(): HttpError {
  return new HttpError('REVISION_CONFLICT', 'This case changed since you loaded it. Reload it and try again.');
}
