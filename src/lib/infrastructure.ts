type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatLog(level: LogLevel, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` ${JSON.stringify(context)}` : "";
  return `[${timestamp}] [${level.toUpperCase()}] [Rapidify] ${message}${contextStr}`;
}

export const logger = {
  debug(message: string, context?: LogContext) {
    if (shouldLog("debug")) console.debug(formatLog("debug", message, context));
  },
  info(message: string, context?: LogContext) {
    if (shouldLog("info")) console.info(formatLog("info", message, context));
  },
  warn(message: string, context?: LogContext) {
    if (shouldLog("warn")) console.warn(formatLog("warn", message, context));
  },
  error(message: string, context?: LogContext) {
    if (shouldLog("error")) console.error(formatLog("error", message, context));
  },
};

export const config = {
  get appName(): string {
    return "Rapidify";
  },
  get version(): string {
    return process.env.APP_VERSION || "1.0.0";
  },
  get environment(): string {
    return process.env.NODE_ENV || "development";
  },
  get isProduction(): boolean {
    return this.environment === "production";
  },
  get isDevelopment(): boolean {
    return this.environment === "development";
  },
  get supabaseUrl(): string | undefined {
    return process.env.SUPABASE_URL;
  },
  get supabaseAnonKey(): string | undefined {
    return process.env.SUPABASE_ANON_KEY;
  },
  get allowedOrigins(): string[] {
    const origins = process.env.ALLOWED_ORIGINS || "";
    return origins.split(",").filter(Boolean).map(o => o.trim());
  },
  get rateLimits() {
    return {
      public: { max: parseInt(process.env.RATE_LIMIT_PUBLIC || "30", 10), window: 60000 },
      authenticated: { max: parseInt(process.env.RATE_LIMIT_AUTH || "200", 10), window: 60000 },
    };
  },
  get storage() {
    return {
      maxImageSize: parseInt(process.env.MAX_IMAGE_SIZE || "10485760", 10),
      maxModelSize: parseInt(process.env.MAX_MODEL_SIZE || "104857600", 10),
      uploadExpiry: parseInt(process.env.UPLOAD_URL_EXPIRY || "3600", 10),
    };
  },
  get cdn() {
    return {
      baseUrl: process.env.CDN_BASE_URL || process.env.SUPABASE_URL || "",
    };
  },
};

export function checkEnvironment(): string[] {
  const warnings: string[] = [];

  if (!process.env.SUPABASE_URL) warnings.push("SUPABASE_URL not set");
  if (!process.env.SUPABASE_ANON_KEY) warnings.push("SUPABASE_ANON_KEY not set");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) warnings.push("SUPABASE_SERVICE_ROLE_KEY not set");

  if (config.isProduction) {
    if (!config.allowedOrigins.length) warnings.push("ALLOWED_ORIGINS not configured");
    if (!process.env.SESSION_SECRET) warnings.push("SESSION_SECRET not set");
  }

  return warnings;
}

export function getObservabilityHeaders(): Record<string, string> {
  return {
    "x-rapidify-version": config.version,
    "x-rapidify-environment": config.environment,
  };
}