#!/usr/bin/env bash
# Vercel'e tek komutla yayınlama.
#
# Gerekli:  VERCEL_TOKEN  (https://vercel.com/account/tokens)
# İsteğe bağlı: VERCEL_PROJECT (varsayılan: muzik-listesi-aktarici), VERCEL_SCOPE (takım adı),
#               APP_URL, SESSION_SECRET ve platform anahtarları (.env.example'daki adlarla).
#
# Ortamda tanımlı olan platform anahtarları Vercel projesine aktarılır.
# SESSION_SECRET verilmezse güvenli bir değer üretilir.
#
# Kullanım:  VERCEL_TOKEN=... ./scripts/deploy-vercel.sh

set -euo pipefail
cd "$(dirname "$0")/.."

: "${VERCEL_TOKEN:?VERCEL_TOKEN tanımlı değil. https://vercel.com/account/tokens adresinden oluşturun.}"
PROJECT="${VERCEL_PROJECT:-muzik-listesi-aktarici}"

vercel() {
  local scope=()
  [[ -n "${VERCEL_SCOPE:-}" ]] && scope=(--scope "$VERCEL_SCOPE")
  npx --yes vercel@latest "$@" --token "$VERCEL_TOKEN" ${scope[@]+"${scope[@]}"}
}

echo "▸ Proje bağlanıyor: $PROJECT"
vercel link --yes --project "$PROJECT" >/dev/null

set_env() {
  local name="$1" value="$2"
  vercel env rm "$name" production --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | vercel env add "$name" production >/dev/null
  echo "  ✓ $name"
}

echo "▸ Ortam değişkenleri ayarlanıyor"
SECRET="${SESSION_SECRET:-$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")}"
set_env SESSION_SECRET "$SECRET"

for name in APP_URL SPOTIFY_CLIENT_ID SPOTIFY_CLIENT_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET \
  DEEZER_APP_ID DEEZER_APP_SECRET APPLE_TEAM_ID APPLE_KEY_ID APPLE_PRIVATE_KEY APPLE_DEFAULT_STOREFRONT; do
  if [[ -n "${!name:-}" ]]; then set_env "$name" "${!name}"; fi
done

echo "▸ Üretime yayınlanıyor"
DEPLOY_URL="$(vercel deploy --prod --yes)"

# Kalıcı üretim adresi. APP_URL verilmediyse uygulama Vercel'in üretim adresini kullanır;
# proje adı alınmışsa Vercel sonuna ek koyabilir, kesin adres için Vercel panelindeki Domains'e bakın.
BASE="${APP_URL:-https://$PROJECT.vercel.app}"

cat <<EOF

✔ Yayında: $BASE
  (bu deploy: $DEPLOY_URL)

Platform panellerine eklenecek redirect URI'ler:
  Spotify : $BASE/api/auth/spotify/callback
  YouTube : $BASE/api/auth/youtube/callback
  Deezer  : $BASE/api/auth/deezer/callback   (domain: ${BASE#https://})
  Apple   : gerekmez

Kontrol: $BASE/api/auth/status
EOF
