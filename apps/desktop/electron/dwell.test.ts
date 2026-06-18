import { describe, expect, it } from "vitest";
import { DwellDetector } from "./dwell.js";

describe("DwellDetector", () => {
  it("fires once when the cursor stays inside the radius for the dwell window", () => {
    const detector = new DwellDetector(300, 6);

    expect(detector.tick(10, 10, 0)).toBe(false);
    expect(detector.tick(13, 13, 299)).toBe(false);
    expect(detector.tick(14, 13, 300)).toBe(true);
    expect(detector.tick(14, 13, 500)).toBe(false);
  });

  it("re-arms only after the cursor moves outside the radius", () => {
    const detector = new DwellDetector(300, 6);

    expect(detector.tick(0, 0, 0)).toBe(false);
    expect(detector.tick(0, 0, 300)).toBe(true);
    expect(detector.tick(5, 0, 700)).toBe(false);
    expect(detector.tick(7, 0, 701)).toBe(false);
    expect(detector.tick(7, 0, 1001)).toBe(true);
  });
});
