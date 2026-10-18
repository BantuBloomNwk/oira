# Oira: app design system v0.1

The product UI, not the whitepaper. Goal: **soft, ladylike, luminous, deep-tone-centered.** It should feel like a warm, private sanctuary, not a tech app and nothing like a typical dark/metallic/technical crypto product. Grounded in 2026 beauty design: warm neutrals + soft blush + luminous finish; elegant high-contrast serif for a feminine, prestige feel.

## Principles
1. **Soft over sharp**: rounded forms, diffuse warm shadows, generous air, gentle motion.
2. **Deep tones centered**: imagery, swatches, and defaults lead with rich/deep complexions; never a "lightening" gesture.
3. **Private = safe = tender**: the copy and feel reassure. Warmth is the trust signal.
4. **Quiet luxury**: restraint, whitespace, one accent at a time. Champagne/gold used sparingly.
5. **Her, not the tech**: the word "blockchain" never appears; the Palette and her colour are the heroes.

## Colour tokens
| Token | Hex | Use |
|---|---|---|
| Ivory | `#FBF5EE` | paper / primary background |
| Blush | `#EBB9AE` | soft primary accent, tints, highlights |
| Rosewood | `#C0736A` | CTAs, active states, key accent |
| Cocoa | `#4E2E23` | headings on light, the deep anchor |
| Espresso | `#3A2A24` | body text (never pure black) |
| Taupe | `#B7A392` | hairlines, muted text, borders |
| Sand | `#E9DCC9` | soft fills, cards, chips |
| Champagne | `#C9A96A` | delicate luxe accent (sparingly) |
| Mauve | `#9B7787` | secondary accent |

**Skin spectrum (deep-first)**: the signature strip, lead with deep: `#4A2E1E · #6E4429 · #9A6A45 · #C99A73 · #E6C9AD · #F2DFCB`. Always render deep→light (deep tones first), the inverse of the industry default.

## Typography
- **Display / headings:** **Fraunces**: a soft, high-contrast optical serif. Warm, feminine, editorial. Weights 300–600; use its italic for tender accent words ("your *season*"). This is the voice of the brand.
- **Body / UI:** **Hanken Grotesk**: a soft humanist sans. Calm, warm, highly readable. Weights 400–600.
- **Eyebrows / labels:** Hanken Grotesk, uppercase, ~0.18em tracking, small, in Taupe or Rosewood.
- Rhythm: large, airy line-height (1.5–1.6 body); big serif headings with tight leading.

## Form
- **Radii:** cards 24px, inputs 16px, buttons pill (999px), swatches 14px.
- **Shadows:** soft + warm, low opacity, `0 20px 44px rgba(78,46,35,0.10)`. No hard/techy shadows.
- **Buttons:** pill; primary = Rosewood on Ivory (or Cocoa), soft; secondary = Sand fill / Taupe hairline.
- **Motion:** gentle. 400–600ms, ease-out; soft fades and small rises; a slow "bloom" on reveals. Nothing snappy or mechanical.
- **Icons:** fine-line, rounded caps, delicate weight.
- **Imagery:** luminous, soft-focus, deep tones centered.

## The signature artifact: the Palette card
Her reading rendered as a beautiful, shareable card: a soft gradient of *her* tones, her season name in Fraunces, a tender one-line description, a fine champagne frame. Designed to be posted (declaring a season is already a thing women share), she shares the label she's proud of; the data stays sealed.

## Copy voice
Human, tender, reassuring, short. No jargon, no em-dashes or needless hyphens, no AI tells. Example: *"Your reading is sealed. Only you hold the key."* / *"Every shade of you. Seen by no one but you."*

## Platforms (roadmap)
- **Blitz + near-term primary:** Solana Mobile **Seeker** + **Android** (Seed Vault, secp256r1 passkey, native camera).
- **Long-term (planned):** **iOS / iPhone**: a large share of the target users (women) favour iPhone, so an iOS version is on the lineup, not an afterthought. Design tokens + components here are platform-agnostic (works for React Native + web) so the same system carries to iOS. Web prototype first (for the Blitz demo + fastest iteration), then native Seeker/Android, then iOS.

## Status
v0.1 tokens defined + grounded in references. Next: a rendered style tile (this pass), then the reading-flow screens (camera → undertone → confirm card → sealed Palette), built on these tokens.
