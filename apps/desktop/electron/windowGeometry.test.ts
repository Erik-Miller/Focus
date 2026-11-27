import { describe, expect, it } from "vitest";
import {
  computeInteractiveBoundsInWorkArea,
  preservePositionForSizeInWorkArea,
} from "./windowGeometry.js";

const work = { x: 0, y: 0, width: 1000, height: 800 };

describe("window geometry", () => {
  it("preserves centered placement while resizing", () => {
    expect(
      preservePositionForSizeInWorkArea(
        { x: 300, y: 250, width: 400, height: 300 },
        500,
        500,
        work,
        0.25,
      ),
    ).toEqual({ x: 250, y: 150, width: 500, height: 500 });
  });

  it("preserves right/bottom anchoring while resizing", () => {
    expect(
      preservePositionForSizeInWorkArea(
        { x: 700, y: 600, width: 250, height: 150 },
        300,
        200,
        work,
        0.25,
      ),
    ).toEqual({ x: 650, y: 550, width: 300, height: 200 });
  });

  it("computes east/south and west/north drag bounds with minimums and clamping", () => {
    expect(
      computeInteractiveBoundsInWorkArea({
        start: { x: 100, y: 100, width: 400, height: 300 },
        resizeDir: "se",
        dx: 200,
        dy: 100,
        work,
        minWidth: 370,
        minHeight: 71,
      }),
    ).toEqual({ x: 100, y: 100, width: 600, height: 400 });

    expect(
      computeInteractiveBoundsInWorkArea({
        start: { x: 100, y: 100, width: 400, height: 300 },
        resizeDir: "nw",
        dx: 350,
        dy: 260,
        work,
        minWidth: 370,
        minHeight: 71,
      }),
    ).toEqual({ x: 130, y: 329, width: 370, height: 71 });
  });
});
