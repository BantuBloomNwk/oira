// Generates the palette share kit: one card PNG + one share page (with baked OpenGraph/Twitter
// meta) per season. Social crawlers do not run JS, so the meta must be static per season, hence
// pre-generated pages rather than one JS page. Card PNGs are rendered with headless Chromium for
// font + gradient fidelity. Run: node scripts/build-share.mjs
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// BASE drives the actual fetchable/clickable URLs (og:image, og:url, the CTA link), stays
// on the working Netlify domain until myoira.com's DNS has actually propagated (can take up
// to a day per Netlify's own docs), so shared links don't 404 during that window. Override
// with OIRA_BASE=https://myoira.com once DNS is confirmed live, and re-run this script.
const BASE = process.env.OIRA_BASE || 'https://oira-palette.netlify.app';
// BRAND_DOMAIN is the domain shown as brand text on the card image/page, purely visual,
// safe to set to the real domain immediately regardless of DNS propagation status.
const BRAND_DOMAIN = 'myoira.com';
const OUT_IMG = path.join(ROOT, 'app/share');
const OUT_PAGE = path.join(ROOT, 'app/s');
fs.mkdirSync(OUT_IMG, { recursive: true });
fs.mkdirSync(OUT_PAGE, { recursive: true });

// must match app/index.html SEASONS
const SEASONS = {
  'Deep Winter': ['#7A1F3D', '#B3123B', '#1E2A5A', '#0E6B5C', '#5A2E8A', '#FFFBF7'],
  'Deep Autumn': ['#7A3B2A', '#A85A32', '#C98A3E', '#6E5236', '#3E5B4A', '#2C1E14'],
  'True Winter': ['#7A1F3D', '#B3123B', '#1E2A5A', '#0E6B5C', '#5A2E8A', '#FFFBF7'],
  'Cool Summer': ['#9B7787', '#7E6E8E', '#6E8391', '#B48CA0', '#4E5B6E', '#E7D9E0'],
  'Warm Spring': ['#E0894F', '#E4B24A', '#D96A4A', '#7CA64A', '#4FB3A0', '#F3E2C4'],
  'Warm Autumn': ['#8A4B2A', '#B07A2E', '#C99A3E', '#6E6236', '#4E5B3A', '#2C1E14'],
};
const slug = (s) => s.toLowerCase().replace(/ /g, '-');
const italicLast = (s) => { const w = s.split(' '); return w.slice(0, -1).join(' ') + ' <em>' + w.slice(-1) + '</em>'; };

const cardHtml = (season, sw) => `<!doctype html><html><head><meta charset="utf8">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400&family=Karla:wght@400;600&display=swap" rel="stylesheet">
<style>
 *{margin:0;box-sizing:border-box} html,body{width:1200px;height:630px;overflow:hidden}
 body{font-family:'Karla',system-ui,sans-serif;color:#43203B;background:radial-gradient(120% 110% at 14% 8%,#FFF8F2,#FBF3EE 52%,#F2E1D7)}
 .wrap{padding:52px 78px;height:100%;display:flex;flex-direction:column;justify-content:flex-start}
 .eyebrow{font-size:20px;letter-spacing:4px;text-transform:uppercase;color:#A85578;font-weight:600}
 .season{font-family:'Fraunces',serif;font-size:82px;font-weight:600;line-height:1.02;margin-top:14px}
 .season em{font-style:italic;color:#C08A2E}
 .tag{font-size:25px;color:#7a5570;margin-top:16px;max-width:660px;line-height:1.4}
 .sw{display:flex;gap:16px;margin-top:44px}
 .sw i{width:70px;height:70px;border-radius:50%;box-shadow:0 7px 20px rgba(67,32,59,.18);border:2px solid rgba(255,255,255,.6)}
 .foot{display:flex;align-items:flex-end;justify-content:space-between;margin-top:46px}
 .brand{font-family:'Fraunces',serif;font-size:40px;font-weight:600}
 .brand b{color:#D6A756}
 .url{font-size:21px;color:#9c7c93}
</style></head><body><div class="wrap">
 <div><div class="eyebrow">My colours</div><div class="season">${italicLast(season)}<span style="color:#D6A756">.</span></div>
 <div class="tag">The shades that are mine alone. Discovered on Oira.</div></div>
 <div class="sw">${sw.map((c) => `<i style="background:${c}"></i>`).join('')}</div>
 <div class="foot"><div class="brand">Oira<b>.</b></div><div class="url">${BRAND_DOMAIN}</div></div>
</div></body></html>`;

const sharePage = (season, sw) => { const sl = slug(season); const img = `${BASE}/share/${sl}.png`; return `<!doctype html><html lang="en"><head><meta charset="utf8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${season} · Oira</title>
<meta name="description" content="I found my season on Oira. Discover the shades that are yours alone.">
<meta property="og:type" content="website">
<meta property="og:title" content="My colours are ${season}">
<meta property="og:description" content="I found my season on Oira. Discover the shades that are yours alone.">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:url" content="${BASE}/s/${sl}.html">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="My colours are ${season}">
<meta name="twitter:description" content="Discover the shades that are yours alone, on Oira.">
<meta name="twitter:image" content="${img}">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,400&family=Karla:wght@400;600&display=swap" rel="stylesheet">
<style>*{margin:0;box-sizing:border-box}body{font-family:'Karla',system-ui,sans-serif;background:radial-gradient(120% 90% at 50% 0%,#FFF8F2,#FBF3EE 60%,#F2E1D7);color:#43203B;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:26px}
.card{max-width:420px;width:100%;background:#FFFBF7;border-radius:28px;box-shadow:0 24px 60px rgba(67,32,59,.18);padding:34px 30px;text-align:center}
.eyebrow{font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#A85578;font-weight:600}
.season{font-family:'Fraunces',serif;font-size:44px;font-weight:600;margin-top:8px;line-height:1.05}.season em{font-style:italic;color:#C08A2E}
.sub{color:#7a5570;font-size:14px;margin-top:12px;line-height:1.6}
.sw{display:flex;gap:11px;justify-content:center;margin:22px 0}.sw i{width:44px;height:44px;border-radius:50%;box-shadow:0 5px 14px rgba(67,32,59,.16);border:2px solid rgba(255,255,255,.7)}
.cta{display:inline-block;margin-top:6px;background:linear-gradient(150deg,#E7A6C0,#C9799B);color:#fff;text-decoration:none;border-radius:99px;padding:14px 30px;font-weight:600;font-size:15px;box-shadow:0 10px 26px rgba(201,121,155,.34)}
.brand{font-family:'Fraunces',serif;font-weight:600;font-size:22px;margin-top:22px}.brand b{color:#D6A756}</style></head>
<body><div class="card"><div class="eyebrow">A palette on Oira</div>
<div class="season">${italicLast(season)}<span style="color:#D6A756">.</span></div>
<div class="sub">These are her colours, sealed and private. Yours are waiting to be found.</div>
<div class="sw">${sw.map((c) => `<i style="background:${c}"></i>`).join('')}</div>
<a class="cta" id="cta" href="${BASE}/">Discover your colours</a>
<div class="brand">Oira<b>.</b></div></div>
<script>try{var p=new URLSearchParams(location.search),r=p.get('r');if(r){localStorage.setItem('oira_ref',r);var c=document.getElementById('cta');c.href=c.href+'?r='+encodeURIComponent(r);}}catch(e){}</script>
</body></html>`; };

let n = 0;
for (const [season, sw] of Object.entries(SEASONS)) {
  const tmp = `/tmp/oira-card-${slug(season)}.html`;
  fs.writeFileSync(tmp, cardHtml(season, sw));
  const out = path.join(OUT_IMG, slug(season) + '.png');
  execSync(`chromium --headless --disable-gpu --no-sandbox --hide-scrollbars --window-size=1200,630 --force-device-scale-factor=1 --virtual-time-budget=5000 --screenshot="${out}" "file://${tmp}"`, { stdio: 'ignore' });
  fs.writeFileSync(path.join(OUT_PAGE, slug(season) + '.html'), sharePage(season, sw));
  n++; console.log('built', season, '->', slug(season) + '.png + .html');
}
console.log(`\nDone: ${n} season cards + share pages.`);
