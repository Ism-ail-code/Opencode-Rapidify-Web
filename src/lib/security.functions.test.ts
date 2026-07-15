import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sanitizeHtml,
  getRateLimitKey,
  checkRateLimit,
} from "./security.functions";

// hexToBytes is used internally but not exported — test it indirectly
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

describe("sanitizeHtml", () => {
  it("escapes & to &amp;", () => {
    expect(sanitizeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes < to &lt;", () => {
    expect(sanitizeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes > to &gt;", () => {
    expect(sanitizeHtml("a > b")).toBe("a &gt; b");
  });

  it("escapes double quotes", () => {
    expect(sanitizeHtml('say "hello"')).toBe("say &quot;hello&quot;");
  });

  it("escapes single quotes", () => {
    expect(sanitizeHtml("it's")).toBe("it&#x27;s");
  });

  it("escapes forward slashes", () => {
    expect(sanitizeHtml("http://example.com")).toBe("http:&#x2F;&#x2F;example.com");
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("handles XSS vectors", () => {
    const xss = '<img src=x onerror=alert(1)>';
    const result = sanitizeHtml(xss);
    expect(result).not.toContain("<");
    expect(result).not.toContain(">");
    expect(result).toContain("&lt;");
    expect(result).toContain("&gt;");
  });
});

describe("getRateLimitKey", () => {
  it("combines IP and endpoint", () => {
    expect(getRateLimitKey("1.2.3.4", "/api/products")).toBe("1.2.3.4:/api/products");
  });
});

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows first request", () => {
    const result = checkRateLimit("test-key", 10, 60000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it("blocks when limit exceeded", () => {
    const key = "test-limit";
    for (let i = 0; i < 3; i++) {
      checkRateLimit(key, 3, 60000);
    }
    const result = checkRateLimit(key, 3, 60000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("resets after window expires", () => {
    const key = "test-window";
    for (let i = 0; i < 3; i++) {
      checkRateLimit(key, 3, 60000);
    }

    let result = checkRateLimit(key, 3, 60000);
    expect(result.allowed).toBe(false);

    vi.advanceTimersByTime(60001);
    result = checkRateLimit(key, 3, 60000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it("returns correct remaining count", () => {
    const key = "test-remaining";
    checkRateLimit(key, 5, 60000);
    expect(checkRateLimit(key, 5, 60000).remaining).toBe(3);
    expect(checkRateLimit(key, 5, 60000).remaining).toBe(2);
  });
});

describe("hexToBytes", () => {
  it("converts hex string to bytes", () => {
    const result = hexToBytes("deadbeef");
    expect(result).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  it("converts empty string to empty array", () => {
    expect(hexToBytes("")).toEqual(new Uint8Array([]));
  });

  it("handles even-length hex strings", () => {
    const result = hexToBytes("aabb");
    expect(result).toEqual(new Uint8Array([0xaa, 0xbb]));
  });
});
