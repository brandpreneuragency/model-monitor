import tsParser from '@typescript-eslint/parser';

export default [{
  files: ['**/*.{ts,tsx}'],
  ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
  languageOptions: { parser: tsParser },
}];
