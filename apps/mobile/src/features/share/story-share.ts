export interface StoryShareInput {
  title: string;
  episodeNumber: number;
  premise: string;
}

export function buildSpoilerSafeShareText(input: StoryShareInput): string {
  const title = clean(input.title, 70) || 'My Living Plot story';
  const premise = clean(input.premise, 170);
  const episode = Number.isInteger(input.episodeNumber) && input.episodeNumber > 0 ? input.episodeNumber : 1;
  const hook = premise ? `Hook: ${premise}` : 'I just reached another decision point.';
  return clean(`${title} · Episode ${episode}\n${hook}\nI pick what happens next in Living Plot.`, 320);
}

function clean(value: string, max: number): string {
  const normalized = value.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
