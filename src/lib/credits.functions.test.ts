import { describe, it, expect } from "vitest";
import { z } from "zod";
import { CREDIT_COSTS } from "./credits.functions";

const checkBalanceSchema = z.object({
  operation: z.enum(["processing_job", "marketplace_sync", "ai_generation"]),
});

const deductCreditsSchema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().min(1).max(100),
  ref_id: z.string().uuid().optional(),
});

const addCreditsSchema = z.object({
  merchant_id: z.string().uuid(),
  amount: z.number().int().positive(),
  reason: z.string().min(1).max(100),
  ref_id: z.string().uuid().optional(),
});

const deductForJobSchema = z.object({
  job_id: z.string().uuid(),
});

const deductForSyncSchema = z.object({
  connection_id: z.string().uuid(),
});

describe("CREDIT_COSTS", () => {
  it("has correct costs for all operations", () => {
    expect(CREDIT_COSTS).toEqual({
      processing_job: 1,
      marketplace_sync: 1,
      ai_generation: 2,
    });
  });

  it("all costs are positive integers", () => {
    const values = Object.values(CREDIT_COSTS);
    values.forEach((v) => {
      expect(v).toBeGreaterThan(0);
      expect(Number.isInteger(v)).toBe(true);
    });
  });
});

describe("checkCreditBalance schema", () => {
  it("accepts valid operations", () => {
    expect(checkBalanceSchema.parse({ operation: "processing_job" })).toBeTruthy();
    expect(checkBalanceSchema.parse({ operation: "marketplace_sync" })).toBeTruthy();
    expect(checkBalanceSchema.parse({ operation: "ai_generation" })).toBeTruthy();
  });

  it("rejects invalid operation", () => {
    expect(() => checkBalanceSchema.parse({ operation: "invalid_op" })).toThrow();
  });
});

describe("deductCredits schema", () => {
  it("accepts valid input", () => {
    const result = deductCreditsSchema.parse({
      amount: 5,
      reason: "test deduction",
      ref_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.amount).toBe(5);
  });

  it("accepts input without ref_id", () => {
    const result = deductCreditsSchema.parse({
      amount: 1,
      reason: "simple deduction",
    });
    expect(result.ref_id).toBeUndefined();
  });

  it("rejects zero amount", () => {
    expect(() =>
      deductCreditsSchema.parse({ amount: 0, reason: "zero" })
    ).toThrow();
  });

  it("rejects negative amount", () => {
    expect(() =>
      deductCreditsSchema.parse({ amount: -1, reason: "negative" })
    ).toThrow();
  });

  it("rejects empty reason", () => {
    expect(() =>
      deductCreditsSchema.parse({ amount: 1, reason: "" })
    ).toThrow();
  });

  it("rejects reason exceeding 100 chars", () => {
    expect(() =>
      deductCreditsSchema.parse({ amount: 1, reason: "x".repeat(101) })
    ).toThrow();
  });
});

describe("addCredits schema", () => {
  it("accepts valid input", () => {
    const result = addCreditsSchema.parse({
      merchant_id: "550e8400-e29b-41d4-a716-446655440000",
      amount: 50,
      reason: "top-up",
    });
    expect(result.amount).toBe(50);
  });

  it("rejects non-uuid merchant_id", () => {
    expect(() =>
      addCreditsSchema.parse({
        merchant_id: "not-a-uuid",
        amount: 10,
        reason: "test",
      })
    ).toThrow();
  });
});

describe("deductForProcessingJob schema", () => {
  it("accepts valid job_id", () => {
    const result = deductForJobSchema.parse({
      job_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.job_id).toBeTruthy();
  });

  it("rejects non-uuid job_id", () => {
    expect(() => deductForJobSchema.parse({ job_id: "bad" })).toThrow();
  });
});

describe("deductForMarketplaceSync schema", () => {
  it("accepts valid connection_id", () => {
    const result = deductForSyncSchema.parse({
      connection_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.connection_id).toBeTruthy();
  });
});
