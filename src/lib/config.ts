/** Environment configuration. Secrets stay server-side and are never logged. */
export const env = {
  get baseUrl() {
    return process.env.APP_BASE_URL || "http://localhost:3000";
  },
  get adminPassword() {
    return process.env.ADMIN_PASSWORD || "";
  },
  get sessionSecret() {
    const s = process.env.SESSION_SECRET;
    if (s && s.length >= 32) return s;
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET (>= 32 chars) is required in production");
    return "dev-only-insecure-session-secret-change-me-0123456789";
  },
  get webhookSecret() {
    return process.env.WEBHOOK_SECRET || (process.env.NODE_ENV === "production" ? "" : "dev-webhook-secret");
  },
  get anthropicKey() {
    return process.env.ANTHROPIC_API_KEY || "";
  },
  get llmModel() {
    return process.env.LLM_MODEL || "claude-opus-5-5";
  },
  /** Chat mode: "llm" only when explicitly enabled and a key is present. */
  get chatMode(): "mock" | "llm" {
    if (process.env.CHAT_MODE === "mock") return "mock";
    return this.anthropicKey ? "llm" : "mock";
  },
  /** Master switch. Live purchasing also requires verified supplier support and limits (see live-readiness). */
  get livePurchasingRequested() {
    return process.env.LIVE_PURCHASING_ENABLED === "true";
  },
  get supplier() {
    return process.env.SUPPLIER || "simulator";
  },
  get supplierAllowlist(): string[] {
    return (process.env.SUPPLIER_ALLOWLIST || "simulator").split(",").map((s) => s.trim()).filter(Boolean);
  },
  get paymentProvider() {
    return process.env.PAYMENT_PROVIDER || "simulated";
  },
  get alertEmail() {
    return process.env.ALERT_EMAIL || "owner@example.invalid";
  },
  get uploadDir() {
    return process.env.UPLOAD_DIR || "./.data/uploads";
  },
  get uploadMaxBytes() {
    return Number(process.env.UPLOAD_MAX_BYTES || 5 * 1024 * 1024);
  },
  get inlineWorker() {
    return process.env.INLINE_WORKER !== "false";
  },
  /** Simulator: seconds from purchase until "shipped" and until "delivered". */
  get simShipAfterSeconds() {
    return Number(process.env.SIM_SHIP_AFTER_SECONDS || 60);
  },
  get simDeliverAfterSeconds() {
    return Number(process.env.SIM_DELIVER_AFTER_SECONDS || 180);
  },
};
