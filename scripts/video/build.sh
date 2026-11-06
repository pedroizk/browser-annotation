#!/usr/bin/env bash
# Gera o vídeo do README em cada idioma: docs/media/<idioma>/browser-annotation.{mp4,webp}
# Uso: scripts/video/build.sh            → en e pt-BR
#      scripts/video/build.sh pt-BR      → só um idioma
# Requer: Node com Playwright (npm install), Python 3 com numpy e ffmpeg com libx264, aac e libwebp_anim.
set -euo pipefail
cd "$(dirname "$0")"
VIDEO_DIR="$PWD"
REPO="$(cd ../.. && pwd)"
LANGS=("${@:-en}")
[ $# -eq 0 ] && LANGS=(en pt-BR)

# 8765 serve a página de demo (gravação); 8766 serve director.html (renderização)
python3 -m http.server 8765 --directory "$REPO" >/dev/null 2>&1 &
DEMO_SERVER=$!
python3 -m http.server 8766 --directory "$VIDEO_DIR" >/dev/null 2>&1 &
DIRECTOR_SERVER=$!
trap 'kill $DEMO_SERVER $DIRECTOR_SERVER 2>/dev/null; rm -rf "$VIDEO_DIR/profiles"' EXIT
sleep 1

for L in "${LANGS[@]}"; do
  echo "== $L"
  # 1. grava os clipes com a extensão real (clips-$L/)
  PN_LANG=$L node capture-all.cjs
  # 2. renderiza 858 quadros (28,6 s a 30 fps, 1920x1080) e os eventos de áudio
  PN_LANG=$L node render.cjs full
  # 3. trilha e efeitos sintetizados a partir dos eventos
  python3 audio.py "audio-events-$L.json" "audio-$L.wav"
  # 4. MP4 com som e WebP animado (o README mostra o WebP)
  OUT="$REPO/docs/media/$L"
  mkdir -p "$OUT"
  ffmpeg -hide_banner -loglevel error -y -framerate 30 -i "frames-$L/f%05d.jpg" -i "audio-$L.wav" \
    -c:v libx264 -preset slow -crf 26 -tune animation -pix_fmt yuv420p -profile:v high -g 60 \
    -af "loudnorm=I=-16:TP=-1.5:LRA=11" -ar 48000 -c:a aac -b:a 128k -movflags +faststart -shortest \
    "$OUT/browser-annotation.mp4"
  ffmpeg -hide_banner -loglevel error -y -i "$OUT/browser-annotation.mp4" \
    -vf "fps=20,scale=1280:-2:flags=lanczos" -c:v libwebp_anim -lossless 0 -quality 72 \
    -compression_level 6 -preset picture -loop 0 -an "$OUT/browser-annotation.webp"
  echo "✓ $L: docs/media/$L/browser-annotation.{mp4,webp}"
done
