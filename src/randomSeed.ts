/**
 *
 * @param str
 * @returns a function that generates a pseudo-random number based on the input string `str`.
 * The returned function, when called, will produce a deterministic sequence of pseudo-random numbers derived from the initial seed created from the input string.
 *  */
function xmur3(str: string) {
  let h = 1779033703 ^ str.length;

  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }

  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);

    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRandom(seed: string) {
  const seedFunction = xmur3(seed);

  return mulberry32(seedFunction());
}
