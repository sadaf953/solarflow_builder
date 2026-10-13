// Lints the builder website, the repo scripts and the builder tests.
// template/ keeps its own config: npx eslint -c template/eslint.config.js template
import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

const shared = {
  ...js.configs.recommended.rules,
  'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]', args: 'none' }],
}

export default [
  { ignores: ['template/**', 'legacy/**', '**/dist/**', '**/node_modules/**', 'builder/public/**', 'client-zips/**'] },
  {
    files: ['builder/src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...shared,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['scripts/**/*.{js,mjs}', 'tests/**/*.{js,mjs}', 'builder/*.config.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
    rules: shared,
  },
]
