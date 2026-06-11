import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Minimal Cloudflare config. To persist ISR / the Next.js Data Cache across
// deploys, add an incremental cache override here (e.g. the R2 override) plus
// the matching r2_buckets + WORKER_SELF_REFERENCE bindings in wrangler.jsonc.
// See https://opennext.js.org/cloudflare/caching
export default defineCloudflareConfig();
