=== AZ Bridge ===
Contributors: aznews
Requires at least: 6.4
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 1.0.0
License: GPL-2.0-or-later

Ponte do AZ News Studio com o WordPress.

== Description ==

Expõe `GET /wp-json/az-bridge/v1/health`, registra na REST os metadados do Yoast e do Studio e avisa o Studio quando um post é publicado.

Não tem tela de configuração e não imprime nada no front. A URL e o segredo do webhook ficam no `wp-config.php`:

* `AZ_STUDIO_WEBHOOK_URL`
* `AZ_STUDIO_WEBHOOK_SECRET`

Sem essas constantes, o plugin não envia o webhook e a publicação segue normalmente. Falha de HTTP no envio é ignorada.

== Installation ==

1. Copie a pasta `az-bridge` para `wp-content/plugins/`.
2. Ative o plugin.
3. Se o Studio for receber o evento de publicação, defina as duas constantes no `wp-config.php`.

== Changelog ==

= 1.0.0 =
* Health público, metadados na REST e webhook assinado de post publicado.
