// Power of 10 rule 10: the strictest typescript-eslint sets, type-aware. A rule may be turned off
// only when it is style only, with the reason written beside it. There is no list of tolerated breaks.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'engine/**', 'web/vid.wasm', 'evals/out/**'] },
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {},
  },
);
