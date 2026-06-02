const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(repoRoot, 'package.json');
const serviceWorkerPath = path.join(repoRoot, 'serviceworker.js');

function bumpVersion(currentVersion, release = 'patch') {
  const [major, minor, patch] = currentVersion.split('.').map(Number);
  if ([major, minor, patch].some(Number.isNaN)) {
    throw new Error(`Invalid version: ${currentVersion}`);
  }

  if (release === 'major') return `${major + 1}.0.0`;
  if (release === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function main() {
  const release = process.argv.includes('--minor') ? 'minor' : process.argv.includes('--major') ? 'major' : 'patch';
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const nextVersion = bumpVersion(packageJson.version || '1.0.0', release);

  packageJson.version = nextVersion;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

  const serviceWorker = fs.readFileSync(serviceWorkerPath, 'utf8');
  const nextServiceWorker = serviceWorker.replace(/const VERSION = 'v\d+\.\d+\.\d+';/, `const VERSION = 'v${nextVersion}';`);
  if (nextServiceWorker === serviceWorker) {
    throw new Error('Unable to update service worker version');
  }

  fs.writeFileSync(serviceWorkerPath, nextServiceWorker, 'utf8');
  console.log(`Bumped to v${nextVersion}`);
}

main();
