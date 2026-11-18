declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    HOST_PASSWORD?: string;
    BUCKET?: R2Bucket;
  }
}
