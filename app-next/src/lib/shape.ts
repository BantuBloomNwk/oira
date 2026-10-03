import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

/**
 * The shape of her face, from the mesh rather than from a quiz.
 *
 * Every "what is your face shape" tool on the internet asks her to hold a ruler to a
 * mirror. The 468 point mesh already has the four measurements the classification actually
 * turns on, so it can simply be measured: how long the face is against how wide, which of
 * the three widths is the widest, and whether the jaw turns a corner or curves.
 *
 * What this is NOT: a verdict. Face shape is a convention, the boundaries between the six
 * names are soft, and a head tilted ten degrees moves the numbers. It is offered the same
 * way every other finding is, as something she can tap and correct.
 *
 * It carries a frames note because that is the one thing face shape is genuinely useful
 * for and the reason she would want to know it at all. Eyewear is the expansion this makes
 * room for; the note is the honest version of it until there are real frames to match.
 */

export type FaceShape = 'oval' | 'round' | 'square' | 'oblong' | 'heart' | 'diamond' | 'pear';

export interface ShapeReading {
  shape: FaceShape;
  /* The measurements it was decided on, kept so a calibration pass has something to check. */
  lengthOverWidth: number;
  foreheadOverCheek: number;
  jawOverCheek: number;
  /* Degrees at the jaw corner. Small is angular, large is curved. */
  jawAngle: number;
}

/* Landmark pairs the widths are taken across. Temples for the forehead, the zygomatic arch
   for the cheekbones, the gonial angle for the jaw. */
const TEMPLE_L = 54, TEMPLE_R = 284;
const CHEEK_L = 234, CHEEK_R = 454;
const JAW_L = 172, JAW_R = 397;
const CROWN = 10, CHIN = 152;
/* The two neighbours of the left gonial point along the oval, for the corner angle. */
const JAW_ABOVE = 132, JAW_BELOW = 150;

const dist = (a: NormalizedLandmark, b: NormalizedLandmark, aspect: number) =>
  Math.hypot((a.x - b.x) * aspect, a.y - b.y);

export function readShape(pts: NormalizedLandmark[], aspect = 1): ShapeReading | null {
  if (pts.length < 468) return null;
  const at = (i: number) => pts[i];

  /* Landmarks are normalised to the frame, so x and y are on different scales unless the
     frame is square. Everything below is a ratio of two distances, and without the aspect
     correction a portrait frame stretches every face into an oblong. */
  const cheek = dist(at(CHEEK_L), at(CHEEK_R), aspect);
  if (!cheek) return null;
  const forehead = dist(at(TEMPLE_L), at(TEMPLE_R), aspect);
  const jaw = dist(at(JAW_L), at(JAW_R), aspect);
  const length = dist(at(CROWN), at(CHIN), aspect);

  const lengthOverWidth = length / cheek;
  const foreheadOverCheek = forehead / cheek;
  const jawOverCheek = jaw / cheek;

  /* The corner. Two vectors out of the gonial point, one up the cheek and one down to the
     chin; the angle between them says whether the jaw turns or curves. */
  const g = at(JAW_L), up = at(JAW_ABOVE), down = at(JAW_BELOW);
  const v1 = { x: (up.x - g.x) * aspect, y: up.y - g.y };
  const v2 = { x: (down.x - g.x) * aspect, y: down.y - g.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1;
  const jawAngle = (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI;

  const angular = jawAngle < 128;
  const widest: 'forehead' | 'cheek' | 'jaw' =
    forehead > cheek && forehead > jaw ? 'forehead' : jaw > cheek ? 'jaw' : 'cheek';

  let shape: FaceShape;
  if (widest === 'jaw' && jawOverCheek > 1.02) {
    shape = 'pear';
  } else if (widest === 'forehead' && jawOverCheek < 0.86) {
    shape = 'heart';
  } else if (foreheadOverCheek < 0.88 && jawOverCheek < 0.88) {
    shape = 'diamond';
  } else if (lengthOverWidth > 1.55) {
    shape = 'oblong';
  } else if (lengthOverWidth < 1.28) {
    shape = angular ? 'square' : 'round';
  } else {
    shape = angular ? 'square' : 'oval';
  }

  return { shape, lengthOverWidth, foreheadOverCheek, jawOverCheek, jawAngle };
}

/* Her words for it, and the one place face shape earns its keep. */
export const SHAPE_WORD: Record<FaceShape, string> = {
  oval: 'an oval face',
  round: 'a round face',
  square: 'a square jaw',
  oblong: 'a long face',
  heart: 'a heart-shaped face',
  diamond: 'a diamond face',
  pear: 'a strong lower jaw',
};

/* Frames. The rule every optician uses is contrast: soften an angular face, structure a
   soft one, and never repeat the shape you are sitting on. */
export const SHAPE_FRAMES: Record<FaceShape, string> = {
  oval: 'Almost any frame sits well on you. Keep the width near your cheekbones and you cannot go wrong.',
  round: 'Rectangular and angular frames. They give you the edges your face does not have, and they lengthen.',
  square: 'Round or oval frames, thin rims. Softening the corner is the whole job here.',
  oblong: 'Deep frames with a low bridge, wider than they are tall. They shorten the run from brow to chin.',
  heart: 'Bottom-heavy or rimless frames. Weight low balances a wide brow and a fine chin.',
  diamond: 'Cat eye and oval frames, with a strong browline. They give your temples something to sit on.',
  pear: 'Wide top rims and detail at the brow. Weight up top is what evens out a strong jaw.',
};
