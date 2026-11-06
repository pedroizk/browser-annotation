# README video

Generates the 30-second tour shown at the top of the README, in English and Portuguese:
`docs/media/<lang>/browser-annotation.mp4` (with sound) and `browser-annotation.webp` (animated, autoplays on GitHub).

```bash
npm install
scripts/video/build.sh          # en and pt-BR
scripts/video/build.sh pt-BR    # one language only
```

Requires Node with Playwright, Python 3 with `numpy`, and `ffmpeg` built with `libx264`, `aac` and `libwebp_anim`.
Fonts are system fonts (Inter and DejaVu Sans Mono); nothing is downloaded.

## How it works

1. `capture-all.cjs` loads the real extension in Chromium, in the chosen language, and records four clips on the demo page
   (`examples/demo.html` or `examples/demo.pt-BR.html`): screencast frames plus a log of mouse moves, clicks and keys.
   Shortcuts are Chrome commands, which simulated keys don't trigger, so the script fires them through the service
   worker and logs the key so it still shows on screen.
2. `render.cjs` opens `director.html?lang=<lang>` and renders it frame by frame. `director.html` holds every scene,
   caption and text in both languages, plus the cut points (`PIECES`) and zooms (`ZOOM`), which are tuned to the
   timing of the recorded clips.
3. `audio.py` synthesizes the music and sound effects from the event log.
4. `build.sh` encodes the MP4 and the WebP.

If you change the extension's look, run the script again. If you change the clip scripts in `capture-all.cjs`,
check the cut points with `PN_LANG=en node render.cjs preview "4.6,15.6"` (renders single frames to `preview-en/`)
while `python3 -m http.server 8766` serves this folder. The texts typed in English have the same length as the
Portuguese ones so both languages share the same cut points.
