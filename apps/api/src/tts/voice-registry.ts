export interface ApprovedVoice {
  variant: string;
  languageCode: string;
  providerVoiceId: string;
}

const APPROVED_VOICES: Record<string, ApprovedVoice> = {
  'vi-narrator-female': {
    variant: 'vi-narrator-female',
    languageCode: 'vi-VN',
    providerVoiceId: 'Aoede',
  },
  'en-narrator-female': {
    variant: 'en-narrator-female',
    languageCode: 'en-US',
    providerVoiceId: 'Aoede',
  },
};

export function approvedVoice(variant: string): ApprovedVoice | null {
  return APPROVED_VOICES[variant] ?? null;
}

export function approvedVoiceVariants(): readonly string[] {
  return Object.keys(APPROVED_VOICES);
}
