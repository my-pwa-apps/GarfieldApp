const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

function checkDirectory(directory, recursive) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (recursive) checkDirectory(file, true);
    } else if (/\.(?:js|mjs|cjs)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
      if (result.error) throw result.error;
      if (result.status !== 0) process.exit(result.status || 1);
    }
  }
}

checkDirectory('.', false);
for (const directory of ['worker', 'tools', 'tests']) checkDirectory(directory, true);
console.log('Syntax checks passed for maintained JavaScript and test files.');