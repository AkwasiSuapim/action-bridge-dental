import type { AgentJobView, JobStageEvent, JobStatus, UiBlockEnvelope } from '@actionbridge/contracts';
import type { FactGroup } from './domain/extraction.js';

/** Stored job. Only `AgentJobView` fields are ever returned to clients. */
export interface JobRecord {
  jobId: string;
  ownerId: string;
  caseId: string;
  caseRevision: number;
  operation: AgentJobView['operation'];
  status: JobStatus;
  attempt: number;
  maxAttempts: number;
  /** The user's description. Never logged; expires with the job. */
  inputText: string | null;
  events: JobStageEvent[];
  questions: UiBlockEnvelope | null;
  resultBlocks: UiBlockEnvelope | null;
  error: AgentJobView['error'];
  /** Proposed fact groups behind each `confirm-N` question. Server-side only. */
  proposals: FactGroup[];
  leaseToken: string | null;
  leaseUntil: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobWriteCondition {
  /** The stored job must currently have one of these statuses. */
  status?: JobStatus[];
  /** The stored lease token must equal this value (the worker that claimed the job). */
  leaseToken?: string;
}

export interface JobRepository {
  create(job: JobRecord, expiresAtEpochSeconds: number | null): Promise<void>;
  get(ownerId: string, jobId: string): Promise<JobRecord | null>;
  /** Conditional replace; returns false when the condition no longer holds. */
  put(job: JobRecord, condition: JobWriteCondition, expiresAtEpochSeconds: number | null): Promise<boolean>;
}

export interface JobQueue {
  enqueue(message: { ownerId: string; jobId: string }): Promise<void>;
}

// ---- Model port: a thin mirror of the Bedrock Converse shapes, so tests can script a model. ----

export type ContentBlock =
  | { text: string }
  | { toolUse: { toolUseId: string; name: string; input: unknown } }
  | { toolResult: { toolUseId: string; content: { json: unknown }[]; status?: 'success' | 'error' } };

export interface ModelMessage {
  role: 'user' | 'assistant';
  content: ContentBlock[];
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ModelTurn {
  stopReason: string;
  content: ContentBlock[];
}

export class ModelError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    /** AWS's own error text (identifiers such as role and model ARNs, never user content), for diagnostics. */
    readonly detail: string | null = null,
  ) {
    super(message);
    this.name = 'ModelError';
  }
}

export interface AgentModel {
  converse(request: { system: string; messages: ModelMessage[]; tools: ToolSpec[]; maxTokens: number }): Promise<ModelTurn>;
}
