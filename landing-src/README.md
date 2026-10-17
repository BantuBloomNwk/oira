# Oira landing page (myoira.com)

React 19, Vite 6 and Tailwind v4. The built page is static and runs under the strict CSP in
`../landing/netlify.toml`, so everything it loads (images, fonts aside) is served from the site itself.

```
npm install
npm run dev          # local preview
./assemble.sh        # build, then lay it out with ../landing's brand files, APK, brand form and netlify.toml
```

`assemble.sh` writes `deploy/`. Copy that over `../landing/` to keep the repo matching what is live.

App buttons go to https://app.myoira.com, the download is `/downloads/oira-seeker.apk`, and the
feedback pop-up posts to the Netlify form `landing-feedback` (its stub lives in `index.html`).
The reading, wallet and brand pop-ups are examples with made-up numbers and say so on screen.
