import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workerSource = await readFile(new URL('../../worker/favorites-api/index.js', import.meta.url), 'utf8');
const workerModule = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`);
const worker = workerModule.default;
const { FavoritesLeaderboard } = workerModule;

class MemoryStorage {
  constructor() {
    this.map = new Map();
    this.alarm = null;
  }

  async get(key) {
    return this.map.get(key);
  }

  async put(key, value) {
    this.map.set(key, value);
  }

  async delete(key) {
    this.map.delete(key);
  }

  // Mirrors the Durable Object storage list() contract closely enough for the
  // leaderboard: sorted keys, prefix/startAfter/limit, returns a Map.
  async list({ prefix = '', startAfter, limit = Infinity } = {}) {
    const keys = [...this.map.keys()]
      .filter(key => key.startsWith(prefix))
      .filter(key => (startAfter === undefined ? true : key > startAfter))
      .sort()
      .slice(0, limit);

    return new Map(keys.map(key => [key, this.map.get(key)]));
  }

  async getAlarm() {
    return this.alarm;
  }

  async setAlarm(time) {
    this.alarm = time;
  }

  async deleteAlarm() {
    this.alarm = null;
  }
}

function createObject(storage = new MemoryStorage()) {
  const api = new FavoritesLeaderboard({ storage }, {});
  api.verifyGoogleIdentity = async token => {
    if (token === 'valid-google-token') return { sub: 'google-user-1', email: 'reader@example.com' };
    if (token === 'second-google-token') return { sub: 'google-user-2', email: 'second@example.com' };
    return null;
  };
  return api;
}

function request(path, options = {}) {
  return new Request(`https://favorites-api.garfieldapp.workers.dev${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer valid-google-token',
      ...(options.headers || {})
    }
  });
}

test('favorite add/remove updates counts and preserves duplicate idempotence', async () => {
  const api = createObject();

  let response = await api.fetch(request('/favorite', { method: 'POST', body: JSON.stringify({ date: '1978/06/19', action: 'add' }) }));
  assert.equal(response.status, 200);
  const added = await response.json();
  assert.equal(added.ok, true);
  assert.equal(added.count, 1);
  assert.match(added.updatedAt, /^\d{4}-\d{2}-\d{2}T/);

  response = await api.fetch(request('/favorite', { method: 'POST', body: JSON.stringify({ date: '1978/06/19', action: 'add' }) }));
  const unchanged = await response.json();
  assert.equal(unchanged.ok, true);
  assert.equal(unchanged.count, 1);
  assert.equal(unchanged.unchanged, true);
  assert.equal(unchanged.updatedAt, added.updatedAt);

  response = await api.fetch(request('/favorite', { method: 'POST', body: JSON.stringify({ date: '1978/06/19', action: 'remove' }) }));
  const removed = await response.json();
  assert.equal(removed.ok, true);
  assert.equal(removed.count, 0);
  assert.match(removed.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('leaderboard writes require a verified Google token', async () => {
  const api = createObject();

  let response = await api.fetch(request('/favorite', {
    method: 'POST',
    headers: { Authorization: '' },
    body: JSON.stringify({ date: '1978/06/19', action: 'add' })
  }));
  assert.equal(response.status, 401);

  response = await api.fetch(request('/migrate', {
    method: 'POST',
    headers: { Authorization: 'Bearer invalid-token' },
    body: JSON.stringify({ dates: ['1978/06/19'] })
  }));
  assert.equal(response.status, 401);
});

test('top favorites are sorted by count then date and limited to positive counts', async () => {
  const api = createObject();
  for (const date of ['1978/06/20', '1978/06/19', '1978/06/21']) {
    await api.fetch(request('/favorite', { method: 'POST', body: JSON.stringify({ date, action: 'add' }) }));
  }
  await api.fetch(request('/favorite', {
    method: 'POST',
    headers: { Authorization: 'Bearer second-google-token' },
    body: JSON.stringify({ date: '1978/06/19', action: 'add' })
  }));

  const response = await api.fetch(request('/top', { method: 'GET' }));
  assert.equal(response.status, 200);
  const top = await response.json();
  assert.deepEqual(top.map(({ date, count }) => ({ date, count })), [
    { date: '1978/06/19', count: 2 },
    { date: '1978/06/20', count: 1 },
    { date: '1978/06/21', count: 1 }
  ]);
  top.forEach(entry => assert.match(entry.updatedAt, /^\d{4}-\d{2}-\d{2}T/));
});

test('migrate validates input, deduplicates dates, and reports unchanged migrations', async () => {
  const api = createObject();

  let response = await api.fetch(request('/migrate', { method: 'POST', body: JSON.stringify({ dates: ['bad'] }) }));
  assert.equal(response.status, 400);

  response = await api.fetch(request('/migrate', { method: 'POST', body: JSON.stringify({ dates: ['1978/06/19', '1978/06/19', '1978/06/20'] }) }));
  const migrated = await response.json();
  assert.equal(migrated.ok, true);
  assert.equal(migrated.migrated, 2);
  assert.match(migrated.updatedAt, /^\d{4}-\d{2}-\d{2}T/);

  response = await api.fetch(request('/migrate', { method: 'POST', body: JSON.stringify({ dates: ['1978/06/19'] }) }));
  assert.deepEqual(await response.json(), { ok: true, migrated: 0, unchanged: true });
});

test('worker wrapper applies CORS for local and production origins', async () => {
  const object = createObject();
  const env = {
    LEADERBOARD: {
      idFromName: () => 'global',
      get: () => ({ fetch: req => object.fetch(req) })
    }
  };

  let response = await worker.fetch(new Request('https://favorites-api.garfieldapp.workers.dev/top', {
    headers: { Origin: 'http://127.0.0.1:8000' }
  }), env);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'http://127.0.0.1:8000');

  response = await worker.fetch(new Request('https://favorites-api.garfieldapp.workers.dev/top', {
    headers: { Origin: 'https://garfieldapp.pages.dev' }
  }), env);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://garfieldapp.pages.dev');
});

test('worker wrapper accepts additional deployment origins from environment configuration', async () => {
  const object = createObject();
  const env = {
    ALLOWED_ORIGINS: 'https://example.github.io, https://comics.example.com',
    LEADERBOARD: {
      idFromName: () => 'global',
      get: () => ({ fetch: req => object.fetch(req) })
    }
  };

  const response = await worker.fetch(new Request('https://favorites-api.garfieldapp.workers.dev/top', {
    headers: { Origin: 'https://example.github.io' }
  }), env);

  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://example.github.io');
});

test('invalid token, date, action, and JSON return client errors', async () => {
  const api = createObject();

  let response = await api.fetch(request('/favorite', { method: 'POST', headers: { Authorization: 'Bearer bad' }, body: '{}' }));
  assert.equal(response.status, 401);

  response = await api.fetch(request('/favorite', { method: 'POST', body: JSON.stringify({ date: '1978-06-19', action: 'add' }) }));
  assert.equal(response.status, 400);

  response = await api.fetch(request('/favorite', { method: 'POST', body: JSON.stringify({ date: '1978/06/19', action: 'toggle' }) }));
  assert.equal(response.status, 400);

  response = await api.fetch(request('/favorite', { method: 'POST', body: '{nope' }));
  assert.equal(response.status, 400);
});

test('rate limiting blocks excessive writes from the same identity', async () => {
  const api = createObject();

  let lastResponse;
  for (let index = 0; index < 31; index += 1) {
    lastResponse = await api.fetch(request('/favorite', {
      method: 'POST',
      body: JSON.stringify({ date: `1978/07/${String(index + 1).padStart(2, '0')}`, action: 'add' })
    }));
  }

  assert.equal(lastResponse.status, 429);
});

test('impossible, pre-launch and future dates are rejected by /favorite', async () => {
  const api = createObject();
  const tomorrow = new Date(Date.now() + 3 * 86_400_000);
  const futureDate = `${tomorrow.getUTCFullYear()}/${String(tomorrow.getUTCMonth() + 1).padStart(2, '0')}/${String(tomorrow.getUTCDate()).padStart(2, '0')}`;

  const rejected = [
    '9999/99/99',   // impossible components
    '2023/02/31',   // overflowing calendar day
    '2023/13/01',   // month out of range
    '1978/06/18',   // day before the first published strip
    '1977/01/01',   // long before the strip existed
    futureDate      // beyond the latest publishable comic
  ];

  for (const date of rejected) {
    const response = await api.fetch(request('/favorite', { method: 'POST', body: JSON.stringify({ date, action: 'add' }) }));
    assert.equal(response.status, 400, `${date} should be rejected`);
  }
});

test('valid boundary and leap-day comic dates are accepted', async () => {
  const api = createObject();

  for (const date of ['1978/06/19', '2024/02/29', '2000/02/29']) {
    const response = await api.fetch(request('/favorite', { method: 'POST', body: JSON.stringify({ date, action: 'add' }) }));
    assert.equal(response.status, 200, `${date} should be accepted`);
  }
});

test('migration filters out invalid dates and rejects an all-invalid batch', async () => {
  const api = createObject();

  let response = await api.fetch(request('/migrate', {
    method: 'POST',
    body: JSON.stringify({ dates: ['9999/99/99', '1900/01/01', '2023/02/30'] })
  }));
  assert.equal(response.status, 400);

  response = await api.fetch(request('/migrate', {
    method: 'POST',
    body: JSON.stringify({ dates: ['1978/06/19', '9999/99/99', '1979/01/01'] })
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).migrated, 2);
});

test('oversized request bodies are rejected before JSON parsing', async () => {
  const api = createObject();

  const response = await api.fetch(request('/favorite', {
    method: 'POST',
    body: JSON.stringify({ date: '1978/06/19', action: 'add', padding: 'x'.repeat(70 * 1024) })
  }));

  assert.equal(response.status, 413);
});

test('CORS responses declare Vary: Origin so shared caches key on the requesting origin', async () => {
  const object = createObject();
  const env = {
    LEADERBOARD: {
      idFromName: () => 'global',
      get: () => ({ fetch: req => object.fetch(req) })
    }
  };

  const preflight = await worker.fetch(new Request('https://favorites-api.garfieldapp.workers.dev/favorite', {
    method: 'OPTIONS',
    headers: { Origin: 'https://garfieldapp.pages.dev' }
  }), env);
  assert.match(preflight.headers.get('Vary') || '', /Origin/);

  const top = await worker.fetch(new Request('https://favorites-api.garfieldapp.workers.dev/top', {
    headers: { Origin: 'http://localhost:8000' }
  }), env);
  assert.match(top.headers.get('Vary') || '', /Origin/);
});
test('counts are stored one key per date so no single value grows unbounded', async () => {
  const storage = new MemoryStorage();
  const api = createObject(storage);

  await api.fetch(request('/favorite', { method: 'POST', body: JSON.stringify({ date: '1978/06/19', action: 'add' }) }));
  await api.fetch(request('/favorite', { method: 'POST', body: JSON.stringify({ date: '1978/06/20', action: 'add' }) }));

  const countKeys = [...storage.map.keys()].filter(key => key.startsWith('count:'));
  assert.deepEqual(countKeys.sort(), ['count:google-v1:1978/06/19', 'count:google-v1:1978/06/20']);
  assert.equal(storage.map.has('counts:google-v1'), false, 'the legacy aggregate object must not be written');
  assert.equal(storage.map.has('updated-at:google-v1'), false);
});

test('a legacy aggregate counts object is migrated into per-date shards on first write', async () => {
  const storage = new MemoryStorage();
  storage.map.set('counts:google-v1', { '1990/01/01': 4, '1991/01/01': 2, '1992/01/01': 0 });
  storage.map.set('updated-at:google-v1', { '1990/01/01': '2020-01-01T00:00:00.000Z' });

  const api = createObject(storage);
  await api.fetch(request('/favorite', { method: 'POST', body: JSON.stringify({ date: '1993/01/01', action: 'add' }) }));

  assert.equal(storage.map.has('counts:google-v1'), false);
  assert.equal(storage.map.has('updated-at:google-v1'), false);
  assert.deepEqual(await storage.get('count:google-v1:1990/01/01'), { count: 4, updatedAt: '2020-01-01T00:00:00.000Z' });
  assert.deepEqual(await storage.get('count:google-v1:1991/01/01'), { count: 2, updatedAt: null });
  assert.equal(await storage.get('count:google-v1:1992/01/01'), undefined, 'zero counts are not carried over');

  const top = await (await api.fetch(new Request('https://favorites-api.garfieldapp.workers.dev/top'))).json();
  assert.deepEqual(top.map(entry => entry.date), ['1990/01/01', '1991/01/01', '1993/01/01']);
});

test('removing a favorite promotes the next date into a full top window', async () => {
  const storage = new MemoryStorage();
  const api = createObject(storage);

  // 51 real calendar dates: 49 clear leaders, plus two tied at 4. The tie is
  // broken by date, so the earlier tied date fills the last window slot and the
  // later one sits just outside it.
  const dateAt = index => {
    const d = new Date(Date.UTC(1990, 0, 1 + index));
    return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
  };
  const insideTie = dateAt(49);
  const outsideTie = dateAt(50);

  const window = [];
  for (let i = 0; i < 49; i++) {
    const date = dateAt(i);
    const count = 100 - i;
    await storage.put(`count:google-v1:${date}`, { count, updatedAt: '2020-01-01T00:00:00.000Z' });
    window.push({ date, count, updatedAt: '2020-01-01T00:00:00.000Z' });
  }
  for (const date of [insideTie, outsideTie]) {
    await storage.put(`count:google-v1:${date}`, { count: 4, updatedAt: '2020-01-01T00:00:00.000Z' });
  }
  window.push({ date: insideTie, count: 4, updatedAt: '2020-01-01T00:00:00.000Z' });
  await storage.put('top:google-v1', window);
  // The signed-in user owns the lowest-ranked date inside the window.
  await storage.put('user:google-v1:google:google-user-1', [insideTie]);

  const response = await api.fetch(request('/favorite', { method: 'POST', body: JSON.stringify({ date: insideTie, action: 'remove' }) }));
  assert.equal(response.status, 200);

  const top = await (await api.fetch(new Request('https://favorites-api.garfieldapp.workers.dev/top'))).json();
  assert.equal(top.length, 50);
  assert.ok(top.some(entry => entry.date === outsideTie), 'the 51st date must be promoted into the window');
  assert.equal(top.some(entry => entry.date === insideTie), false, 'the demoted date must leave the window');
});

test('expired rate-limit records are swept instead of accumulating forever', async () => {
  const storage = new MemoryStorage();
  const api = createObject(storage);

  await api.fetch(request('/favorite', { method: 'POST', body: JSON.stringify({ date: '1978/06/19', action: 'add' }) }));

  assert.ok(storage.alarm, 'a sweep alarm must be scheduled after a rate-limited write');
  await storage.put('rate:google:stale-user', { count: 30, resetAt: Date.now() - 1 });

  storage.alarm = null;
  await api.alarm();

  assert.equal(storage.map.has('rate:google:stale-user'), false, 'expired records are deleted');
  assert.equal(storage.map.has('rate:google:google-user-1'), true, 'live records are kept');
  assert.ok(storage.alarm, 'the sweep reschedules while live records remain');
});

test('the worker validates tokens against the configured Google client id', async () => {
  const api = new FavoritesLeaderboard({ storage: new MemoryStorage() }, { GOOGLE_CLIENT_ID: 'configured-client-id' });
  const originalFetch = global.fetch;
  global.fetch = async url => {
    if (String(url).includes('tokeninfo')) {
      return new Response(JSON.stringify({ aud: 'configured-client-id', expires_in: '3600' }), { status: 200 });
    }
    return new Response(JSON.stringify({ sub: 'user-9', email: 'user9@example.com' }), { status: 200 });
  };

  try {
    assert.deepEqual(await api.verifyGoogleIdentity('token-a'), { sub: 'user-9', email: 'user9@example.com' });

    const mismatched = new FavoritesLeaderboard({ storage: new MemoryStorage() }, { GOOGLE_CLIENT_ID: 'other-client-id' });
    assert.equal(await mismatched.verifyGoogleIdentity('token-b'), null);
  } finally {
    global.fetch = originalFetch;
  }
});
