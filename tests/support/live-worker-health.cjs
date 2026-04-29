const checks = [
  {
    name: 'CORS proxy GoComics fetch',
    url: 'https://corsproxy.garfieldapp.workers.dev/?https%3A%2F%2Fwww.gocomics.com%2Fgarfield%2F2026%2F04%2F29',
    validate: async response => {
      const body = await response.text();
      return response.ok && body.includes('featureassets.gocomics.com');
    }
  },
  {
    name: 'Favorites API top list',
    url: 'https://favorites-api.garfieldapp.workers.dev/top',
    validate: async response => {
      const data = await response.json();
      return response.ok && Array.isArray(data);
    }
  }
];

const headers = {
  'User-Agent': 'GarfieldApp predeploy health check (+https://garfieldapp.pages.dev)'
};

async function runCheck(check) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(check.url, { headers, signal: controller.signal });
    const ok = await check.validate(response);
    if (!ok) {
      throw new Error(`${check.name} failed with HTTP ${response.status}`);
    }
    console.log(`${check.name}: OK`);
  } finally {
    clearTimeout(timeout);
  }
}

Promise.all(checks.map(runCheck)).catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
