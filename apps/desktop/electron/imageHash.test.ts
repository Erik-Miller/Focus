import { describe, expect, it } from "vitest";
import { dHashImage, hamming, type HashableImage } from "./imageHash.js";

function fakeGradientImage(reverse = false): HashableImage {
  const bitmap = Buffer.alloc(9 * 8 * 4);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 9; col++) {
      const value = reverse ? 255 - col : col;
      const offset = (row * 9 + col) * 4;
      bitmap[offset] = value;
      bitmap[offset + 1] = value;
      bitmap[offset + 2] = value;
      bitmap[offset + 3] = 255;
    }
  }
  return {
    resize: () => ({
      toBitmap: () => bitmap,
    }),
  };
}

describe("image hashing", () => {
  it("computes a 64-bit dHash from resized image bitmap data", () => {
    expect(dHashImage(fakeGradientImage())).toBe("1".repeat(64));
    expect(dHashImage(fakeGradientImage(true))).toBe("0".repeat(64));
  });

  it("computes hamming distance and treats mismatched lengths as unrelated", () => {
    expect(hamming("1010", "0011")).toBe(2);
    expect(hamming("1010", "1010")).toBe(0);
    expect(hamming("1010", "101")).toBe(64);
  });
});
