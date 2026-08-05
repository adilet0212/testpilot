import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These packages all read files off disk at runtime rather than through
  // statically-analyzable requires, so the bundler must leave them alone:
  //   - axe-core / @axe-core/playwright: its raw UMD bundle gets injected
  //     verbatim into the page; bundling rewrites the `typeof module` guards
  //     and breaks it in-browser ("ReferenceError: module is not defined").
  //   - playwright-core: reads browsers.json and its lib/ tree at launch.
  //   - @sparticuz/chromium: unpacks the chromium binary itself.
  serverExternalPackages: [
    "@axe-core/playwright",
    "axe-core",
    "playwright-core",
    "@sparticuz/chromium",
  ],

  // Declaring them external stops the bundler mangling them, but Vercel's file
  // tracer still has to physically ship the files. Force-include the whole
  // package for every route that launches a browser.
  outputFileTracingIncludes: {
    "/api/execute/[runId]": [
      "./node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/**",
    ],
    "/api/scrape": [
      "./node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/**",
    ],
    // The generate pipeline runs as a server action on the dashboard route.
    "/dashboard": [
      "./node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/**",
    ],
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "testpilot",

  project: "testpilot",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  }
});
