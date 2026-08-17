import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const podfilePath = resolve(process.argv[2] ?? 'apps/mobile/ios/Podfile');
const sourceUrl = process.argv[3]?.trim();

if (!sourceUrl) {
  throw new Error('A CocoaPods specs source URL is required.');
}

const original = readFileSync(podfilePath, 'utf8');
const marker = '# Living Plot CI: pinned CocoaPods specs source';

if (original.includes(marker)) {
  process.stdout.write('Pinned CocoaPods specs source already configured.\n');
  process.exit(0);
}

const header = `${marker}\nsource '${sourceUrl.replaceAll("'", "\\'")}'\n\n`;
writeFileSync(podfilePath, `${header}${original}`, 'utf8');
process.stdout.write('Configured pinned CocoaPods specs source.\n');
