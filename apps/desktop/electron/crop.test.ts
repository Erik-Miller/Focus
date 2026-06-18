import { describe, expect, it } from "vitest";
import { cursorCropRect } from "./crop.js";

describe("cursorCropRect", () => {
  const display = { x: 100, y: 200, width: 1000, height: 800 };

  it("centers the crop around the cursor when there is room", () => {
    expect(cursorCropRect({ x: 500, y: 600 }, display, 250)).toEqual({
      x: 375,
      y: 475,
      width: 250,
      height: 250,
    });
  });

  it("clamps the crop to the display edges", () => {
    expect(cursorCropRect({ x: 110, y: 205 }, display, 250)).toMatchObject({ x: 100, y: 200 });
    expect(cursorCropRect({ x: 1200, y: 1200 }, display, 250)).toMatchObject({
      x: 850,
      y: 750,
    });
  });
});
