import { describe, expect, it } from 'vitest';
import { signInErrorView, welcomeNote } from './auth-messages';
import { CognitoError } from './cognito';

describe('welcomeNote', () => {
  it('prefers the route param, then the signed-out reason', () => {
    expect(welcomeNote('signed_out', 'expired')).toBe('You’re signed out.');
    expect(welcomeNote(undefined, 'expired')).toMatch(/session expired/);
    expect(welcomeNote(undefined, 'signed_out')).toBe('You’re signed out.');
    expect(welcomeNote(['expired', 'signed_out'], null)).toMatch(/session expired/);
  });

  it('shows nothing on a fresh start or for an unknown param', () => {
    expect(welcomeNote(undefined, null)).toBeNull();
    expect(welcomeNote('hacked<script>', null)).toBeNull();
  });
});

describe('signInErrorView', () => {
  it('treats wrong password and unknown user the same, without revealing which', () => {
    const wrong = signInErrorView(new CognitoError('NotAuthorizedException', 'x'));
    const unknown = signInErrorView(new CognitoError('UserNotFoundException', 'x'));
    expect(wrong).toEqual(unknown);
    expect(wrong).toMatchObject({ kind: 'invalid', tone: 'danger' });
  });

  it('marks connection failures as a warning the user did not cause', () => {
    expect(signInErrorView(new CognitoError('NETWORK', 'x'))).toMatchObject({ kind: 'network', tone: 'warning' });
  });

  it('keeps the friendly Cognito message for other known failures and hides unexpected errors', () => {
    expect(signInErrorView(new CognitoError('TooManyRequestsException', 'Too many attempts.')).message).toBe('Too many attempts.');
    expect(signInErrorView(new Error('stack trace')).message).toBe('Sign-in failed. Try again.');
  });
});
