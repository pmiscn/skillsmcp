import util from 'node:util';

export function normalizeError(err: unknown): Error {
  if (err instanceof Error) return err;
  try {
    const wrapped = new Error(`Non-Error thrown: ${util.inspect(err, { depth: 2 })}`);
    // keep original for debugging
    (wrapped as any).original = err;
    return wrapped;
  } catch (e) {
    return new Error('Non-Error thrown (inspect failed)');
  }
}

export function inspectObject(obj: unknown, depth: number | null = null) {
  return util.inspect(obj, { depth });
}
