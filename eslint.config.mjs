import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Sub-projects and runtime scripts have their own toolchains and
    // linting rules — don't block the Next.js web build on them:
    "mobile/**",
    "mobile-expo/**",
    "scripts/**",
    "proxy.ts",
    "ml/**",
  ]),
]);

export default eslintConfig;
