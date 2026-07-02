import js from '@eslint/js';

const browserGlobals = {
    window: 'readonly',
    document: 'readonly',
    location: 'readonly',
    console: 'readonly',
    performance: 'readonly',
    WebSocket: 'readonly',
    requestAnimationFrame: 'readonly',
    setTimeout: 'readonly',
    setInterval: 'readonly',
    clearTimeout: 'readonly',
    clearInterval: 'readonly',
    ronin: 'readonly' // injected by the Ronin Wallet widget script
};

const nodeGlobals = {
    require: 'readonly',
    module: 'readonly',
    process: 'readonly',
    __dirname: 'readonly',
    console: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    fetch: 'readonly',
    Buffer: 'readonly'
};

export default [
    js.configs.recommended,
    {
        files: ['public/js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: browserGlobals
        },
        rules: {
            'no-unused-vars': ['error', { args: 'none' }]
        }
    },
    {
        files: ['server/**/*.js', 'tests/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: nodeGlobals
        },
        rules: {
            'no-unused-vars': ['error', { args: 'none' }],
            'no-empty': ['error', { allowEmptyCatch: true }]
        }
    }
];
