import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import eslintConfigPrettier from 'eslint-config-prettier'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import vue from 'eslint-plugin-vue'
import globals from 'globals'
import vueParser from 'vue-eslint-parser'

function sanitizeGlobals(rawGlobals) {
  return Object.fromEntries(
    Object.entries(rawGlobals)
      .filter(([key]) => key === key.trim())
      .map(([key, value]) => [key.trim(), value])
  )
}

const languageGlobals = {
  ...sanitizeGlobals(globals.browser),
  ...sanitizeGlobals(globals.node),
}

const plugins = {
  '@typescript-eslint': tsPlugin,
  'simple-import-sort': simpleImportSort,
}

const rules = {
  ...tsPlugin.configs.recommended.rules,
  'simple-import-sort/exports': 'warn',
  eqeqeq: ['error', 'always'],
  'vue/eqeqeq': ['error', 'always'],
  '@typescript-eslint/no-explicit-any': 'off',
  '@typescript-eslint/no-unused-vars': [
    'warn',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
      ignoreRestSiblings: true,
    },
  ],
  'no-unused-vars': 'off',
  'prefer-const': ['warn', { destructuring: 'all' }],
  'no-var': 'error',
  'vue/multi-word-component-names': 'off',
  'vue/no-reserved-component-names': 'off',
  'vue/no-mutating-props': ['error', { shallowOnly: true }],
  'vue/block-order': ['error', { order: ['template', 'script', 'style'] }],
  'vue/html-self-closing': 'off',
  'vue/max-attributes-per-line': 'off',
  'vue/singleline-html-element-content-newline': 'off',
  'vue/attributes-order': 'off',
  'vue/require-default-prop': 'off',
  'vue/require-explicit-emits': 'off',
  'vue/no-v-html': 'off',
}

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.wrangler/**', 'prd/**', 'pnpm-lock.yaml'],
  },
  ...vue.configs['flat/recommended'],
  eslintConfigPrettier,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: languageGlobals,
    },
    plugins,
    rules,
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: languageGlobals,
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    plugins,
    rules,
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: languageGlobals,
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
    },
    plugins,
    rules,
  },
]
