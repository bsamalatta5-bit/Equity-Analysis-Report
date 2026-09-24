/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "eslint-config-prettier",
  ],
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: [
    "dist/",
    "node_modules/",
    ".next/",
    "coverage/",
    "equitydeck-ai/",
    "prisma/migrations/**/*.sql",
  ],
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
    ],
    "no-console": "error",
  },
  overrides: [
    {
      files: ["**/*.spec.ts", "**/*.test.ts", "tests/**/*.ts"],
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
      },
    },
  ],
};
