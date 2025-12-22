module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  rules: {
    // TypeScript handles these
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

    // Allow explicit any in rare cases (warn, not error)
    '@typescript-eslint/no-explicit-any': 'warn',

    // Console is fine for game dev
    'no-console': 'off',

    // Prefer const
    'prefer-const': 'error',

    // No var
    'no-var': 'error',

    // Consistent returns
    'consistent-return': 'off',

    // Allow empty functions (common in interfaces/callbacks)
    '@typescript-eslint/no-empty-function': 'off',
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.js', '*.cjs'],
};
