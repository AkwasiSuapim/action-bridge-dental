import { randomUUID } from 'expo-crypto';

/** A fresh key for one user action (e.g. tapping Save). Reuse it when retrying that same action. */
export function newIdempotencyKey(): string {
  return randomUUID();
}
