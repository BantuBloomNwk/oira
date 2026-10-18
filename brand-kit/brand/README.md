# Oira Brand Kit v1.0

Everything Oira wears, in one folder. Drop this entire `brand/` folder into the project repo root.

These are the final marks. Use the files exactly as they are: never redraw a mark, and never swap in other colours or fonts. Wire the SVGs into the app (splash, headers, seal moments) following the rules below.

## The system in one line

One mark, two states. **The Silk Edge** is the still form: the O with the iridescent light caught in the stroke. **The Passing Light** is the moving form: the same light travelling the ring. Still surfaces get the still mark; moving surfaces get the motion.

## Files

### /svg (source of truth; scale infinitely)
- `oira-mark-silk-edge-light.svg`: primary mark, daylight surfaces. Plum stroke, iridescence at the thin point.
- `oira-mark-silk-edge-dark.svg`: primary mark, dark surfaces. Moonmilk ring with the comet arc: the frozen frame of the passing light, feathered tails, no floating dot.
- `oira-mark-passing-light-animated.svg`: the motion mark. SMIL-animated, 11s revolution; animates even inside an `<img>` tag. Use for splash, the seal moment, web hero after dark, video bugs.
- `oira-mark-mono-plum.svg` / `oira-mark-mono-moonmilk.svg`: small-size marks. Below 48px the rainbow always drops; use these for favicons, status bars, notification icons.
- `oira-wordmark-light.svg` / `oira-wordmark-dark.svg`: "Oira." in Fraunces italic with the font embedded (self-contained; renders identically everywhere).

### /png (platform-ready exports)
- `avatar-{light,dark}-{1024,400}.png`: social profile pictures; square uploads, platforms crop to circle. Mark centred at 62%.
- `app-icon-{light,dark}-1024.png`: app store / launcher art (platforms apply their own corner radius).
- `favicon-plum-{512,192,48,32,16}.png`, `favicon-moonmilk-512.png`: transparent, mono.
- `wordmark-{light,dark}-2000w.png`: transparent, trimmed.
- `x-banner-1500x500.png`: X header. Bottom-left kept clear for the avatar overlap.
- `linkedin-banner-1584x396.png`: LinkedIn header, daylight version. Bottom-left kept clear.
- `youtube-banner-2048x1152.png`: YouTube channel art; all meaning inside the 1546x423 centre safe area.
- `ig-voice-card-1080.png`, `ig-palette-card-1080.png`: Instagram post templates (1080x1080).
- `ig-story-after-dark-1080x1920.png`: story template for while-you-slept numbers.

## Tokens
Plum ink `#43203B` · Blush `#FBF3EE` · Rose mauve `#C9799B` (deep `#A85578`) · Seal gold `#D6A756` · Lilac whisper `#B49BE0` · Night `#1B1120` · Moonmilk `#F3E9E4` · Rose glow `#E9B8D2` · Lilac glow `#C9A9EF` · Iris gradient `#F4A7B9 → #E8C79A → #BFE3C0 → #A9CBEF → #C9A9EF` · Melanin ribbon `#F1DCCB → #DDB699 → #BC8563 → #96603F → #6E4128 → #4A2B1C`
Fonts: Fraunces (display; italic for emotional words) + Karla (UI). In the repo, install from npm: `@fontsource/fraunces`, `@fontsource/karla`.

## House rules (enforce in code review)
1. Still surfaces → Silk Edge; moving surfaces → Passing Light. Never the animated mark as a frozen screenshot; the comet-arc dark mark IS its frozen frame.
2. Below 48px → mono marks only. The rainbow never appears at favicon scale.
3. The wordmark never enters a circle (avatars are the mark alone).
4. One ribbon per composition: iris on night surfaces, melanin on daylight; never both.
5. Clear space around the mark = the height of the O's counter (the hole).
6. Gold appears only when something is sealed or attested.
7. The gradient never sits behind text.
8. Taglines: "your colours, kept." (daylight) · "sleep. your palette stays awake." (night).
9. The rainbow is the light on the subject, never the subject.
