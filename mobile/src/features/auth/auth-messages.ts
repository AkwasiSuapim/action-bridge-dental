import { CognitoError } from './cognito';
import type { SignedOutReason } from './auth-context';

/**
 * User-facing copy for Welcome notes and sign-in errors (design v3, Welcome and Auth states).
 * Accounts are admin-created for the demo (D-15), so there is no self-service reset or sign-up.
 */

export type WelcomeNote = 'cancelled' | 'expired' | 'signed_out';

const NOTES: Record<WelcomeNote, string> = {
  cancelled: 'Sign-in was cancelled. Nothing changed. Sign in when you’re ready.',
  expired: 'Your session expired. Sign in again to pick up where you left off.',
  signed_out: 'You’re signed out.',
};

/** An explicit `note` route param wins; otherwise the auth context's reason for being signed out. */
export function welcomeNote(param: string | string[] | undefined, reason: SignedOutReason): string | null {
  const value = Array.isArray(param) ? param[0] : param;
  if (value && value in NOTES) return NOTES[value as WelcomeNote];
  return reason ? NOTES[reason] : null;
}

export interface SignInErrorView {
  kind: 'missing' | 'invalid' | 'network' | 'other';
  /** `warning` for connection problems the user did not cause; `danger` for input they can fix. */
  tone: 'danger' | 'warning';
  message: string;
}

export const MISSING_CREDENTIALS: SignInErrorView = { kind: 'missing', tone: 'danger', message: 'Enter your email and password.' };

export function signInErrorView(error: unknown): SignInErrorView {
  if (error instanceof CognitoError) {
    if (error.code === 'NotAuthorizedException' || error.code === 'UserNotFoundException') {
      return {
        kind: 'invalid',
        tone: 'danger',
        message: 'That email and password don’t match. Try again.',
      };
    }
    if (error.code === 'NETWORK') {
      return { kind: 'network', tone: 'warning', message: 'We couldn’t reach the sign-in service. Check your connection and try again.' };
    }
    return { kind: 'other', tone: 'danger', message: error.message };
  }
  return { kind: 'other', tone: 'danger', message: 'Sign-in failed. Try again.' };
}
