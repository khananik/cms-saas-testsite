import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * Flat config. eslint-config-next 16 ships native flat configs, so FlatCompat
 * (and the @eslint/eslintrc shim behind it) is not needed here.
 */
const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "out/**", "next-env.d.ts"] },
  ...coreWebVitals,
  ...typescript,
  {
    // CMS-authored images come from a Graph/DAM host that is not known at build time,
    // so next/image cannot be configured for them and a plain <img> is correct here.
    files: ["components/blocks/**/*.tsx"],
    rules: { "@next/next/no-img-element": "off" },
  },
];

export default eslintConfig;
