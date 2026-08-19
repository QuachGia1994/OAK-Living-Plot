import { describe, expect, it } from 'vitest';
import {
  beginPasswordlessEmailOtp,
  createAsyncActionGate,
  passwordlessConfigurationMessage,
  resetPasswordlessEmailOtp,
  verifyPasswordlessEmailOtp,
  type PasswordlessSignInResource,
  type PasswordlessSignUpResource,
} from '../src/features/auth/passwordless-email-otp';

describe('passwordless email OTP flow', () => {
  it('completes an existing user after email-code verification without sign-up transfer', async () => {
    const signIn = fakeSignIn();
    const signUp = fakeSignUp();
    let navigated = 0;
    signIn.emailCode.verifyCode = async () => {
      signIn.status = 'complete';
      return { error: null };
    };

    const outcome = await verifyPasswordlessEmailOtp(signIn, signUp, '123456', () => { navigated += 1; });

    expect(outcome).toEqual({ kind: 'complete' });
    expect(signIn.finalizeCalls).toBe(1);
    expect(signUp.createCalls).toBe(0);
    expect(navigated).toBe(1);
  });

  it('transfers a verified unknown email to sign-up and finalizes when Clerk has no extra requirements', async () => {
    const signIn = fakeSignIn();
    const signUp = fakeSignUp();
    let navigated = 0;
    signIn.emailCode.verifyCode = async () => ({ error: clerkError('sign_up_if_missing_transfer') });
    signUp.create = async () => {
      signUp.createCalls += 1;
      signUp.status = 'complete';
      return { error: null };
    };

    const outcome = await verifyPasswordlessEmailOtp(signIn, signUp, '654321', () => { navigated += 1; });

    expect(outcome).toEqual({ kind: 'complete' });
    expect(signUp.createCalls).toBe(1);
    expect(signUp.finalizeCalls).toBe(1);
    expect(navigated).toBe(1);
  });

  it('reports configuration drift instead of inventing a password flow', async () => {
    const signIn = fakeSignIn();
    const signUp = fakeSignUp();
    signIn.emailCode.verifyCode = async () => ({ error: clerkError('sign_up_if_missing_transfer') });
    signUp.create = async () => {
      signUp.createCalls += 1;
      signUp.status = 'missing_requirements';
      signUp.missingFields = ['password'];
      return { error: null };
    };

    const outcome = await verifyPasswordlessEmailOtp(signIn, signUp, '654321', () => {});

    expect(outcome).toEqual({ kind: 'configuration_error', missingFields: ['password'] });
    expect(passwordlessConfigurationMessage(['password'], 'vi')).toContain('tắt yêu cầu Password');
    expect(signUp.finalizeCalls).toBe(0);
  });

  it('starts one privacy-preserving sign-in attempt and clears stale sign-up state first', async () => {
    const signIn = fakeSignIn();
    const signUp = fakeSignUp();

    const outcome = await beginPasswordlessEmailOtp(signIn, signUp, 'person@example.com');

    expect(outcome).toEqual({ kind: 'code_sent' });
    expect(signUp.resetCalls).toBe(1);
    expect(signIn.createInputs).toEqual([{ identifier: 'person@example.com', signUpIfMissing: true }]);
    expect(signIn.sendCalls).toBe(1);
  });

  it('blocks same-tick duplicate auth submissions with a single-flight gate', async () => {
    const gate = createAsyncActionGate();
    let calls = 0;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });

    const first = gate.run(async () => { calls += 1; await pending; return 'first'; });
    const second = gate.run(async () => { calls += 1; return 'second'; });
    expect(gate.locked()).toBe(true);
    expect(await second).toBeUndefined();
    expect(calls).toBe(1);

    release();
    expect(await first).toBe('first');
    expect(gate.locked()).toBe(false);
  });

  it('start-over clears both sign-in and transferred sign-up attempts', async () => {
    const signIn = fakeSignIn();
    const signUp = fakeSignUp();

    await resetPasswordlessEmailOtp(signIn, signUp);

    expect(signIn.resetCalls).toBe(1);
    expect(signUp.resetCalls).toBe(1);
  });
});

function clerkError(code: string) {
  return { errors: [{ code }] };
}

type TestSignIn = PasswordlessSignInResource & {
  createInputs: { identifier: string; signUpIfMissing: true }[];
  sendCalls: number;
  finalizeCalls: number;
  resetCalls: number;
};

function fakeSignIn(): TestSignIn {
  const resource: TestSignIn = {
    status: null,
    createInputs: [],
    sendCalls: 0,
    finalizeCalls: 0,
    resetCalls: 0,
    async create(input) { resource.createInputs.push(input); return { error: null }; },
    emailCode: {
      async sendCode() { resource.sendCalls += 1; return { error: null }; },
      async verifyCode() { return { error: null }; },
    },
    async finalize({ navigate }) { resource.finalizeCalls += 1; navigate(); },
    async reset() { resource.resetCalls += 1; resource.status = null; return { error: null }; },
  };
  return resource;
}

type TestSignUp = PasswordlessSignUpResource & {
  createCalls: number;
  finalizeCalls: number;
  resetCalls: number;
};

function fakeSignUp(): TestSignUp {
  const resource: TestSignUp = {
    status: null,
    missingFields: [],
    createCalls: 0,
    finalizeCalls: 0,
    resetCalls: 0,
    async create() { resource.createCalls += 1; return { error: null }; },
    async finalize({ navigate }) { resource.finalizeCalls += 1; navigate(); },
    async reset() { resource.resetCalls += 1; resource.status = null; resource.missingFields = []; return { error: null }; },
  };
  return resource;
}
