export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function preservePositionForSizeInWorkArea(
  bounds: Rectangle,
  width: number,
  height: number,
  work: Rectangle,
  centerZoneFraction: number,
): Rectangle {
  const sourceCenterX = bounds.x + bounds.width / 2;
  const sourceCenterY = bounds.y + bounds.height / 2;
  const workCenterX = work.x + work.width / 2;
  const workCenterY = work.y + work.height / 2;
  const centerZoneWidth = work.width * centerZoneFraction;
  const centerZoneHeight = work.height * centerZoneFraction;
  const preserveCenterX = Math.abs(sourceCenterX - workCenterX) <= centerZoneWidth / 2;
  const preserveCenterY = Math.abs(sourceCenterY - workCenterY) <= centerZoneHeight / 2;
  const preserveRight = !preserveCenterX && sourceCenterX > workCenterX;
  const preserveBottom = !preserveCenterY && sourceCenterY > workCenterY;
  const rawX = preserveCenterX
    ? Math.round(sourceCenterX - width / 2)
    : preserveRight
      ? bounds.x + bounds.width - width
      : bounds.x;
  const rawY = preserveCenterY
    ? Math.round(sourceCenterY - height / 2)
    : preserveBottom
      ? bounds.y + bounds.height - height
      : bounds.y;
  const maxX = work.x + work.width - width;
  const maxY = work.y + work.height - height;
  return {
    x: clamp(rawX, work.x, Math.max(work.x, maxX)),
    y: clamp(rawY, work.y, Math.max(work.y, maxY)),
    width,
    height,
  };
}

export function computeInteractiveBoundsInWorkArea({
  start,
  resizeDir,
  dx,
  dy,
  work,
  minWidth,
  minHeight,
}: {
  start: Rectangle;
  resizeDir: string;
  dx: number;
  dy: number;
  work: Rectangle;
  minWidth: number;
  minHeight: number;
}): Rectangle {
  let x = start.x;
  let y = start.y;
  let width = start.width;
  let height = start.height;

  if (resizeDir.includes("e")) width = start.width + dx;
  if (resizeDir.includes("w")) width = start.width - dx;
  if (resizeDir.includes("s")) height = start.height + dy;
  if (resizeDir.includes("n")) height = start.height - dy;

  width = clamp(Math.round(width), minWidth, work.width);
  height = clamp(Math.round(height), minHeight, work.height);

  if (resizeDir.includes("w")) x = start.x + start.width - width;
  if (resizeDir.includes("n")) y = start.y + start.height - height;

  x = clamp(Math.round(x), work.x, work.x + work.width - width);
  y = clamp(Math.round(y), work.y, work.y + work.height - height);
  return { x, y, width, height };
}
