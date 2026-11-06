/** @type {import('prettier').Config} */
export default {
  printWidth: 120,
  tabWidth: 2,
  useTabs: false,
  semi: false,
  singleQuote: true,
  quoteProps: 'as-needed',
  bracketSpacing: true,
  trailingComma: 'es5',
  arrowParens: 'always',
  proseWrap: 'preserve',
  htmlWhitespaceSensitivity: 'strict',
  endOfLine: 'lf',
  vueIndentScriptAndStyle: false,
  overrides: [
    {
      files: '**/*.md',
      options: {
        proseWrap: 'preserve',
        embeddedLanguageFormatting: 'off',
      },
    },
  ],
}
