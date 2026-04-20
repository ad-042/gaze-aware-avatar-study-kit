/**
 * Split an array-like into chunks of a given size.
 *
 * Ported from pixiv/ChatVRM.
 * Original: src/lib/VRMAnimation/utils/arrayChunk.ts
 */
export function arrayChunk<T>(array: ArrayLike<T>, every: number): T[][] {
  const N = array.length;
  const ret: T[][] = [];

  let current: T[] = [];
  let remaining = 0;

  for (let i = 0; i < N; i++) {
    const el = array[i];

    if (remaining <= 0) {
      remaining = every;
      current = [];
      ret.push(current);
    }

    current.push(el);
    remaining--;
  }

  return ret;
}
