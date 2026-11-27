#!/usr/bin/env bash
# Roda dentro do serviço wpcli (wordpress:cli), não no PowerShell.
set -euo pipefail

cd /var/www/html

yoast_version="28.9"
app_name="AZ News Studio"
webhook_url="http://host.docker.internal:3000/api/webhooks/wordpress"

if [ -z "${WP_ADMIN_PASSWORD:-}" ]; then
  echo "WP_ADMIN_PASSWORD está vazia. Defina a senha do admin no .env e rode pnpm wp:setup de novo." >&2
  exit 1
fi

echo "Aguardando o banco do WordPress..."
ready=0
for _ in $(seq 1 30); do
  if wp db query "SELECT 1" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
if [ "$ready" != "1" ]; then
  echo "O MariaDB não respondeu a tempo." >&2
  exit 1
fi

if wp core is-installed >/dev/null 2>&1; then
  echo "WordPress já estava instalado. Senha do admin mantida."
else
  wp core install \
    --url="http://127.0.0.1:8080" \
    --title="AZ News Studio (local)" \
    --admin_user="admin" \
    --admin_password="$WP_ADMIN_PASSWORD" \
    --admin_email="admin@localhost.local" \
    --skip-email
  echo "WordPress instalado."
fi

# Sem --hard: no CLI o WP-CLI não enxerga o mod_rewrite e o aviso é falso.
# A imagem apache já traz o .htaccess com as regras.
wp rewrite structure '/%postname%/'
echo "Links permanentes ativos."

installed_yoast="$(wp plugin get wordpress-seo --field=version 2>/dev/null || true)"
if [ "$installed_yoast" != "$yoast_version" ]; then
  wp plugin install wordpress-seo --version="$yoast_version" --force --activate
else
  wp plugin activate wordpress-seo
fi
echo "Yoast SEO ${yoast_version} ativo."

wp plugin activate az-bridge
echo "az-bridge ativo."

environment="$(wp eval 'echo wp_get_environment_type();')"
if [ "$environment" != "local" ]; then
  echo "WP_ENVIRONMENT_TYPE precisa ser local para a senha de aplicativo sem HTTPS. Veio: ${environment}" >&2
  exit 1
fi

# O plugin lê só a constante, gravada no WORDPRESS_CONFIG_EXTRA do compose.
echo "URL do webhook do az-bridge (AZ_STUDIO_WEBHOOK_URL):"
actual_url="$(wp eval 'echo defined("AZ_STUDIO_WEBHOOK_URL") ? AZ_STUDIO_WEBHOOK_URL : "";')"
printf '%s\n' "$actual_url"
if [ "$actual_url" != "$webhook_url" ]; then
  printf 'URL do webhook deveria ser %s, veio %s\n' "$webhook_url" "$actual_url" >&2
  exit 1
fi

wp eval 'if (!defined("AZ_STUDIO_WEBHOOK_SECRET") || !is_string(AZ_STUDIO_WEBHOOK_SECRET) || AZ_STUDIO_WEBHOOK_SECRET === "") { fwrite(STDERR, "Segredo do webhook vazio. Defina WP_WEBHOOK_SECRET no .env e rode pnpm wp:up de novo.\n"); exit(1); }'
echo "Segredo do webhook definido."

if wp user get studio --field=ID >/dev/null 2>&1; then
  wp user set-role studio editor
  echo "Usuário studio já existia. Papel editor mantido."
else
  studio_pass="$(head -c 24 /dev/urandom | base64 | tr -d '\n')"
  wp user create studio studio@localhost.local \
    --role=editor \
    --user_pass="$studio_pass" \
    --display_name="Studio"
  echo "Usuário studio criado com papel editor."
fi

user_count="$(wp user list --login=studio --format=count)"
if [ "$user_count" != "1" ]; then
  printf 'Esperava 1 usuário studio, achei %s.\n' "$user_count" >&2
  exit 1
fi

roles="$(wp user get studio --field=roles)"
case "$roles" in
  *editor*) ;;
  *)
    printf 'Usuário studio sem papel editor: %s\n' "$roles" >&2
    exit 1
    ;;
esac

# A senha de aplicativo só é exibida na criação. O WordPress não deixa lê-la de novo.
existing_names="$(wp user application-password list studio --field=name 2>/dev/null || true)"
if printf '%s\n' "$existing_names" | grep -Fxq "$app_name"; then
  echo "A senha de aplicativo \"${app_name}\" do usuário studio já existe. Ela não é mostrada de novo."
  echo "Se perdeu, apague com: wp user application-password delete studio --all"
  echo "e rode pnpm wp:setup outra vez."
else
  app_password="$(wp user application-password create studio "$app_name" --porcelain)"
  echo "Cole esta senha em WP_APP_PASSWORD no .env. Este script não altera o .env:"
  printf '%s\n' "$app_password"
fi

echo "Plugins:"
wp plugin get az-bridge --fields=name,status,version
wp plugin get wordpress-seo --fields=name,status,version
echo "Usuário:"
wp user get studio --fields=user_login,roles
