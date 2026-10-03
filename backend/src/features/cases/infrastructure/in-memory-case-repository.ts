import type { DentalCase } from '@actionbridge/contracts';
import type { CaseRepository, ReplaceOutcome } from '../ports/case-repository.js';

/** Test and local-development adapter with the same conditional-write semantics as DynamoDB. */
export class InMemoryCaseRepository implements CaseRepository {
  private readonly items = new Map<string, DentalCase>();

  async create(record: DentalCase): Promise<void> {
    const key = this.key(record.ownerId, record.caseId);
    if (this.items.has(key)) throw new Error('Case ID collision');
    this.items.set(key, structuredClone(record));
  }

  async get(ownerId: string, caseId: string): Promise<DentalCase | null> {
    const item = this.items.get(this.key(ownerId, caseId));
    return item === undefined ? null : structuredClone(item);
  }

  async replace(record: DentalCase, expectedRevision: number): Promise<ReplaceOutcome> {
    const key = this.key(record.ownerId, record.caseId);
    const current = this.items.get(key);
    if (current === undefined || current.caseRevision !== expectedRevision) return 'revision_conflict';
    this.items.set(key, structuredClone(record));
    return 'replaced';
  }

  private key(ownerId: string, caseId: string): string {
    return `${ownerId}|${caseId}`;
  }
}
