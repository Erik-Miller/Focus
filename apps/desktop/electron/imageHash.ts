export interface HashableImage {
  resize: (options: { width: number; height: number; quality: "good" }) => {
    toBitmap: () => Buffer;
  };
}

/** Perceptual difference hash (dHash) of an image, as a 64-bit binary string. */
export function dHashImage(img: HashableImage): string {
  const small = img.resize({ width: 9, height: 8, quality: "good" });
  const bmp = small.toBitmap(); // BGRA
  const w = 9;
  let bits = "";
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const i = (row * w + col) * 4;
      const j = (row * w + col + 1) * 4;
      const left = bmp[i] + bmp[i + 1] + bmp[i + 2];
      const right = bmp[j] + bmp[j + 1] + bmp[j + 2];
      bits += left < right ? "1" : "0";
    }
  }
  return bits;
}

export function hamming(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}
