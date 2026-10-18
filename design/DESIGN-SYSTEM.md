# Oira / Hue whitepaper: design system (preserve exactly)

Captured from `Hue_Whitepaper_v0.1.pdf`. There is no editable source; if we regenerate the whitepaper (e.g. rename to Oira, edits), reproduce this look faithfully.

## Palette (exact hexes, from the paper's own swatch strip)
| Token | Hex | Use |
|---|---|---|
| INK | `#2A1C4E` | darkest background, cover base, headline text on light |
| PLUM | `#3A2358` | section labels (caps), table header row, rules |
| AURORA | `#6C4BD8` | primary accent / glow, section numbers highlight |
| TEAL | `#1E5F5B` | secondary accent, cover gradient bottom-left |
| GOLD | `#C89B4B` | eyebrows (AURORA K), section numbers, key lines |
| COPPER | `#B4633A` | warm accent, deep-skin swatch range |
| CREAM | `#F5EFE4` | body page background, display type on dark |

## Typography (match by character; confirm exact fonts on rebuild)
- **Display / headings / eyebrows:** heavy geometric sans, tight tracking on the big word ("HUE"), wide letter-spacing + uppercase on eyebrows and section labels (e.g. `T H E   P R O B L E M`). Candidates: Sora / Poppins / Montserrat (bold + extrabold).
- **Body + intros + pull-quotes:** classic transitional serif with true italics; the lead paragraph of each section is italic serif, muted. Candidates: Lora / Newsreader / Source Serif.
- **Numbers/labels:** letter-spaced small caps in PLUM/GOLD.

## Layout
- **Cover:** INK→PLUM background, soft AURORA glow top-right + warm GOLD/COPPER glow lower-right; small GOLD "AURORA K" eyebrow top-left; giant CREAM display word; italic-serif subtitle in muted cream; a horizontal row of ~7 rounded-square skin-tone swatches (cream → deep brown); confidential-draft footer in muted cream.
- **Body pages:** CREAM background; large GOLD section number; PLUM letter-spaced caps label; bold sans headline in INK; short ~120px PLUM/AURORA underline rule; italic-serif lead paragraph (muted INK); serif body; callouts in rounded-border cards with a subtle tint; tables with a PLUM header row and hairline row dividers; footer `HUE · Whitepaper v0.1` + page number in muted tone.
- Generous margins, lots of air, one idea per section.

## Rebuild note
The paper reads as HTML/CSS → print (the swatch chips, gradients, and rounded callouts are CSS-native). Easiest faithful rebuild: a single HTML/CSS template (print stylesheet, A4) → PDF via headless Chrome. Keep the tokens above as CSS variables.
