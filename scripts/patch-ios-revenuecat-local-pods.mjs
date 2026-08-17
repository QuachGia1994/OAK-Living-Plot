import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const podfilePath = resolve(process.argv[2] ?? 'apps/mobile/ios/Podfile');
const original = readFileSync(podfilePath, 'utf8');
const marker = "target 'LivingPlot' do";
const localPodsMarker = '# Living Plot CI: pinned local RevenueCat sources';

if (original.includes(localPodsMarker)) {
  process.stdout.write('RevenueCat local pods already configured.\n');
  process.exit(0);
}

if (!original.includes(marker)) {
  throw new Error(`Could not find ${marker} in ${podfilePath}`);
}

const localPods = `${marker}\n  ${localPodsMarker}\n  pod 'RevenueCat', :path => './vendor/purchases-ios'\n  pod 'RevenueCatUI', :path => './vendor/purchases-ios'\n  pod 'PurchasesHybridCommon', :path => './vendor/purchases-hybrid-common'\n  pod 'PurchasesHybridCommonUI', :path => './vendor/purchases-hybrid-common'`;

writeFileSync(podfilePath, original.replace(marker, localPods), 'utf8');
process.stdout.write('Configured pinned local RevenueCat CocoaPods sources.\n');
