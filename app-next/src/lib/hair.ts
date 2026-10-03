/**
 * Reading her hair, not just noticing that it is there.
 *
 * The first pass counted hair pixels and called it coverage, which told us "full", "some"
 * or "close" and nothing else. A number that cannot tell a sleek bun from a wash-and-go is
 * not a hair reading, and on this product that omission has a direction: the hair the
 * coverage number is worst at describing is coily hair, which is the hair the app exists
 * for. So the mask gets read properly.
 *
 * Three things come out of the silhouette, and each one is a real measurement:
 *
 *   volume   how far the hair stands out past the head, as a multiple of face width. A
 *            wash-and-go on type 4 hair is routinely twice a face wide; a slick back is
 *            barely wider than the skull.
 *   halo     how rough the outer boundary is, as perimeter against the square root of
 *            area. A straight blowout has a smooth silhouette. Coils have a boundary that
 *            is fractal at the scale a phone camera can see, and this is the number that
 *            separates volume-from-curl from volume-from-a-lot-of-straight-hair.
 *   lift     how far the hair rises above the crown, again against face width, which is
 *            what separates height from width.
 *
 * What this CANNOT do, said plainly because the app's whole posture depends on not
 * overclaiming: it cannot tell a wig from her own hair, it cannot see a curl pattern under
 * a wrap, and it cannot read hair it has been given no pixels of. The shipping app at
 * app/index.html sidesteps all of this by having her set her own curl family on a slider,
 * which is the right answer and stays the right answer. This proposes a family from what it
 * can actually see and hands her the slider, rather than the other way round.
 */

export type CurlFamily = 1 | 2 | 3 | 4;

export const CURL_FAMILY_NAME: Record<CurlFamily, string> = {
  1: 'straight',
  2: 'wavy',
  3: 'curly',
  4: 'coily',
};

/* Andre Walker, the same twelve the shipping app offers, so a woman who has already set
   hers there does not find a different vocabulary here. */
export const CURL_CODES = [
  '1A', '1B', '1C', '2A', '2B', '2C', '3A', '3B', '3C', '4A', '4B', '4C',
] as const;

export interface HairReading {
  /* Share of the whole frame that is hair. Kept because the light and headwear checks
     still want it. */
  coverage: number;
  volume: number;
  halo: number;
  lift: number;
  family: CurlFamily;
  /* False when there is too little hair in frame to say anything: a wrap, a very close
     crop, a shaved head, or hair out of shot. The three look identical to a segmenter. */
  readable: boolean;
  /* The outer silhouette, normalised 0..1, as two polylines running crown to nape down
     each side. Drawn over the frame so what she watches being traced is the thing that was
     actually measured. */
  outline: Array<{ x: number; y: number }>;
}

export interface FaceBox {
  /* All normalised 0..1 against the frame. */
  x0: number; y0: number; x1: number; y1: number;
}

/* One pass over the category mask. `stride` keeps this cheap on a mid range phone: the
   silhouette does not get better for sampling every pixel of a 256 wide mask. */
export function readHair(
  mask: Uint8Array,
  mw: number,
  mh: number,
  face: FaceBox
): HairReading {
  const HAIR = 1;
  const faceW = Math.max(1e-6, face.x1 - face.x0);

  const rows: Array<{ y: number; l: number; r: number }> = [];
  let count = 0;
  let minY = mh, maxY = 0, minX = mw, maxX = 0;
  let perimeter = 0;

  const stride = mh > 220 ? 2 : 1;
  for (let y = 0; y < mh; y += stride) {
    let l = -1, r = -1, runs = 0, prev = 0;
    for (let x = 0; x < mw; x++) {
      const v = mask[y * mw + x] === HAIR ? 1 : 0;
      if (v) {
        if (l < 0) l = x;
        r = x;
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
      /* Every transition in and out of hair along this row is a piece of boundary. Summing
         them approximates the perimeter well enough to rank smooth against fractal, and it
         is one comparison per pixel rather than a contour trace. */
      if (v !== prev) { perimeter++; runs++; }
      prev = v;
    }
    if (l >= 0) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      rows.push({ y, l, r });
      /* A row broken into several runs is a row where the silhouette is doing something,
         which is exactly what a coil boundary looks like from the side. */
      perimeter += Math.max(0, runs - 2) * 2;
    }
  }

  const coverage = mw * mh ? count / (mw * mh) : 0;
  const readable = rows.length > 6 && coverage > 0.02;

  if (!readable) {
    return { coverage, volume: 0, halo: 0, lift: 0, family: 1, readable: false, outline: [] };
  }

  /* Volume: the widest the hair gets, against how wide her face is. */
  const hairW = (maxX - minX) / mw;
  const volume = hairW / faceW;

  /* Lift: how far the top of the hair sits above the top of the face oval, in face widths,
     so a tall style and a wide one are told apart. */
  const lift = Math.max(0, face.y0 - minY / mh) / faceW;

  /* Halo: perimeter against the square root of area. Scale free, so a woman standing closer
     to the camera does not read as curlier. A circle is about 3.5; anything ragged climbs. */
  const halo = count > 0 ? perimeter / Math.sqrt(count) : 0;

  /* The proposal. Volume carries it, halo breaks the tie between a lot of straight hair and
     a moderate amount of coily hair, and lift nudges upward because height on top is a
     texture signal in its own right. */
  const score = volume * 1.35 + halo * 0.16 + lift * 1.1;
  const family: CurlFamily = score > 3.5 ? 4 : score > 2.85 ? 3 : score > 2.35 ? 2 : 1;

  /* The silhouette, thinned to something drawable, down the left side and back up the
     right so it renders as one continuous trace. */
  const step = Math.max(1, Math.floor(rows.length / 48));
  const left: Array<{ x: number; y: number }> = [];
  const right: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < rows.length; i += step) {
    const row = rows[i];
    left.push({ x: row.l / mw, y: row.y / mh });
    right.push({ x: row.r / mw, y: row.y / mh });
  }
  const outline = [...left, ...right.reverse()];

  return { coverage, volume, halo, lift, family, readable: true, outline };
}

/* One line, in her words, that says what was seen rather than what was assumed. */
export function hairNote(h: HairReading): string {
  if (!h.readable) return 'tucked away, so I left it alone';
  const body = h.volume > 1.7 ? 'big' : h.volume > 1.25 ? 'full' : h.lift > 0.28 ? 'lifted' : 'close';
  return `${body} and reading ${CURL_FAMILY_NAME[h.family]}`;
}
