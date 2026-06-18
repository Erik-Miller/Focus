import { describe, expect, it } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";
import { cleanRunId } from "./chatWithAgent.js";

describe("chatWithAgent helpers", () => {
  it("accepts safe run ids and trims whitespace", () => {
    expect(cleanRunId(" run_12345678 ")).toBe("run_12345678");
    expect(cleanRunId("A".repeat(128))).toBe("A".repeat(128));
  });

  it("rejects short, oversized, or unsafe run ids", () => {
    expect(() => cleanRunId("short")).toThrow(HttpsError);
    expect(() => cleanRunId("A".repeat(129))).toThrow(HttpsError);
    expect(() => cleanRunId("../bad-run-id")).toThrow(HttpsError);
  });
});
