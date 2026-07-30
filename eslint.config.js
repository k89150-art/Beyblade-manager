import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      ".phase1-test/**"
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: [
      "src/meta/**/*.ts",
      "tests/meta-domain/**/*.ts",
      "tests/meta-evidence/**/*.ts",
      "tests/meta-confidence/**/*.ts"
    ],
    rules: {
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error"
    }
  }
);
