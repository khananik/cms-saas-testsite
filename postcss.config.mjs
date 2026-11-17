/**
 * PostCSS runs Tailwind over app/cms-tailwind.css, which generates utilities for
 * CMS-authored markup (see that file). @tailwindcss/postcss only transforms
 * stylesheets that use Tailwind directives; every other stylesheet, including all
 * CSS Modules, passes through unchanged.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
