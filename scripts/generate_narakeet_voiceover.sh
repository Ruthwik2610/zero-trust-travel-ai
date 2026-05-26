#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_PATH="${ROOT_DIR}/docs/Travel_AI_Narakeet_Voiceover.txt"
AUDIO_PATH="${ROOT_DIR}/frontend/public/videos/unipro-travel-ai-tutorial-narakeet.mp3"
VIDEO_PATH="${ROOT_DIR}/frontend/public/videos/unipro-travel-ai-tutorial.mp4"
OUTPUT_PATH="${ROOT_DIR}/frontend/public/videos/unipro-travel-ai-tutorial-voiced.mp4"
FFMPEG_PATH="${FFMPEG_PATH:-/Applications/Elmedia Player.app/Contents/Resources/ffmpeg}"
VOICE="${NARAKEET_VOICE:-victoria}"

if [[ -z "${NARAKEET_API_KEY:-}" ]]; then
  echo "NARAKEET_API_KEY is required. Export it or add it before running this script." >&2
  exit 2
fi

if [[ ! -x "${FFMPEG_PATH}" ]]; then
  echo "ffmpeg not found at ${FFMPEG_PATH}. Set FFMPEG_PATH to a valid ffmpeg binary." >&2
  exit 2
fi

curl --fail-with-body \
  --data-binary @"${SCRIPT_PATH}" \
  -H "Content-Type: text/plain" \
  -H "x-api-key: ${NARAKEET_API_KEY}" \
  -H "accept: application/octet-stream" \
  --output "${AUDIO_PATH}" \
  "https://api.narakeet.com/text-to-speech/mp3?voice=${VOICE}&voice-speed=1.04"

"${FFMPEG_PATH}" -y \
  -i "${VIDEO_PATH}" \
  -i "${AUDIO_PATH}" \
  -map 0:v:0 \
  -map 1:a:0 \
  -c:v copy \
  -c:a aac \
  -b:a 160k \
  -movflags +faststart \
  "${OUTPUT_PATH}"

echo "${OUTPUT_PATH}"
