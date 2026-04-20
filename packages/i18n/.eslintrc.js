/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: [require.resolve('@ai-mv/config-eslint')],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
};
