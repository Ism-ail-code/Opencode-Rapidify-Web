import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ARViewer } from "./ARViewer";

describe("ARViewer", () => {
  it("renders model-viewer when glb URL is provided", () => {
    const { container } = render(<ARViewer glb="https://example.com/model.glb" />);
    const viewer = container.querySelector("model-viewer");
    expect(viewer).toBeInTheDocument();
    expect(viewer).toHaveAttribute("src", "https://example.com/model.glb");
  });

  it("shows fallback message when no glb URL", () => {
    render(<ARViewer glb={null} />);
    expect(screen.getByText("3D model not available")).toBeInTheDocument();
  });

  it("does not render model-viewer when no glb URL", () => {
    const { container } = render(<ARViewer glb={null} />);
    expect(container.querySelector("model-viewer")).not.toBeInTheDocument();
  });

  it("passes usdz as ios-src", () => {
    const { container } = render(
      <ARViewer glb="https://example.com/model.glb" usdz="https://example.com/model.usdz" />
    );
    const viewer = container.querySelector("model-viewer");
    expect(viewer).toHaveAttribute("ios-src", "https://example.com/model.usdz");
  });

  it("sets AR attributes", () => {
    const { container } = render(<ARViewer glb="https://example.com/model.glb" />);
    const viewer = container.querySelector("model-viewer");
    expect(viewer).toHaveAttribute("ar", "");
    expect(viewer).toHaveAttribute("ar-modes", "webxr scene-viewer quick-look");
    expect(viewer).toHaveAttribute("camera-controls", "");
    expect(viewer).toHaveAttribute("auto-rotate", "");
  });

  it("calls onArLaunch when ar-status session-started fires", () => {
    const onArLaunch = vi.fn();
    const { container } = render(
      <ARViewer glb="https://example.com/model.glb" onArLaunch={onArLaunch} />
    );
    const viewer = container.querySelector("model-viewer")!;
    viewer.dispatchEvent(
      new CustomEvent("ar-status", { detail: { status: "session-started" } })
    );
    expect(onArLaunch).toHaveBeenCalledTimes(1);
  });

  it("calls onArSessionEnd when ar-status not-presenting fires", () => {
    const onEnd = vi.fn();
    const { container } = render(
      <ARViewer glb="https://example.com/model.glb" onArSessionEnd={onEnd} />
    );
    const viewer = container.querySelector("model-viewer")!;
    viewer.dispatchEvent(
      new CustomEvent("ar-status", { detail: { status: "not-presenting" } })
    );
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
