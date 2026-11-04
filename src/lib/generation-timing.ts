// The 63.727s live sample fits inside the provider deadline. The worker lease
// leaves validation/save headroom; stale recovery is deliberately later.
export const MODEL_TIMEOUT_MS = 150_000;
export const WORKER_LEASE_MS = 180_000;
export const STALE_JOB_MS = 300_000;
export const HOST_DURATION_SECONDS = 240;
