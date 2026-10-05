import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const eslintConfig = tseslint.config(
  { ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
);

export default eslintConfig;
