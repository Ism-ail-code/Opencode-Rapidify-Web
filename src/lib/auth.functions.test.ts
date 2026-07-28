import { describe, it, expect } from "vitest";
import { z } from "zod";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  redirectTo: z.string().url(),
});

function isAlreadyExistsError(message: string): boolean {
  return (
    message.toLowerCase().includes("already exists") ||
    message.toLowerCase().includes("already registered")
  );
}

describe("signup validation schema", () => {
  it("accepts valid input", () => {
    const data = signupSchema.parse({
      email: "test@example.com",
      password: "password123",
      name: "Test User",
      redirectTo: "https://example.com/verify",
    });
    expect(data.email).toBe("test@example.com");
  });

  it("rejects invalid email", () => {
    expect(() =>
      signupSchema.parse({
        email: "not-an-email",
        password: "password123",
        name: "Test",
        redirectTo: "https://example.com/verify",
      })
    ).toThrow();
  });

  it("rejects short password", () => {
    expect(() =>
      signupSchema.parse({
        email: "test@example.com",
        password: "12345",
        name: "Test",
        redirectTo: "https://example.com/verify",
      })
    ).toThrow();
  });

  it("rejects empty name", () => {
    expect(() =>
      signupSchema.parse({
        email: "test@example.com",
        password: "password123",
        name: "",
        redirectTo: "https://example.com/verify",
      })
    ).toThrow();
  });

  it("rejects non-url redirectTo", () => {
    expect(() =>
      signupSchema.parse({
        email: "test@example.com",
        password: "password123",
        name: "Test",
        redirectTo: "not-a-url",
      })
    ).toThrow();
  });
});

describe("signup error classification", () => {
  it("detects 'already exists' error", () => {
    expect(isAlreadyExistsError("User already exists")).toBe(true);
  });

  it("detects 'already registered' error", () => {
    expect(isAlreadyExistsError("Email already registered")).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(isAlreadyExistsError("Network error")).toBe(false);
    expect(isAlreadyExistsError("Rate limit exceeded")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isAlreadyExistsError("USER ALREADY EXISTS")).toBe(true);
    expect(isAlreadyExistsError("Email Already Registered")).toBe(true);
  });
});
