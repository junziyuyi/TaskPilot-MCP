/**
 * 提交门禁里的样式检查。
 * 属性顺序只警告，不阻断提交。Tailwind v4 指令视为合法 at-rule。
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS Stylelint 配置
const propertyGroupsMod = require('stylelint-config-recess-order/groups')
const propertyGroups = propertyGroupsMod.default || propertyGroupsMod

const tailwindAtRules = [
  'theme',
  'tailwind',
  'apply',
  'source',
  'utility',
  'variant',
  'custom-variant',
  'plugin',
  'reference',
  'config',
]

const baseRules = {
  'at-rule-no-unknown': [true, { ignoreAtRules: tailwindAtRules }],
  'import-notation': null,
  'order/properties-order': [propertyGroups, { severity: 'warning' }],
}

module.exports = {
  root: true,
  extends: ['stylelint-config-standard', 'stylelint-config-recess-order'],
  plugins: ['stylelint-order'],
  rules: baseRules,
  overrides: [
    {
      files: ['*.vue', '**/*.vue', '*.html', '**/*.html'],
      customSyntax: 'postcss-html',
      plugins: ['stylelint-order'],
      extends: ['stylelint-config-recommended', 'stylelint-config-html', 'stylelint-config-recess-order'],
      rules: {
        ...baseRules,
        'no-duplicate-selectors': null,
      },
    },
  ],
  ignoreFiles: ['**/dist/**', '**/node_modules/**', '**/.wrangler/**', 'prd/**'],
}
