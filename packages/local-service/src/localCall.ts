export class LocalError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export interface LocalRequest {
  data: Record<string, unknown>;
  auth?: { uid: string };
}
export function localOperation<T>(handler: (request: LocalRequest) => Promise<T>) {
  return Object.assign(handler, { run: handler });
}
