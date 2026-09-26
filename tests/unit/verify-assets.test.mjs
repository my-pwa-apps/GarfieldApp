import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { collectModuleGraph, findOrphanedImages, listImages, RETAINED_UNREFERENCED_IMAGES } = require('../../tools/verify-assets.cjs');

test('the module graph follows nested static imports from module scripts and separates lazy imports', () => {
    const root = mkdtempSync(join(tmpdir(), 'verify-graph-'));
    try {
        writeFileSync(join(root, 'entry.js'), "import { a } from './a.js';\nimport './b.js';\nconst later = () => import('./lazy.js');\n");
        writeFileSync(join(root, 'a.js'), "import { c } from './c.js';\nexport const a = 1;\n");
        writeFileSync(join(root, 'b.js'), "import './a.js';\n");
        writeFileSync(join(root, 'c.js'), "import './entry.js';\nexport const c = 1;\n");
        writeFileSync(join(root, 'lazy.js'), "import './c.js';\n");
        writeFileSync(join(root, 'classic.js'), "import './never.js';\n");
        const html = '<script src="./classic.js" defer></script><script type="module" src="./entry.js"></script>';
        const graph = collectModuleGraph(root, html);
        assert.deepEqual(graph.entries, ['entry.js']);
        assert.deepEqual([...graph.staticModules].sort(), ['a.js', 'b.js', 'c.js', 'entry.js']);
        assert.deepEqual([...graph.dynamicModules], ['lazy.js']);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('an image whose name is only a substring of another reference is reported', () => {
    const { orphaned } = findOrphanedImages({
        images: ['art/logo.png', 'art/big-logo.png', 'icons/16.png', 'icons/167.png'],
        sources: [
            { path: 'index.html', text: '<img src="art/big-logo.png">' },
            { path: 'manifest.webmanifest', text: '{"icons":[{"src":"icons/167.png"}]}' }
        ]
    });
    assert.deepEqual(orphaned, ['art/logo.png', 'icons/16.png']);
});

test('platform image directories are scanned while generated output stays excluded', () => {
    const root = mkdtempSync(join(tmpdir(), 'verify-assets-'));
    try {
        for (const dir of ['android', 'ios', 'node_modules/pkg', 'playwright-report']) mkdirSync(join(root, dir), { recursive: true });
        for (const file of ['android/unused.png', 'ios/unused.png', 'node_modules/pkg/logo.png', 'playwright-report/shot.png', 'root.webp']) {
            writeFileSync(join(root, file), '');
        }
        const images = listImages(root).sort();
        assert.deepEqual(images, ['android/unused.png', 'ios/unused.png', 'root.webp']);
        assert.deepEqual(findOrphanedImages({ images, sources: [{ path: 'index.html', text: 'root.webp' }] }).orphaned, ['android/unused.png', 'ios/unused.png']);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('absolute URLs, query strings, srcset candidates and file-relative paths resolve exactly', () => {
    const { orphaned } = findOrphanedImages({
        images: ['art/social.png', 'art/a.png', 'art/b.webp', 'art/c-420.webp', 'art/c-700.webp', 'art/d.gif'],
        sources: [
            { path: 'index.html', text: '<meta content="https://example.test/art/social.png"><img srcset="art/c-420.webp 420w, art/c-700.webp 700w">' },
            { path: 'app.js', text: "fetch('./art/a.png?v=2'); const first = `${base}/art/d.gif`;" },
            { path: 'css/main.css', text: 'background: url(../art/b.webp);' }
        ]
    });
    assert.deepEqual(orphaned, []);
});

test('retained exceptions suppress orphans and are reported once the file is gone', () => {
    const retained = new Map([['art/keep.png', 'documented reason'], ['art/gone.png', 'documented reason']]);
    assert.deepEqual(findOrphanedImages({ images: ['art/keep.png'], sources: [], retained }), { orphaned: [], staleExceptions: ['art/gone.png'] });
});

test('every retained exception carries a reason', () => {
    for (const [image, reason] of RETAINED_UNREFERENCED_IMAGES) {
        assert.match(image, /\.(png|webp|jpe?g|gif|svg|ico)$/);
        assert.ok(reason.trim().length > 20, `${image} needs a documented reason`);
    }
});
