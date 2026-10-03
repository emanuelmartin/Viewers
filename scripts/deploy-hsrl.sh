#!/usr/bin/env bash
# Build and deploy the HSRL viewer, keeping source maps out of the server.
#
#   scripts/deploy-hsrl.sh staging|production [--release]
#
# - builds with hidden source maps (no sourceMappingURL in the shipped JS)
# - archives every *.map into release/<tag>-sourcemaps.tar.gz
# - rsyncs dist/ to the server WITHOUT the maps and installs it (asks for the
#   remote sudo password; nothing is stored in this script)
# - with --release: tags the commit and publishes a GitHub release on the
#   fork with the source-map archive attached
set -euo pipefail

ENV="${1:-}"
RELEASE="${2:-}"
case "$ENV" in
  staging)
    PUBLIC_URL=/viewers2/; APP_CONFIG=config/hsrl-staging.js
    REMOTE_TMP=/tmp/viewers2-build; REMOTE_DIR=/home/pixos/imagelink/viewer/images2
    ;;
  production)
    PUBLIC_URL=/images/; APP_CONFIG=config/hsrl.js
    REMOTE_TMP=/tmp/viewer-build; REMOTE_DIR=/home/pixos/imagelink/viewer/images
    ;;
  *) echo "usage: $0 staging|production [--release]" >&2; exit 1 ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Uncommitted changes: commit first so the tag matches what is deployed." >&2
  exit 1
fi

VERSION="$(node -p "require('./platform/app/package.json').version")"
TAG="hsrl-${ENV}-v${VERSION}-$(date +%Y%m%d-%H%M)"
DIST=platform/app/dist
MAPS_ARCHIVE="release/${TAG}-sourcemaps.tar.gz"

echo "==> Building ${TAG}"
HIDDEN_SOURCEMAP=true PUBLIC_URL="$PUBLIC_URL" APP_CONFIG="$APP_CONFIG" \
  pnpm --filter @ohif/app run build:viewer

echo "==> Archiving source maps"
mkdir -p release
(cd "$DIST" && find . -name '*.map' -print0 | tar --null -czf "$ROOT/$MAPS_ARCHIVE" -T -)
# Only external .map references matter: vendored libraries (onnxruntime,
# microscopy viewer) ship their own inline data: maps, which are fine.
if grep -rlE 'sourceMappingURL=[^ ]*\.map' "$DIST" --include='*.js' | head -1 | grep -q .; then
  echo "A shipped JS file still references a source map; aborting." >&2
  exit 1
fi

echo "==> Uploading (without *.map)"
rsync -az --delete --exclude '*.map' -e "ssh -i ~/.ssh/pixos_access_key -p 42895" \
  "$DIST/" "pixos@imagen.hospitalrealsanlucas.com.mx:${REMOTE_TMP}/"

echo "==> Installing on the server (sudo)"
INSTALL="rm -rf ${REMOTE_DIR}/*; cp -a ${REMOTE_TMP}/* ${REMOTE_DIR}/; chown -R pixos:pixos ${REMOTE_DIR}"
if [[ "$ENV" == staging ]]; then
  INSTALL="${INSTALL}; sed -i '/routerBasename/s|/images/|/viewers2/|' ${REMOTE_DIR}/app-config.js"
fi
ssh -t pixos-hrsl "sudo bash -c \"${INSTALL}\""

if [[ "$RELEASE" == "--release" ]]; then
  echo "==> Tagging and publishing GitHub release ${TAG}"
  git tag -a "$TAG" -m "HSRL ${ENV} deploy ${TAG}"
  git push fork "$TAG"
  gh release create "$TAG" "$MAPS_ARCHIVE" --repo emanuelmartin/Viewers \
    --title "$TAG" --notes "HSRL ${ENV} deploy of $(git rev-parse --short HEAD). Source maps attached (not deployed)."
fi

echo "==> Done: ${TAG}  (source maps: ${MAPS_ARCHIVE})"
