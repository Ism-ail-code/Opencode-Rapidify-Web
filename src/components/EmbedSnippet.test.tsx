import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmbedSnippet } from "./EmbedSnippet";

beforeAll(() => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  });
});

describe("EmbedSnippet — global mode", () => {
  it("renders 'Global Embed Script' heading", () => {
    render(<EmbedSnippet merchantSlug="my-shop" />);
    expect(screen.getByText("Global Embed Script")).toBeInTheDocument();
  });

  it("renders script tag with data-merchant", () => {
    render(<EmbedSnippet merchantSlug="my-shop" />);
    const code = screen.getByText(/data-merchant="my-shop"/);
    expect(code).toBeInTheDocument();
  });

  it("does not include data-external-sku", () => {
    render(<EmbedSnippet merchantSlug="my-shop" />);
    expect(screen.queryByText(/data-external-sku/)).not.toBeInTheDocument();
  });

  it("shows copy button", () => {
    render(<EmbedSnippet merchantSlug="my-shop" />);
    expect(screen.getByText("Copy Code")).toBeInTheDocument();
  });

  it("shows 'Copied' after clicking copy", async () => {
    const user = userEvent.setup();
    render(<EmbedSnippet merchantSlug="my-shop" />);
    await user.click(screen.getByText("Copy Code"));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});

describe("EmbedSnippet — per-product mode", () => {
  it("renders product-specific heading", () => {
    render(<EmbedSnippet merchantSlug="my-shop" externalSku="SKU-001" productName="My Product" />);
    expect(screen.getByText(/Embed Widget/)).toBeInTheDocument();
  });

  it("includes data-external-sku", () => {
    render(<EmbedSnippet merchantSlug="my-shop" externalSku="SKU-001" />);
    expect(screen.getByText(/data-external-sku="SKU-001"/)).toBeInTheDocument();
  });

  it("shows product name in heading", () => {
    render(<EmbedSnippet merchantSlug="my-shop" externalSku="SKU-001" productName="Blue Chair" />);
    expect(screen.getByText(/Blue Chair/)).toBeInTheDocument();
  });
});
