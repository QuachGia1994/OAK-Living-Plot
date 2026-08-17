import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const allowMissing = process.argv.includes('--allow-missing');
const root = process.cwd();
const apiValues = loadValues(resolve(root, 'apps/api/.dev.vars'));
const mobileValues = loadValues(resolve(root, 'apps/mobile/.env'));

const checks = [
  check('api', 'CLERK_PUBLISHABLE_KEY', apiValues, (value) => /^pk_(test|live)_/.test(value) && nonPlaceholder(value)),
  check('api', 'CLERK_JWT_KEY', apiValues, (value) => value.includes('BEGIN PUBLIC KEY') && nonPlaceholder(value)),
  check('api', 'CLERK_AUTHORIZED_PARTIES', apiValues, looksLikeHttpsList),
  check('api', 'GEMINI_API_KEY', apiValues, nonPlaceholder),
  check('api', 'GOOGLE_SERVICE_ACCOUNT_EMAIL', apiValues, (value) => value.includes('@') && value.endsWith('.iam.gserviceaccount.com') && nonPlaceholder(value)),
  check('api', 'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', apiValues, (value) => value.includes('BEGIN PRIVATE KEY') && nonPlaceholder(value)),
  check('api', 'REVENUECAT_SECRET_API_KEY', apiValues, nonPlaceholder),
  check('api', 'REVENUECAT_PLUS_ENTITLEMENT_ID', apiValues, (value) => value === 'plus'),
  check('api', 'REVENUECAT_WEBHOOK_AUTHORIZATION', apiValues, (value) => value.startsWith('Bearer ') && value.length > 20 && nonPlaceholder(value)),
  check('api', 'REVENUECAT_WEBHOOK_SIGNING_SECRET', apiValues, nonPlaceholder),
  check('mobile', 'EXPO_PUBLIC_LIVING_PLOT_API_URL', mobileValues, looksLikeHttpsUrl),
  check('mobile', 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY', mobileValues, (value) => /^pk_(test|live)_/.test(value) && nonPlaceholder(value)),
];

const storeConfigured = [
  mobileValues.EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY,
  mobileValues.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  mobileValues.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
].some((value) => typeof value === 'string' && nonPlaceholder(value));

const missing = checks.filter((item) => item.status === 'missing');
const invalid = checks.filter((item) => item.status === 'invalid');
for (const item of checks) console.log(`${item.status.toUpperCase().padEnd(7)} ${item.scope}:${item.name}`);
console.log(`${storeConfigured ? 'READY' : 'OPTIONAL'}  mobile:RevenueCat public store key`);
console.log(`Summary: ${checks.length - missing.length - invalid.length}/${checks.length} required live values ready.`);

if (invalid.length > 0) process.exit(1);
if (!allowMissing && missing.length > 0) process.exit(2);

function check(scope, name, values, validate) {
  const value = values[name] ?? process.env[name] ?? '';
  if (!value) return { scope, name, status: 'missing' };
  return { scope, name, status: validate(value) ? 'ready' : 'invalid' };
}

function loadValues(path) {
  if (!existsSync(path)) return {};
  const result = {};
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equals = line.indexOf('=');
    if (equals < 1) continue;
    const key = line.slice(0, equals).trim();
    result[key] = unquote(line.slice(equals + 1).trim());
  }
  return result;
}

function unquote(value) {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1).replaceAll('\\n', '\n');
  }
  return value;
}

function nonPlaceholder(value) {
  const normalized = value.toLowerCase();
  return value.trim().length >= 8 && !normalized.includes('replace_me') && !normalized.includes('replace_with') && !normalized.includes('example.com');
}

function looksLikeHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:' && nonPlaceholder(value);
  } catch {
    return false;
  }
}

function looksLikeHttpsList(value) {
  const entries = value.split(',').map((entry) => entry.trim()).filter(Boolean);
  return entries.length > 0 && entries.every(looksLikeHttpsUrl);
}
