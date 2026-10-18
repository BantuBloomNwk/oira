import { isLowEnd } from './lite';
import type {
  FaceLandmarker as FaceLandmarkerT,
  ImageSegmenter as ImageSegmenterT,
  NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import { FACE_OVAL, bounds, readSkin, toPoly, type SkinReading } from './skin';
import { readLight, type LightReading } from './light';
import { readCondition, type ConditionReading } from './condition';
import { readShape, type ShapeReading } from './shape';
import { hairNote, readHair, type HairReading } from './hair';
import { monkFromIta } from './monk';
import { assess, type CapturePath, type Confidence } from './confidence';

/**
 * The deep scan. Skin, features and hair, read together, on her phone.
 *
 * Everything here is local. The models are served from our own origin (see
 * scripts/fetch-models.sh), the frame is read straight off a <video> element into a
 * canvas that never leaves the page, and nothing is uploaded, posted or logged. That is
 * the same invariant app/oira-face.js held with BlazeFace; this replaces it because
 * BlazeFace gives six keypoints and the mesh she is shown has to be the geometry we
 * actually read, not a drawing of one.
 *
 * Weight, stated plainly: the MediaPipe WASM runtime is ~11.8MB, the landmarker ~3.8MB,
 * the hair segmenter ~0.8MB. That is a real cost on a cheap Android and it is why
 * nothing here loads until she opens the scan, and why what loads is cached afterwards.
 */

const WASM_PATH = '/mediapipe';
const FACE_MODEL = '/models/face_landmarker.task';
const HAIR_MODEL = '/models/hair_segmenter.tflite';
/* How long we wait on a GPU delegate before deciding this phone does not have one. */
const GPU_TIMEOUT_MS = 4000;

export type ScanStatus = 'idle' | 'loading' | 'ready' | 'error';

let landmarker: FaceLandmarkerT | null = null;
let hairSegmenter: ImageSegmenterT | null = null;
let loading: Promise<void> | null = null;
let status: ScanStatus = 'idle';
let lastError = '';

export const scanStatus = () => status;
export const scanError = () => lastError;

/* Which step of loading is running, so a phone that stalls can say where. */
let stage = 'not started';
export const scanStage = () => stage;

/* MediaPipe phones home, and the only thing stopping it is a header.
 *
 * Every time the vision bundle spins up a graph it POSTs to
 * https://odml.pa.googleapis.com/v1/log. Nothing in the tasks-vision API turns that off and
 * nothing in its documentation mentions it; it shows up in the console as a CSP violation,
 * which is how we found it. What it sends is model and session telemetry rather than her
 * face, but that is not the point. The point is that opening the scanner would tell Google
 * that a woman opened the scanner, from an app whose entire promise is that it does not.
 *
 * `connect-src 'self'` in public/_headers already blocks it, and that is the load bearing
 * defence. This is here because a CSP is a policy someone can relax in a hurry six months
 * from now to make an unrelated integration work, and on that day this would come back
 * silently. A refusal written in our own code cannot be relaxed by accident, and it says
 * out loud that the blocking is deliberate rather than a side effect.
 *
 * Installed once, before the bundle is imported, and it touches nothing else: any request
 * that is not to that host goes straight through to the real fetch. */
const TELEMETRY_HOST = 'odml.pa.googleapis.com';
let guarded = false;

function refuseTelemetry() {
  if (guarded || typeof window === 'undefined') return;
  guarded = true;
  const real = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input
      : input instanceof URL ? input.href
      : (input as Request).url;
    if (url && url.includes(TELEMETRY_HOST)) {
      /* Resolved rather than rejected: the caller is a fire-and-forget logger inside a
         vendored bundle, and an unhandled rejection every few seconds is its own kind of
         noise. It gets a 204 and stops asking. */
      return Promise.resolve(new Response(null, { status: 204, statusText: 'No Content' }));
    }
    return real(input as RequestInfo, init);
  };
}

async function load(): Promise<void> {
  if (landmarker) return;
  if (loading) return loading;

  status = 'loading';
  refuseTelemetry();
  loading = (async () => {
    /* Loaded on demand so the 16MB never lands on anyone who does not open the scan. */
    stage = 'engine';
    const vision = await import('@mediapipe/tasks-vision');
    stage = 'runtime files';
    const files = await vision.FilesetResolver.forVisionTasks(WASM_PATH);
    stage = isLowEnd() ? 'face model, processor' : 'face model';

    /* GPU first, CPU if the phone will not give us one. Plenty of cheap Android devices
       have no usable WebGL2, and on those the GPU delegate does not error so much as
       never resolve, which is how the scan ends up sitting on "getting my eyes on"
       forever. Racing it against a timeout and falling back is the difference between
       a slower scan and no scan at all. */
    const withFallback = async <T,>(create: (delegate: 'GPU' | 'CPU') => Promise<T>): Promise<T> => {
      /* On a low end phone, straight to the processor. A GPU attempt there does not always
         fail; on a Galaxy A13 it appears to stall the shared runtime, so the CPU fallback
         queued behind it and never started, and the scanner waited for ever with the camera
         open. A slower first frame beats no frame. */
      if (isLowEnd()) return create('CPU');
      try {
        return await Promise.race([
          create('GPU'),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('gpu delegate timed out')), GPU_TIMEOUT_MS)
          ),
        ]);
      } catch {
        return create('CPU');
      }
    };

    /* Both start at once. They were serial, so the 763KB hair model did not begin downloading
       until the 3.7MB face model had finished and initialised: two waits laid end to end for
       two independent files. */
    const hairReady = withFallback((delegate) =>
      vision.ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: HAIR_MODEL, delegate },
        runningMode: 'VIDEO',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      })
    ).then((seg) => { hairSegmenter = seg; }).catch(() => {
      /* She can be read without it. hair.ts is honest about what a missing mask means, and a
         scan that works without hair beats a scan that refuses to start. */
    });

    landmarker = await withFallback((delegate) =>
      vision.FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        /* Blendshapes come free with the landmarker and tell us whether her eyes are open
           and her mouth is still, which is how we know the frame is worth reading. */
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
      })
    );

    /* The canonical edge lists, straight off the class that owns them. */
    const pack = (cs: Array<{ start: number; end: number }>) =>
      cs.map((c) => [c.start, c.end] as const);
    meshEdges = {
      tesselation: pack(vision.FaceLandmarker.FACE_LANDMARKS_TESSELATION),
      contours: pack(vision.FaceLandmarker.FACE_LANDMARKS_CONTOURS),
    };

    /* Ready means she can be read, not that every model has landed. The hold runs 3.2s and
       hair is a fraction of the face model's size, so it is almost always there before the
       first frame that matters, and when it is not the reading simply has no hair note. */
    status = 'ready';
    stage = 'ready';
    void hairReady;
  })().catch((e) => {
    status = 'error';
    lastError = e instanceof Error ? e.message : String(e);
    loading = null;
    throw e;
  });

  return loading;
}

/* Kicks off the download the moment the scan screen opens, so the wait happens behind
   the camera warming up rather than after it. */
export async function warmUp(): Promise<boolean> {
  try {
    await load();
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------------------------
   Landmark groups. Indices are MediaPipe's canonical 468-point face mesh.
   ------------------------------------------------------------------------------------ */

/* The geometry she watches being drawn.
 *
 * This used to be seventy hand-listed segments: an outline, two brows, two eyes, a nose and
 * a mouth. It was honest, and it looked like a face traced by hand, which is the opposite
 * of the impression the screen needs to give. What is actually happening on that frame is
 * a 468 point mesh being fitted, a hair mask being segmented and four separate readings
 * being taken off them, and the founder is right that the screen was underselling it.
 *
 * So the drawing is the real thing now. MediaPipe ships the canonical tesselation of its
 * own mesh, some 2600 edges, and CONTOURS on top of it. Both are pulled off the landmarker
 * at load time rather than transcribed here, because a hand-copied index list is a list
 * that goes stale the first time the model changes and nobody notices.
 *
 * The tesselation is drawn to a canvas, not to SVG. 2600 <path> elements rebuilt every
 * frame is how you take a mid range Android to its knees; one canvas stroke of one Path2D
 * is not. */
export interface MeshEdges {
  tesselation: ReadonlyArray<readonly [number, number]>;
  contours: ReadonlyArray<readonly [number, number]>;
}

let meshEdges: MeshEdges = { tesselation: [], contours: [] };
export const getMeshEdges = (): MeshEdges => meshEdges;

/* The small hand-listed set, kept as the fallback for the moment between the screen opening
   and the model arriving, so the frame is never bare. */
export const MESH_LINES: ReadonlyArray<readonly [number, number]> = [
  // jaw and cheek line
  [10, 338], [338, 297], [297, 332], [332, 284], [284, 251], [251, 389], [389, 356],
  [356, 454], [454, 323], [323, 361], [361, 288], [288, 397], [397, 365], [365, 379],
  [379, 378], [378, 400], [400, 377], [377, 152],
  [152, 148], [148, 176], [176, 149], [149, 150], [150, 136], [136, 172], [172, 58],
  [58, 132], [132, 93], [93, 234], [234, 127], [127, 162], [162, 21], [21, 54],
  [54, 103], [103, 67], [67, 109], [109, 10],
  // brows
  [70, 63], [63, 105], [105, 66], [66, 107],
  [336, 296], [296, 334], [334, 293], [293, 300],
  // eyes
  [33, 160], [160, 158], [158, 133], [133, 153], [153, 144], [144, 33],
  [362, 385], [385, 387], [387, 263], [263, 373], [373, 380], [380, 362],
  // nose
  [168, 6], [6, 197], [197, 195], [195, 5], [5, 4],
  [4, 45], [4, 275],
  // lips
  [61, 39], [39, 37], [37, 0], [0, 267], [267, 269], [269, 291],
  [291, 405], [405, 314], [314, 17], [17, 84], [84, 181], [181, 61],
];

/* The points worth drawing as points: the ones a reading actually names. */
export const ANCHORS = {
  browLeft: 105,
  browRight: 334,
  eyeLeft: 33,
  eyeRight: 263,
  noseTip: 4,
  lipTop: 0,
  lipBottom: 17,
  chin: 152,
  cheekLeft: 234,
  cheekRight: 454,
  forehead: 10,
} as const;

export interface Finding {
  key: string;
  label: string;
  value: string;
  /* Where on the frame it belongs, normalised 0..1, so a chip can point at the thing it
     is describing rather than floating in a list. */
  at: { x: number; y: number };
}

/* Where the chips actually go.
 *
 * Each finding knows the landmark it describes, which is the right thing for it to know and
 * the wrong thing to position it by: six findings anchored to a face put "Skin", "Skin
 * today" and "Lips" within forty pixels of each other on anybody with a normal head, and
 * they came back from the deploy sitting on top of one another. Two screens were doing
 * their own version of this badly, so the layout lives here and both of them call it.
 *
 * Anchors decide the side; the stack decides the height. Nothing moves horizontally, so a
 * chip still points at the half of the face it belongs to. */
export interface PlacedFinding extends Finding {
  side: 'left' | 'right';
  /* 0..1 down the frame, after collision resolution. */
  top: number;
}

/* A chip is two lines of text in a rounded box, about fifty pixels tall. The portrait it
   sits on is around three hundred and twenty on the reading screen, so this is the share of
   that height one chip needs to itself. Measured, not guessed: undercook it and they touch,
   which is what the first pass did. */
const GAP = 0.17;
const TOP = 0.08;
const BOTTOM = 0.86;

export function placeFindings(findings: Finding[]): PlacedFinding[] {
  const sorted = [...findings].sort((a, b) => a.at.y - b.at.y);
  const lastOn: Record<'left' | 'right', number> = { left: -Infinity, right: -Infinity };

  return sorted.map((f) => {
    /* First choice is the side the feature is on, so the chip sits beside the thing it
       names. Second choice is whichever side is emptier, because six findings on a face
       are not evenly split between its halves and honouring the anchor every time simply
       stacks four of them down one edge. */
    const anchored: 'left' | 'right' = f.at.x > 0.5 ? 'left' : 'right';
    const other: 'left' | 'right' = anchored === 'left' ? 'right' : 'left';
    const wanted = Math.min(BOTTOM, Math.max(TOP, f.at.y));

    let side = anchored;
    if (wanted - lastOn[anchored] < GAP) {
      side = wanted - lastOn[other] >= GAP || lastOn[other] < lastOn[anchored] ? other : anchored;
    }

    const top = Math.min(BOTTOM, Math.max(wanted, lastOn[side] + GAP));
    lastOn[side] = top;
    return { ...f, side, top };
  });
}

export interface ScanFrame {
  landmarks: NormalizedLandmark[] | null;
  /* How much of this reading is her and how much is the room. Set by consolidate() only:
     a single live frame has no frame count to judge itself by, so the per-frame value is
     undefined and the gate reads the consolidated one. See src/lib/confidence.ts. */
  confidence?: Confidence;
  findings: Finding[];
  /* 0..1, how much of the frame the hair mask covers. */
  hairCoverage: number;
  /* Almost no hair where hair should be. Deliberately named "likely": the hair segmenter
     returns hair or not-hair, so a wrap, a close crop and a shaved head all land in the
     same bucket and nothing here can tell them apart. It is a reason to ask her, never a
     reason to tell her what she is wearing. A wig cannot be detected at all: to the model
     it is simply hair, which is the whole point of a wig. */
  hairLikelyCovered: boolean;
  /* Whether the light is worth trusting. The scan holds until it is. */
  light: LightReading | null;
  /* Her skin, read off a real mask and corrected for the light she is standing in.
     See src/lib/skin.ts. */
  skin: SkinReading | null;
  /* Where that lands on the Monk scale, which is the shade she can act on. */
  monk: number | null;
  /* How her skin and lips are doing, as opposed to what colour they are. */
  condition: ConditionReading | null;
  /* The geometry of her face, and the frames note that hangs off it. */
  shape: ShapeReading | null;
  /* The hair silhouette, measured rather than counted. */
  hair: HairReading | null;
  /* For the liveness check. How closed her eyes are, 0 open to 1 shut, from the landmarker's
     own blendshapes. */
  eyesClosed: number | null;
  /* Which way her head is turned, roughly -0.5 to 0.5, zero facing the camera. The sign
     depends on mirroring, so the check only ever uses how far it moves. */
  yaw: number | null;
  /* The face's box in the frame, 0..1, so a face that jumps or swaps can be noticed. */
  box: { cx: number; cy: number; size: number } | null;
  ready: boolean;
}

/* ------------------------------------------------------------------------------------
   Reading a frame.
   ------------------------------------------------------------------------------------ */

/* How often the condition pass is allowed to run. Two and a half times a second is far
   more often than a face changes and far less often than a frame arrives. */
const CONDITION_EVERY_MS = 400;
let lastConditionAt = -Infinity;
let lastCondition: ConditionReading | null = null;

let hairTurn = 0;
let lastHair: HairReading | null = null;

/* The frame the models read, copied onto a plain 2D canvas first.
 *
 * Handing MediaPipe the video element directly worked on desktop and iPhone and drifted on
 * Android. There Chrome crops and rescales the camera ("crop-and-scale"), and the WebGL upload
 * MediaPipe uses for a video can take the camera's whole buffer rather than the cropped picture
 * the page displays, so the face was found in a different image from the one on screen: the
 * mesh landed low and to one side, and the skin was sampled from the wrong place. A 2D drawImage
 * always takes exactly what is displayed, so every model and the mesh now work from that. */
let frameCanvas: HTMLCanvasElement | null = null;
function copyFrame(video: HTMLVideoElement): HTMLCanvasElement | null {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return null;
  if (!frameCanvas) frameCanvas = document.createElement('canvas');
  if (frameCanvas.width !== w || frameCanvas.height !== h) { frameCanvas.width = w; frameCanvas.height = h; }
  const c = frameCanvas.getContext('2d', { willReadFrequently: true });
  if (!c) return null;
  c.drawImage(video, 0, 0, w, h);
  return frameCanvas;
}

export function readFrame(
  video: HTMLVideoElement,
  scratch: HTMLCanvasElement,
  timestampMs: number,
  /* During the blink and turn check, hair is not read: nothing from those frames is kept, and
     on a slow phone the time is better spent catching the next frame. */
  liveCheck = false
): ScanFrame {
  const empty: ScanFrame = {
    landmarks: null, findings: [], hairCoverage: 0, hairLikelyCovered: false,
    light: null, skin: null, monk: null, condition: null, shape: null, hair: null,
    eyesClosed: null, yaw: null, box: null,
    ready: status === 'ready',
  };
  /* Hair is deliberately NOT required here. It used to be, which meant the whole scan waited
     on a second model download before it would draw a single frame. The face landmarker is
     what arms the shutter; hair arrives while she is already being read and is folded in for
     the frames that follow. See load(). */
  if (!landmarker || !video.videoWidth) return empty;

  const source = copyFrame(video);
  if (!source) return empty;
  const faces = landmarker.detectForVideo(source, timestampMs);
  const landmarks = faces.faceLandmarks?.[0] ?? null;
  if (!landmarks) return empty;

  const blend = faces.faceBlendshapes?.[0]?.categories ?? [];
  const score = (name: string) => blend.find((c) => c.categoryName === name)?.score;
  const bl = score('eyeBlinkLeft'), br = score('eyeBlinkRight');
  const eyesClosed = bl != null && br != null ? (bl + br) / 2 : null;
  /* Nose tip against the midpoint of the two cheek edges, over the face's width. */
  const left = landmarks[234], right = landmarks[454], nose = landmarks[1];
  const width = left && right ? Math.abs(right.x - left.x) : 0;
  const yaw = width > 0.02 && nose ? (nose.x - (left.x + right.x) / 2) / width : null;
  const box = width > 0.02 ? { cx: (left.x + right.x) / 2, cy: nose.y, size: width } : null;
  const live = { eyesClosed, yaw, box };

  /* One scratch canvas, reused, sized down. We are sampling colour, not saving a photo. */
  const w = 256;
  const h = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * 256));
  scratch.width = w;
  scratch.height = h;
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { ...empty, ...live, landmarks };
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const at = (i: number) => landmarks[i];
  const skin = readSkin(data, w, h, landmarks);

  /* The face box, needed by the hair reader so volume and lift are expressed against her
     own head rather than against the frame. */
  const oval = toPoly(FACE_OVAL, landmarks, 1, 1);
  const fb = bounds(oval);

  /* Hair, as its own mask, read as a silhouette. See src/lib/hair.ts for what the three
     numbers are and, more importantly, for what they cannot tell us. */
  let hair: HairReading | null = null;
  /* On a low end phone the hair model runs on one reading in four and the last answer
     stands in between. Hair does not change in a quarter of a second, and running both
     models on every frame is most of why the mesh trailed her face on a Galaxy A13. */
  hairTurn = (hairTurn + 1) % (isLowEnd() ? 4 : 1);
  if (liveCheck || (hairTurn !== 0 && lastHair)) {
    hair = lastHair;
  } else {
  /* Null until the second model lands, which is a normal early-frame state rather than an
     error. consolidate() takes the plurality across the hold, so a few hairless opening
     frames cost nothing. */
  const seg = hairSegmenter?.segmentForVideo(source, timestampMs);
  const mask = seg?.categoryMask;
  if (mask) {
    hair = readHair(
      mask.getAsUint8Array(),
      mask.width,
      mask.height,
      { x0: fb.x0, y0: fb.y0, x1: fb.x1, y1: fb.y1 }
    );
    mask.close();
  }
  lastHair = hair;
  }
  const hairCoverage = hair?.coverage ?? 0;

  /* Geometry is a handful of distances and comes free. Condition is not: even with the
     skin mask cached it is a full pass over a face-sized box, and it is answering "how is
     your skin doing today", which does not change thirty times a second. It runs on its own
     clock and the last answer stands in between. */
  const shape = readShape(landmarks, w / h);
  const monk = skin ? monkFromIta(skin.ita) : null;
  if (timestampMs - lastConditionAt > CONDITION_EVERY_MS) {
    lastConditionAt = timestampMs;
    lastCondition = readCondition(data, w, h, landmarks);
  }
  const condition = lastCondition;

  const findings: Finding[] = [];
  if (skin) {
    findings.push({
      key: 'undertone',
      label: 'Skin',
      value: `${skin.band} · ${skin.undertone}`,
      at: { x: at(ANCHORS.cheekLeft).x, y: at(ANCHORS.cheekLeft).y },
    });
  }

  if (shape) {
    findings.push({
      key: 'shape',
      label: 'Face',
      value: shape.shape,
      at: { x: at(ANCHORS.chin).x, y: Math.min(0.94, at(ANCHORS.chin).y + 0.04) },
    });
  }

  /* Condition only speaks when the light let it. A texture reading taken in the dark is
     not a worse reading, it is a different woman's skin, so it says nothing instead. */
  if (condition?.lightOk) {
    findings.push({
      key: 'skin-quality',
      label: 'Skin today',
      value: `${condition.dryness} · ${condition.shine}`,
      at: { x: at(ANCHORS.cheekRight).x, y: at(ANCHORS.cheekRight).y + 0.05 },
    });
  }

  /* Brow shape from the rise of the arch over its own width. */
  const browL = at(70), browPeak = at(105), browR = at(107);
  if (browL && browPeak && browR) {
    const width = Math.abs(browR.x - browL.x) || 1;
    const rise = (browL.y + browR.y) / 2 - browPeak.y;
    const arch = rise / width;
    findings.push({
      key: 'brows',
      label: 'Brows',
      value: arch > 0.20 ? 'high' : arch > 0.09 ? 'soft' : 'straight',
      at: { x: browPeak.x, y: browPeak.y },
    });
  }

  /* Lip fullness from height against mouth width. */
  const lipTop = at(0), lipBottom = at(17), mouthL = at(61), mouthR = at(291);
  if (lipTop && lipBottom && mouthL && mouthR) {
    const mouthW = Math.abs(mouthR.x - mouthL.x) || 1;
    const ratio = Math.abs(lipBottom.y - lipTop.y) / mouthW;
    const fullness = ratio > 0.46 ? 'full' : ratio > 0.32 ? 'balanced' : 'fine';
    findings.push({
      key: 'lips',
      label: 'Lips',
      value: condition?.lightOk && condition.lips !== 'smooth'
        ? `${fullness} · ${condition.lips}`
        : fullness,
      at: { x: lipTop.x, y: lipBottom.y },
    });
  }

  if (hair?.readable) {
    findings.push({
      key: 'hair',
      label: 'Hair',
      value: hairNote(hair),
      at: { x: at(ANCHORS.forehead).x, y: Math.max(0.04, at(ANCHORS.forehead).y - 0.10) },
    });
  }

  return {
    landmarks, findings, hairCoverage,
    hairLikelyCovered: !hair?.readable,
    light: skin ? readLight(skin.white, skin.clipped) : null,
    skin, monk, condition, shape, hair,
    ...live,
    ready: true,
  };
}

/* ---------------------------------------------------------------------------------------
   Consolidating the hold
   --------------------------------------------------------------------------------------- */

/* Why the reading is not simply the last frame.
 *
 * She is asked to hold still for three seconds and then the frame that happened to cross the
 * line becomes her palette forever. That is one sample of a noisy measurement, and the
 * things that ruin a single frame are exactly the things that happen during three seconds of
 * being looked at: a blink, a swallow, a hand moving past a lamp, the autoexposure hunting,
 * one frame of motion blur as she settles. Any of those and she is sealed to it.
 *
 * So the hold is a sample set, not a countdown. Every frame that passes the light gate is
 * kept, and what gets sealed is the middle of them: the median for anything numeric, and the
 * plurality for anything named. Both are chosen over a mean on purpose, because a mean is
 * moved by exactly the outliers this exists to survive, and one blown frame would drag her
 * ITA whether or not it was really her.
 *
 * The landmarks and the still stay from the final frame, because those are positions rather
 * than measurements and averaging a face across three seconds of small movements would give
 * her a blurred mesh over a sharp photograph. */

const mid = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function plurality<T>(xs: T[]): T | undefined {
  if (!xs.length) return undefined;
  const tally = new Map<T, number>();
  for (const x of xs) tally.set(x, (tally.get(x) ?? 0) + 1);
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export function consolidate(
  samples: ScanFrame[],
  final: ScanFrame,
  /* Which camera produced these frames. Defaulted rather than required so a caller that has
     not been updated records the weaker path, which is the safe way for this to be wrong. */
  capture: CapturePath = 'browser'
): ScanFrame {
  const usable = samples.filter((f) => f.skin);
  /* Too few frames to take a median over, so the reading is whatever the last frame said.
     It still gets judged, and it is judged on that frame count, which is exactly the case
     the gate exists for: returning it unassessed would let the weakest reading the scan can
     produce be the one thing that reaches the seal ungated. */
  if (usable.length < 3) {
    return { ...final, confidence: assess({ skin: final.skin, light: final.light, frames: usable.length, capture }) };
  }

  const skins = usable.map((f) => f.skin!);
  /* ITA is recomputed from the median Lab rather than medianed directly. It is an angle
     derived from L* and b*, and the median of a set of angles is not the angle of the
     median: taking it directly lets a reading drift away from the Lab it is supposed to
     describe, and the band would then disagree with the numbers printed beside it. */
  const lab = {
    L: mid(skins.map((s) => s.lab.L)),
    a: mid(skins.map((s) => s.lab.a)),
    b: mid(skins.map((s) => s.lab.b)),
  };
  const ita = (Math.atan2(lab.L - 50, lab.b) * 180) / Math.PI;

  const skin: SkinReading = {
    ...skins[skins.length - 1],
    lab,
    ita,
    band: plurality(skins.map((s) => s.band))!,
    undertone: plurality(skins.map((s) => s.undertone))!,
    samples: Math.round(mid(skins.map((s) => s.samples))),
    /* One uncorrected frame in a set of corrected ones should not let the whole reading
       claim a white point it mostly had. */
    whiteBalanced: skins.every((s) => s.whiteBalanced),
    strongCast: skins.some((s) => s.strongCast),
    clipped: mid(skins.map((s) => s.clipped)),
  };

  const conds = usable.map((f) => f.condition).filter((c): c is NonNullable<typeof c> => !!c && c.lightOk);
  const condition = conds.length
    ? {
        ...conds[conds.length - 1],
        roughness: mid(conds.map((c) => c.roughness)),
        shineDelta: mid(conds.map((c) => c.shineDelta)),
        lipRoughness: mid(conds.map((c) => c.lipRoughness)),
        dryness: plurality(conds.map((c) => c.dryness))!,
        shine: plurality(conds.map((c) => c.shine))!,
        lips: plurality(conds.map((c) => c.lips))!,
        /* A blemish flag is deliberately conservative frame to frame, so it has to show up
           in most of them before it is worth saying out loud. */
        blemish: conds.filter((c) => c.blemish).length > conds.length * 0.6,
      }
    : final.condition;

  const shapes = usable.map((f) => f.shape).filter((v): v is NonNullable<typeof v> => !!v);
  const shape = shapes.length
    ? {
        ...shapes[shapes.length - 1],
        shape: plurality(shapes.map((v) => v.shape))!,
        lengthOverWidth: mid(shapes.map((v) => v.lengthOverWidth)),
        foreheadOverCheek: mid(shapes.map((v) => v.foreheadOverCheek)),
        jawOverCheek: mid(shapes.map((v) => v.jawOverCheek)),
        jawAngle: mid(shapes.map((v) => v.jawAngle)),
      }
    : final.shape;

  const hairs = usable.map((f) => f.hair).filter((v): v is NonNullable<typeof v> => !!v && v.readable);
  const hair = hairs.length
    ? {
        /* The outline comes from the final frame: it is a shape, and a median of shapes is
           not a shape. */
        ...(final.hair ?? hairs[hairs.length - 1]),
        volume: mid(hairs.map((v) => v.volume)),
        halo: mid(hairs.map((v) => v.halo)),
        lift: mid(hairs.map((v) => v.lift)),
        coverage: mid(hairs.map((v) => v.coverage)),
        family: plurality(hairs.map((v) => v.family))!,
        readable: true,
      }
    : final.hair;

  const monk = monkFromIta(ita);

  /* The chips are rebuilt off the consolidated reading rather than carried over from the
     last frame, or she would be shown one set of words and sealed to another. */
  const findings = final.findings.map((f) => {
    if (f.key === 'undertone') return { ...f, value: `${skin.band} · ${skin.undertone}` };
    if (f.key === 'shape' && shape) return { ...f, value: shape.shape };
    if (f.key === 'skin-quality' && condition?.lightOk) {
      return { ...f, value: `${condition.dryness} · ${condition.shine}` };
    }
    if (f.key === 'hair' && hair?.readable) return { ...f, value: hairNote(hair) };
    return f;
  });

  /* Judged on the consolidated reading and the number of frames that survived the hold,
     which is the only place both are known. Nothing downstream re-derives it, so the value
     she is shown and the value the seal gates on are the same value. */
  const confidence = assess({ skin, light: final.light, frames: usable.length, capture });

  return { ...final, findings, skin, monk, condition, shape, hair, confidence };
}

export function releaseScan() {
  lastConditionAt = -Infinity;
  lastCondition = null;
  landmarker?.close();
  hairSegmenter?.close();
  landmarker = null;
  hairSegmenter = null;
  loading = null;
  status = 'idle';
}
