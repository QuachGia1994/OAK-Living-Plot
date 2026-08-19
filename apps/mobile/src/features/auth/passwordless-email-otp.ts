export type PasswordlessOtpOutcome =
  | { kind: 'code_sent' }
  | { kind: 'complete' }
  | { kind: 'configuration_error'; missingFields: string[] }
  | { kind: 'not_complete' }
  | { kind: 'error'; code: string | null };

export interface PasswordlessSignInResource {
  status: string | null;
  create(input: { identifier: string; signUpIfMissing: true }): Promise<{ error: unknown }>;
  emailCode: {
    sendCode(): Promise<{ error: unknown }>;
    verifyCode(input: { code: string }): Promise<{ error: unknown }>;
  };
  finalize(options: { navigate: () => void }): Promise<unknown>;
  reset(): Promise<unknown>;
}

export interface PasswordlessSignUpResource {
  status: string | null;
  missingFields?: string[] | null;
  create(input: { transfer: true }): Promise<{ error: unknown }>;
  finalize(options: { navigate: () => void }): Promise<unknown>;
  reset(): Promise<unknown>;
}

export async function beginPasswordlessEmailOtp(
  signIn: PasswordlessSignInResource,
  signUp: PasswordlessSignUpResource,
  identifier: string,
): Promise<PasswordlessOtpOutcome> {
  await signUp.reset();
  const created = await signIn.create({ identifier, signUpIfMissing: true });
  if (created.error) return { kind: 'error', code: clerkErrorCode(created.error) };

  const sent = await signIn.emailCode.sendCode();
  if (sent.error) return { kind: 'error', code: clerkErrorCode(sent.error) };
  return { kind: 'code_sent' };
}

export async function resendPasswordlessEmailOtp(
  signIn: PasswordlessSignInResource,
): Promise<PasswordlessOtpOutcome> {
  const sent = await signIn.emailCode.sendCode();
  return sent.error
    ? { kind: 'error', code: clerkErrorCode(sent.error) }
    : { kind: 'code_sent' };
}

export async function verifyPasswordlessEmailOtp(
  signIn: PasswordlessSignInResource,
  signUp: PasswordlessSignUpResource,
  code: string,
  navigate: () => void,
): Promise<PasswordlessOtpOutcome> {
  const verified = await signIn.emailCode.verifyCode({ code });
  if (verified.error) {
    if (clerkErrorCode(verified.error) !== 'sign_up_if_missing_transfer') {
      return { kind: 'error', code: clerkErrorCode(verified.error) };
    }

    const transferred = await signUp.create({ transfer: true });
    if (transferred.error) return { kind: 'error', code: clerkErrorCode(transferred.error) };
    if (signUp.status === 'complete') {
      await signUp.finalize({ navigate });
      return { kind: 'complete' };
    }
    if (signUp.status === 'missing_requirements') {
      return { kind: 'configuration_error', missingFields: [...(signUp.missingFields ?? [])] };
    }
    return { kind: 'not_complete' };
  }

  if (signIn.status !== 'complete') return { kind: 'not_complete' };
  await signIn.finalize({ navigate });
  return { kind: 'complete' };
}

export async function resetPasswordlessEmailOtp(
  signIn: PasswordlessSignInResource,
  signUp: PasswordlessSignUpResource,
): Promise<void> {
  await Promise.all([signIn.reset(), signUp.reset()]);
}

export function passwordlessConfigurationMessage(missingFields: readonly string[], locale: 'en' | 'vi'): string {
  if (missingFields.includes('password')) {
    return locale === 'vi'
      ? 'Clerk đang bật yêu cầu mật khẩu cho đăng ký mới. Living Plot chỉ dùng email OTP; hãy tắt yêu cầu Password trong Clerk Dashboard.'
      : 'Clerk is requiring a password for new sign-ups. Living Plot uses email OTP only; disable the Password requirement in Clerk Dashboard.';
  }
  return locale === 'vi'
    ? 'Clerk đang yêu cầu thêm thông tin tài khoản ngoài email. Living Plot Phase 1 chỉ hỗ trợ đăng ký công khai bằng email OTP; hãy bỏ các trường bắt buộc bổ sung trong Clerk Dashboard.'
    : 'Clerk is requiring account fields beyond email. Living Plot Phase 1 supports public email-OTP sign-up only; remove additional required profile fields in Clerk Dashboard.';
}

export function passwordlessErrorMessage(code: string | null, locale: 'en' | 'vi'): string {
  const vi = locale === 'vi';
  if (code === 'form_code_incorrect') return vi ? 'Mã xác minh không đúng. Kiểm tra email và thử lại.' : 'That verification code is incorrect. Check your email and try again.';
  if (code === 'verification_expired') return vi ? 'Mã xác minh đã hết hạn. Hãy gửi mã mới.' : 'That verification code expired. Send a new code.';
  if (code === 'too_many_requests') return vi ? 'Có quá nhiều yêu cầu xác minh. Hãy chờ một lúc rồi thử lại.' : 'Too many verification attempts. Wait a moment and try again.';
  if (code === 'sign_up_restricted') return vi ? 'Clerk hiện không cho phép đăng ký công khai. Hãy kiểm tra cấu hình đăng ký trong Clerk Dashboard.' : 'Clerk is not allowing public sign-up. Check the sign-up mode in Clerk Dashboard.';
  return vi ? 'Không thể hoàn tất xác thực email. Hãy thử lại.' : 'Email authentication could not continue. Try again.';
}

export function clerkErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('errors' in error)) return null;
  const errors = (error as { errors?: { code?: string }[] }).errors;
  return errors?.[0]?.code ?? null;
}

export interface AsyncActionGate {
  run<T>(action: () => Promise<T>): Promise<T | undefined>;
  locked(): boolean;
}

export function createAsyncActionGate(): AsyncActionGate {
  let inFlight = false;
  return {
    locked: () => inFlight,
    async run<T>(action: () => Promise<T>): Promise<T | undefined> {
      if (inFlight) return undefined;
      inFlight = true;
      try {
        return await action();
      } finally {
        inFlight = false;
      }
    },
  };
}
