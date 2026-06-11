/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  // `postgres` (postgres-js) ships workerd-specific code; keep it external so
  // Next doesn't bundle it and the Cloudflare entrypoint is used at runtime.
  serverExternalPackages: ["postgres"],
  // The agent kernel ships as TypeScript source (workspace package); let Next
  // transpile it instead of expecting a prebuilt dist.
  transpilePackages: ["@worldcupsim/sim-agent"],
};

export default config;

// Make Cloudflare bindings (env vars, etc.) available during `next dev`.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
void initOpenNextCloudflareForDev();
