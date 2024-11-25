import eslint from '@eslint/js';
import tslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';

export default tslint.config(
  eslint.configs.recommended,
  tslint.configs.strictTypeChecked,
  tslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      }
    },
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      // this is being reported from tests
      '@typescript-eslint/no-floating-promises': 'off',

      // again, these only came up in tests and isn't hurting anything
      '@typescript-eslint/no-confusing-void-expression': 'off',

      // if I put a non-null assert, assume I did it for a damn good reason
      '@typescript-eslint/no-non-null-assertion': 'off',

      // these are not useless, they change the type signature of the constructor and are thus important
      '@typescript-eslint/no-useless-constructor': 'off',

      // I prefer Array<thing> over thing[]
      '@typescript-eslint/array-type': ['error', { default: 'generic' }],

      // I'm pretty careful about only using things with toString() inside templates
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-base-to-string': 'off',

      // it's not actually unnecessary if it's requiring an item from an enum
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',

      // sometimes it's there for later use
      '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_'}],

      '@stylistic/eol-last': 'error',
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/block-spacing': ['error', 'always'],
      '@stylistic/semi': 'error',
      '@stylistic/no-extra-semi': 'error',
      '@stylistic/no-tabs': 'error',
      '@stylistic/quotes': ['error', 'single', {avoidEscape: true}],
      '@stylistic/comma-dangle': ['error', {
        'arrays': 'always-multiline',
        'enums': 'always-multiline',
        'imports': 'always-multiline',
        'objects': 'always-multiline',
        'functions': 'always-multiline',
        'generics': 'never',
        'tuples': 'never',
      }],
      '@stylistic/indent': ['error', 2, {
        FunctionDeclaration: { parameters: 'first' },
        FunctionExpression: { parameters: 'first' },
        SwitchCase: 1,
        CallExpression: { arguments: 'first' },
        ignoredNodes: ['PropertyDefinition[decorators]']
      }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'separate-type-imports' }],
    }
  }
)
