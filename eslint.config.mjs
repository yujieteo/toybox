// Power of 10 rule 10: the strictest typescript-eslint sets, type-aware. A rule may be turned off
// only when it is style only, with the reason written beside it. There is no list of tolerated breaks.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['eslint.config.mjs', 'node_modules/**', 'dist/**', 'engine/**', 'web/vid.wasm', 'evals/out/**'] },
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      // A number in a template is lossless text: style only.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Changing || to ?? changes the result for '' and 0, and behaviour must not change, so
      // string, number and boolean operands stay with ||. Nullable objects still must use ??.
      '@typescript-eslint/prefer-nullish-coalescing': ['error', { ignorePrimitives: { string: true, number: true, boolean: true, bigint: true } }],
    },
  },
  {
    // node:test registers each test itself and runs it after the file loads: the returned promise needs no await.
    files: ['test/**/*.ts'],
    rules: { '@typescript-eslint/no-floating-promises': 'off' },
  },
);
