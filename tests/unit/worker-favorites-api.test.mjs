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
}

function createObject() {
  const api = new FavoritesLeaderboard({ storage: new MemoryStorage() }, {});
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