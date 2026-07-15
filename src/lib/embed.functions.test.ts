import { describe, it, expect } from "vitest";

// Test the embed script string generation directly
// The server function wraps this logic — we test the core pattern.
function globalEmbedScript(merchantSlug: string, mountSelector = ".product-buy-button") {
  return `<script src="/embed.js"
  data-merchant="${merchantSlug}"
  data-mount="${mountSelector}"
  defer></script>`;
}

function perProductEmbedScript(merchantSlug: string, externalSku: string, mountSelector = ".product-buy-button") {
  return `<script src="/embed.js"
  data-merchant="${merchantSlug}"
  data-external-sku="${externalSku}"
  data-mount="${mountSelector}"
  defer></script>`;
}

describe("global embed script", () => {
  it("includes data-merchant attribute", () => {
    const script = globalEmbedScript("my-shop");
    expect(script).toContain('data-merchant="my-shop"');
  });

  it("does not include data-external-sku", () => {
    const script = globalEmbedScript("my-shop");
    expect(script).not.toContain("data-external-sku");
  });

  it("defaults mount to .product-buy-button", () => {
    const script = globalEmbedScript("my-shop");
    expect(script).toContain('data-mount=".product-buy-button"');
  });

  it("allows custom mount selector", () => {
    const script = globalEmbedScript("my-shop", ".custom-btn");
    expect(script).toContain('data-mount=".custom-btn"');
  });

  it("adds defer attribute", () => {
    const script = globalEmbedScript("my-shop");
    expect(script).toContain("defer");
  });
});

describe("per-product embed script", () => {
  it("includes data-merchant and data-external-sku", () => {
    const script = perProductEmbedScript("my-shop", "SKU-001");
    expect(script).toContain('data-merchant="my-shop"');
    expect(script).toContain('data-external-sku="SKU-001"');
  });
});
