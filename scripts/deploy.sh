#!/bin/sh
# Builds the web app and publishes it to Vercel project "ghosttown" at ghosttown.nerom.site.
set -eu
cd "$(dirname "$0")/.."
(cd web && npx vitest run && npm run build)
mkdir -p deploy/site
rsync -a --delete --exclude .vercel web/dist/ deploy/site/
cd deploy/site
[ -f .vercel/project.json ] || npx -y vercel@latest link --yes --project ghosttown
npx -y vercel@latest deploy --prod --yes
npx -y vercel@latest domains add ghosttown.nerom.site ghosttown 2>/dev/null || true
