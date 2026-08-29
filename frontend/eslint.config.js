import js from '@eslint/js'
import react from 'eslint-plugin-react'
import hooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

/**
 * Deliberately narrow.
 *
 * `vite build` does not resolve identifiers, so a component that references a
 * hook it never imported builds cleanly and then throws on render. That class
 * of bug is what this config exists to catch; style is left alone so the rules
 * stay worth listening to.
 */
export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': hooks },
    rules: {
      ...js.configs.recommended.rules,
      // JSX counts as a use; without these, every imported component is "unused".
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'off',
      'no-undef': 'error',
      'no-unused-vars': ['warn', {
        varsIgnorePattern: '^_', argsIgnorePattern: '^_', ignoreRestSiblings: true,
      }],
      'react-hooks/rules-of-hooks': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
]
