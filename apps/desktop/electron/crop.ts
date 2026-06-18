export function cursorCropRect(
  cursor: { x: number; y: number },
  display: { x: number; y: number; width: number; height: number },
  captureSize: number,
): { x: number; y: number; width: number; height: number } {
  const half = Math.floor(captureSize / 2);
  const rx = Math.min(
    Math.max(cursor.x - half, display.x),
    display.x + display.width - captureSize,
  );
  const ry = Math.min(
    Math.max(cursor.y - half, display.y),
    display.y + display.height - captureSize,
  );
  return { x: rx, y: ry, width: captureSize, height: captureSize };
}
