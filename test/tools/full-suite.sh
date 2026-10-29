#!/bin/zsh
# Tam tarayıcı takımı: her betik ayrı, çıktılar $SCRATCH/full/<ad>.txt, özet $SCRATCH/full/_summary.txt ("<ad> exit=<kod> ✗=<n>").
# Kullanım: SCRATCH=<scratchpad> XML_DIR=<gerçek xml> DEMO_DIR=<demo> test/tools/full-suite.sh   (uygulama 5179'da açıkken; koşarken src'ye dokunma)
set -u
cd "$(dirname "$0")/../.."
OUT="$SCRATCH/full"; rm -rf "$OUT"; mkdir -p "$OUT"
for f in test/*-e2e.mjs; do n=$(basename "$f" .mjs); node "$f" > "$OUT/$n.txt" 2>&1; echo "$n exit=$? ✗=$(grep -c '✗' "$OUT/$n.txt")" >> "$OUT/_summary.txt"; done
# bulk-e2e ve chart-undo-e2e rehber görsellerinin üstüne yazar
git checkout public/guide/05b-toplu.png public/guide/05c-liste.png 2>/dev/null
echo BITTI >> "$OUT/_summary.txt"
