import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  AppError,
  withRetry,
  isRetryableError,
  createErrorBoundary,
  consumeLastCapturedError,
} from "./error-capture";

describe("AppError", () => {
  it("creates error with default status 500", () => {
    const e = new AppError("test error");
    expect(e.message).toBe("test error");
    expect(e.statusCode).toBe(500);
    expect(e.name).toBe("AppError");
  });

  it("creates error with custom status and code", () => {
    const e = new AppError("not found", 404, "NOT_FOUND", { resource: "product" });
    expect(e.statusCode).toBe(404);
    expect(e.code).toBe("NOT_FOUND");
    expect(e.details).toEqual({ resource: "product" });
  });
});

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("succeeds on first attempt", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("succeeds after retries", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("network error"))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, { baseDelay: 10, maxDelay: 100 });
    vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("fails after max retries exceeded", async () => {
    const error = new Error("persistent failure");
    const fn = vi.fn().mockRejectedValue(error);

    const promise = withRetry(fn, { maxRetries: 2, baseDelay: 10, maxDelay: 100 });
    vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow("persistent failure");
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("calls onRetry callback", async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, { maxRetries: 2, baseDelay: 10, maxDelay: 100, onRetry });
    vi.runAllTimersAsync();
    await promise;
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
  });
});

describe("isRetryableError", () => {
  it("returns true for timeout errors", () => {
    expect(isRetryableError(new Error("timeout"))).toBe(true);
  });

  it("returns true for rate limit errors", () => {
    expect(isRetryableError(new Error("rate limit exceeded"))).toBe(true);
  });

  it("returns true for network errors", () => {
    expect(isRetryableError(new Error("ECONNREFUSED"))).toBe(true);
    expect(isRetryableError(new Error("ECONNRESET"))).toBe(true);
    expect(isRetryableError(new Error("ETIMEDOUT"))).toBe(true);
  });

  it("returns true for 5xx AppErrors", () => {
    expect(isRetryableError(new AppError("server error", 500))).toBe(true);
    expect(isRetryableError(new AppError("bad gateway", 502))).toBe(true);
  });

  it("returns true for 429 AppErrors", () => {
    expect(isRetryableError(new AppError("too many requests", 429))).toBe(true);
  });

  it("returns false for 4xx AppErrors (non-429)", () => {
    expect(isRetryableError(new AppError("not found", 404))).toBe(false);
    expect(isRetryableError(new AppError("bad request", 400))).toBe(false);
  });

  it("returns false for general errors", () => {
    expect(isRetryableError(new Error("validation failed"))).toBe(false);
  });

  it("returns true for unknown errors", () => {
    expect(isRetryableError("string error")).toBe(true);
    expect(isRetryableError(null)).toBe(true);
    expect(isRetryableError(undefined)).toBe(true);
  });
});

describe("createErrorBoundary", () => {
  it("returns fn result on success", async () => {
    const result = await createErrorBoundary(() => Promise.resolve(42), 0);
    expect(result).toBe(42);
  });

  it("returns fallback on failure", async () => {
    const result = await createErrorBoundary(() => Promise.reject(new Error("fail")), "fallback");
    expect(result).toBe("fallback");
  });

  it("calls onError on failure", async () => {
    const onError = vi.fn();
    await createErrorBoundary(() => Promise.reject(new Error("oops")), null, onError);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(onError.mock.calls[0][0].message).toBe("oops");
  });
});

describe("consumeLastCapturedError", () => {
  it("returns undefined when no error captured", () => {
    expect(consumeLastCapturedError()).toBeUndefined();
  });
});
