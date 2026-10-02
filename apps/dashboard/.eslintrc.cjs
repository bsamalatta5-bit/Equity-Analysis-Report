/** @type {import('eslint').Linter.Config} */
module.exports = {
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  plugins: ["react", "react-hooks", "jsx-a11y", "dashboard-rtl"],
  extends: [
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:jsx-a11y/recommended",
  ],
  settings: {
    react: { version: "18.3" },
  },
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  rules: {
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off",
    "dashboard-rtl/no-physical-direction-classes": "error",
  },
  overrides: [
    {
      files: ["**/*.spec.ts", "**/*.spec.tsx", "tests/**/*.ts", "tests/**/*.tsx", "playwright.config.ts"],
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
      },
    },
  ],
};
