// Shared ESLint flat config base. Apps/packages extend by importing this.
export default [
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/artifacts/**", "**/cache/**"]
  },
  {
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error"] }]
    }
  }
];
