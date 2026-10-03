import type { SeasonPalette } from '../types';

/**
 * Tonight's rituals, for her rather than for anybody.
 *
 * They were two fixed cards. "Overnight squalane and ceramide barrier recovery tailored for
 * rich skin tone luminosity" appeared for every woman who ever opened the tab, which is a
 * paragraph of product copy wearing the word "tailored" as a disguise. The app had already
 * measured whether her skin was dry, whether her T-zone was shining, what her curl is and
 * what season she is in, and none of it reached this screen.
 *
 * So the rituals are built from the reading. Three things, in the order that matters
 * tonight, each one naming why it is being suggested to HER. If the scan could not read her
 * skin, that ritual is not invented; she gets the ones that stand on her season and hair,
 * and a line saying what a reading in better light would add.
 *
 * Nothing here is medicine. It is what to do before bed, which is the oldest and least
 * clinical advice there is, and it stays on that side of the line: no condition is ever
 * named and no product is ever prescribed.
 */

export interface Ritual {
  key: string;
  title: string;
  body: string;
  /* Why she is being shown this one. Always concrete, always something she was told. */
  because: string;
}

export interface RitualInput {
  season: SeasonPalette;
  curlFamily?: string;
  skinDryness?: string;
  skinShine?: string;
  skinBlemish?: boolean;
  routine?: string;
}

/* Hair, by curl family. Night is when hair is either protected or ruined, so this one earns
   its place for everybody who has told us a curl. */
const HAIR: Record<string, { title: string; body: string }> = {
  Straight: {
    title: 'Loose, not tight',
    body: 'A soft tie at the very end of the length, or none at all. Silk against your head keeps the oil where it belongs instead of pulling it down the shaft by morning.',
  },
  Wavy: {
    title: 'Plait it damp',
    body: 'One loose plait while there is still a bit of damp in it. You will wake up with the wave already shaped and nothing to fight before you leave.',
  },
  Curly: {
    title: 'Pineapple and silk',
    body: 'Gather it high and loose on top, then silk over the whole thing. Cotton drinks everything you put in tonight and gives you frizz for it.',
  },
  Coily: {
    title: 'Moisture, then cover',
    body: 'Water first, then your butter or oil on top to hold it in, then silk or satin over all of it. Doing it in that order is most of the difference between a good hair day and a wash day.',
  },
};

export function buildRituals(input: RitualInput): { rituals: Ritual[]; note: string | null } {
  const { season, curlFamily, skinDryness, skinShine, skinBlemish, routine } = input;
  const out: Ritual[] = [];

  /* Skin, from what was actually read tonight. */
  if (skinDryness === 'dry') {
    out.push({
      key: 'thirsty',
      title: 'Put it on damp',
      body: 'Do not dry your face off first. Press whatever you use into skin that is still a little wet, and go heavier than you would in the morning. It has all night to sink in and nobody is looking at you.',
      because: 'Your reading came back dry today',
    });
  } else if (skinDryness === 'hydrated') {
    out.push({
      key: 'happy',
      title: 'Change nothing',
      body: `Your skin is behaving. This is the night to do exactly what you did last night${routine ? ` with your ${routine}` : ''} and resist buying anything new.`,
      because: 'Your reading came back hydrated',
    });
  } else if (skinDryness) {
    out.push({
      key: 'steady',
      title: 'Keep it simple',
      body: 'Balanced skin wants consistency more than it wants a new step. Cleanse properly, moisturise while you are still damp, and leave it be.',
      because: 'Your reading came back balanced',
    });
  }

  if (skinShine === 'shiny') {
    out.push({
      key: 'tzone',
      title: 'Lighter down the middle',
      body: 'Same routine, less of it across your forehead and nose. Oil at night there is what you are blotting away by eleven the next morning.',
      because: 'There was shine building through your T-zone',
    });
  }

  if (skinBlemish) {
    out.push({
      key: 'gentle',
      title: 'Be gentle with that one patch',
      body: 'Hands off it tonight. Nothing harsh, nothing new, nothing you have to scrub. If it is still bothering you in a week, that is a question for a pharmacist and not for me.',
      because: 'One area read a little redder than the rest',
    });
  }

  if (curlFamily && HAIR[curlFamily]) {
    out.push({
      key: 'hair',
      title: HAIR[curlFamily].title,
      body: HAIR[curlFamily].body,
      because: `Your hair reads ${curlFamily.toLowerCase()}`,
    });
  }

  /* Her season earns one, and it is the one thing on this screen that is about tomorrow
     rather than tonight: what to put out before bed so the morning is decided. */
  const first = season.swatches[0]?.name;
  const metal = season.bestMetals[0];
  if (first) {
    out.push({
      key: 'tomorrow',
      title: 'Decide it tonight',
      body: `Put out your ${first.toLowerCase()}${metal ? ` and the ${metal.toLowerCase()}` : ''} before you sleep. Choosing colour in morning light with your eyes half open is how you end up in the ${(season.worstColors[0] ?? 'wrong thing').toLowerCase()} again.`,
      because: `You are ${season.name}`,
    });
  }

  const note = skinDryness
    ? null
    : 'I have not been able to read your skin yet. Do a reading by a window and tonight\'s list gets a lot more specific.';

  return { rituals: out.slice(0, 4), note };
}
