const args = new Set(process.argv.slice(2));
const mode = readMode(args);
const apiBaseUrl = readApiBaseUrl();
const bearerToken = process.env.LIVING_PLOT_SMOKE_BEARER_TOKEN?.trim() ?? '';
const runId = (process.env.LIVING_PLOT_SMOKE_RUN_ID?.trim() || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/gu, '').slice(0, 48);

await healthSmoke();
if (mode === 'health') {
  finish();
} else {
  requireBearerToken();
  let coreContext = null;
  if (mode === 'core' || mode === 'all') coreContext = await coreSmoke();
  if (mode === 'voice' || mode === 'all') await voiceSmoke(coreContext);
  if (mode === 'billing' || mode === 'all') await billingSmoke();
  if (mode === 'all' && coreContext?.plotId && !args.has('--keep-plot')) await archiveSmokePlot(coreContext.plotId);
  finish();
}

async function healthSmoke() {
  const response = await fetchWithTimeout(`${apiBaseUrl}/health`, { method: 'GET' }, 10_000);
  const payload = await readJson(response);
  assert(response.ok, `health failed with HTTP ${response.status}`);
  assert(payload?.service === 'living-plot-api' && payload?.status === 'ok', 'health returned an unexpected payload');
  console.log('PASS health: live API responded with the Living Plot service contract.');
}

async function coreSmoke() {
  const identity = await authJson('/v1/me', 'GET');
  assert(typeof identity?.user?.id === 'string' && identity.user.id.length > 0, 'authenticated identity payload is invalid');

  const locale = process.env.LIVING_PLOT_SMOKE_LOCALE?.trim() === 'vi-VN' ? 'vi-VN' : 'en-US';
  const premise = locale === 'vi-VN'
    ? `Kiểm tra live ${runId}: một tin nhắn lạ xuất hiện đúng lúc nhân vật sắp đưa ra quyết định quan trọng.`
    : `Live smoke ${runId}: an unexpected message arrives just before the main character must make an important decision.`;
  const storyEnvelope = await authJson('/v1/story/plots', 'POST', {
    creationKey: `smoke-${runId}-create`,
    generationKey: `smoke-${runId}-episode-1`,
    premise,
    mood: 'mysterious',
    characterName: locale === 'vi-VN' ? 'Linh' : 'Ari',
    locale,
  });
  const story = requireStory(storyEnvelope?.story, 'created story');
  assert(story.episode.status === 'awaiting_choice', 'episode 1 is not awaiting a choice');
  assert(story.episode.choices.length === 3, 'episode 1 does not expose exactly three choices');

  const choice = story.episode.choices[0];
  const committedEnvelope = await authJson(
    `/v1/story/plots/${encodeURIComponent(story.id)}/episodes/${encodeURIComponent(story.episode.id)}/choices/${encodeURIComponent(choice.id)}`,
    'POST',
  );
  const committed = requireStory(committedEnvelope?.story, 'committed story');
  assert(committed.episode.status === 'choice_committed', 'choice commit did not become canonical');
  assert(committed.episode.committedChoiceId === choice.id, 'canonical committed choice differs from the submitted choice');

  const nextEnvelope = await authJson(`/v1/story/plots/${encodeURIComponent(story.id)}/episodes`, 'POST', {
    generationKey: `smoke-${runId}-episode-2`,
  });
  const next = requireStory(nextEnvelope?.story, 'next story');
  assert(next.episode.number === story.episode.number + 1, 'next episode number did not advance by one');
  assert(next.episode.status === 'awaiting_choice', 'next episode is not awaiting a choice');

  const resumedEnvelope = await authJson(`/v1/story/plots/${encodeURIComponent(story.id)}`, 'GET');
  const resumed = requireStory(resumedEnvelope?.story, 'resumed story');
  assert(resumed.id === story.id && resumed.episode.id === next.episode.id, 'resume did not return the canonical latest episode');

  if (mode === 'core' && !args.has('--keep-plot')) await archiveSmokePlot(story.id);

  console.log(`PASS core: authenticated create -> choice -> next episode -> resume converged through episode ${next.episode.number}.`);
  return { plotId: story.id, episodeId: next.episode.id, locale };
}

async function archiveSmokePlot(plotId) {
  const archived = await authJson(`/v1/story/plots/${encodeURIComponent(plotId)}/archive`, 'POST');
  assert(archived?.plot?.id === plotId, 'smoke plot archive cleanup failed');
}

async function voiceSmoke(coreContext) {
  const episodeId = coreContext?.episodeId ?? process.env.LIVING_PLOT_SMOKE_EPISODE_ID?.trim() ?? '';
  assert(episodeId, 'voice smoke needs --mode=all/core context or LIVING_PLOT_SMOKE_EPISODE_ID');
  const locale = coreContext?.locale ?? (process.env.LIVING_PLOT_SMOKE_LOCALE?.trim() === 'vi-VN' ? 'vi-VN' : 'en-US');
  const voiceVariant = process.env.LIVING_PLOT_SMOKE_VOICE_VARIANT?.trim() || (locale === 'vi-VN' ? 'vi-narrator-female' : 'en-narrator-female');
  const requested = await authJson(`/v1/episodes/${encodeURIComponent(episodeId)}/audio`, 'POST', {
    voiceVariant,
    reservationKey: `smoke-${runId}-voice`,
  });
  let audio = requireAudio(requested?.audio);
  const deadline = Date.now() + readPositiveInteger('LIVING_PLOT_SMOKE_VOICE_TIMEOUT_MS', 90_000);
  while (audio.status !== 'ready' && audio.status !== 'failed') {
    assert(Date.now() < deadline, `voice smoke timed out while status=${audio.status}`);
    await sleep(2_000);
    const status = await authJson(`/v1/audio/${encodeURIComponent(audio.id)}/status`, 'GET');
    audio = requireAudio(status?.audio);
  }
  assert(audio.status === 'ready', `voice generation reached failed state (${audio.failureCode ?? 'unknown'})`);

  const response = await fetchWithTimeout(`${apiBaseUrl}/v1/audio/${encodeURIComponent(audio.id)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${bearerToken}` },
  }, 15_000);
  assert(response.ok, `private audio fetch failed with HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') ?? '';
  assert(contentType.toLowerCase().includes('audio/'), `private audio fetch returned unexpected content type ${contentType || 'missing'}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert(bytes.byteLength > 0, 'private audio fetch returned an empty body');
  console.log(`PASS voice: Queue/TTS/R2 pipeline reached ready and returned ${bytes.byteLength} private audio bytes.`);
}

async function billingSmoke() {
  const payload = await authJson('/v1/entitlement', 'GET');
  const entitlement = payload?.entitlement;
  assert(entitlement && (entitlement.tier === 'free' || entitlement.tier === 'plus'), 'backend entitlement payload is invalid');
  assert(entitlement.plusActive === true && entitlement.tier === 'plus', 'RevenueCat Test Store convergence is not proven: backend entitlement is not Plus');
  assert(typeof entitlement.syncedAt === 'string' && Number.isFinite(Date.parse(entitlement.syncedAt)), 'Plus entitlement has no valid provider sync timestamp');
  console.log(`PASS billing: backend D1 entitlement is Plus with provider sync at ${entitlement.syncedAt}.`);
}

async function authJson(path, method, body) {
  const headers = { Authorization: `Bearer ${bearerToken}` };
  let requestBody;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    requestBody = JSON.stringify(body);
  }
  const response = await fetchWithTimeout(`${apiBaseUrl}${path}`, { method, headers, body: requestBody }, 45_000);
  const payload = await readJson(response);
  assert(response.ok, `${method} ${path} failed with HTTP ${response.status}${payload?.error ? ` (${payload.error})` : ''}`);
  return payload;
}

function requireStory(value, label) {
  assert(value && typeof value.id === 'string' && value.episode && typeof value.episode.id === 'string', `${label} payload is invalid`);
  assert(Array.isArray(value.episode.choices), `${label} choices are invalid`);
  return value;
}

function requireAudio(value) {
  assert(value && typeof value.id === 'string' && typeof value.status === 'string', 'audio payload is invalid');
  return value;
}

function readMode(values) {
  const raw = [...values].find((value) => value.startsWith('--mode='))?.slice('--mode='.length) ?? 'health';
  assert(['health', 'core', 'voice', 'billing', 'all'].includes(raw), `unknown smoke mode ${raw}`);
  return raw;
}

function readApiBaseUrl() {
  const raw = process.env.LIVING_PLOT_SMOKE_API_URL?.trim() || process.env.EXPO_PUBLIC_LIVING_PLOT_API_URL?.trim() || '';
  assert(raw, 'LIVING_PLOT_SMOKE_API_URL is required');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('LIVING_PLOT_SMOKE_API_URL must be a valid URL');
  }
  assert(url.protocol === 'https:', 'live smoke requires an https API URL');
  return raw.replace(/\/$/u, '');
}

function requireBearerToken() {
  assert(bearerToken.length >= 20, 'LIVING_PLOT_SMOKE_BEARER_TOKEN is required for authenticated smoke modes');
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error(`request timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${response.status} returned non-JSON content`);
  }
}

function readPositiveInteger(name, fallback) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function finish() {
  console.log(`LIVE SMOKE PASS mode=${mode}`);
}
