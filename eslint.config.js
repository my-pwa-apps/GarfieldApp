import globals from 'globals';

export default [
    { ignores: ['node_modules/**', '.wrangler/**', 'playwright-report*/**', 'test-results/**'] },
    {
        files: ['**/*.{js,mjs,cjs}'],
        languageOptions: { globals: { ...globals.browser, ...globals.node, ...globals.serviceworker } },
        rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }] }
    },
    {
        files: ['googleDriveSync.js'],
        languageOptions: { globals: { google: 'readonly' } }
    }
];