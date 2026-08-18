import type { UiLocale } from '@/features/preferences/contracts';

export interface DramaShareInput {
  title: string;
  sceneNumber: number;
  premise: string;
  uiLocale: UiLocale;
}

export function buildSpoilerSafeDramaShareText(input: DramaShareInput): string {
  const vi = input.uiLocale === 'vi';
  const title = clean(input.title, 70) || (vi ? 'Drama Living Plot của tôi' : 'My Living Plot drama');
  const premise = clean(input.premise, 170);
  const sceneNumber = Number.isInteger(input.sceneNumber) && input.sceneNumber > 0 ? input.sceneNumber : 1;
  const hook = premise
    ? `${vi ? 'Mở đầu' : 'Hook'}: ${premise}`
    : vi ? 'Tôi vừa đến một điểm quyết định mới.' : 'I just reached another decision point.';
  const footer = vi
    ? 'Tôi chọn điều xảy ra tiếp theo trong Living Plot.'
    : 'I pick what happens next in Living Plot.';
  const sceneLabel = vi ? `Cảnh ${sceneNumber}` : `Scene ${sceneNumber}`;
  return clean(`${title} · ${sceneLabel}\n${hook}\n${footer}`, 320);
}

function clean(value: string, max: number): string {
  const normalized = value.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
