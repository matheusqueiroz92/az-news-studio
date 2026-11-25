<?php
/**
 * Plugin Name: AZ Bridge
 * Description: Ponte do AZ News Studio: health, metadados na REST e webhook de post publicado.
 * Version: 1.0.0
 * Requires at least: 6.4
 * Requires PHP: 8.1
 * Author: AZ News Studio
 * License: GPL-2.0-or-later
 * Text Domain: az-bridge
 *
 * @package AZBridge
 */

defined( 'ABSPATH' ) || exit;

/** Igual ao cabeçalho Version. O health devolve esta string. */
const AZ_BRIDGE_VERSION = '1.0.0';

add_action( 'init', 'az_bridge_register_meta', 10 );
add_action( 'rest_api_init', 'az_bridge_register_routes' );
add_action( 'transition_post_status', 'az_bridge_on_post_status_transition', 10, 3 );

function az_bridge_register_meta(): void {
	$callbacks = array(
		'_yoast_wpseo_metadesc' => 'az_bridge_sanitize_yoast_meta',
		'_yoast_wpseo_focuskw'  => 'az_bridge_sanitize_yoast_meta',
		'_az_studio_article_id' => 'sanitize_text_field',
		'_az_studio_source_url' => 'az_bridge_sanitize_source_url',
	);

	foreach ( $callbacks as $key => $sanitize ) {
		register_post_meta(
			'post',
			$key,
			array(
				'single'            => true,
				'type'              => 'string',
				'show_in_rest'      => true,
				'auth_callback'     => static fn(): bool => current_user_can( 'edit_posts' ),
				'sanitize_callback' => $sanitize,
			)
		);
	}
}

/**
 * Só tira tags e espaços nas pontas. sanitize_text_field apagaria %XX e variáveis do Yoast (%%date%%).
 */
function az_bridge_sanitize_yoast_meta( mixed $value ): string {
	if ( ! is_string( $value ) ) {
		return '';
	}

	return trim( wp_strip_all_tags( $value ) );
}

/**
 * O 2º argumento de esc_url_raw é a lista de protocolos; o sanitize do meta passa a chave ali.
 */
function az_bridge_sanitize_source_url( mixed $value ): string {
	if ( ! is_string( $value ) ) {
		return '';
	}

	return esc_url_raw( $value );
}

function az_bridge_register_routes(): void {
	register_rest_route(
		'az-bridge/v1',
		'/health',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => 'az_bridge_health',
			'permission_callback' => '__return_true',
		)
	);
}

/**
 * @return array{version: string}
 */
function az_bridge_health(): array {
	return array(
		'version' => AZ_BRIDGE_VERSION,
	);
}

/**
 * Dispara só quando um post entra em publish. Salvar de novo um post já publicado não gera outro evento.
 */
function az_bridge_on_post_status_transition( string $new_status, string $old_status, WP_Post $post ): void {
	if ( 'publish' !== $new_status || 'publish' === $old_status ) {
		return;
	}

	if ( 'post' !== $post->post_type ) {
		return;
	}

	az_bridge_send_published_webhook( $post );
}

/**
 * Sem as constantes, ou se o HTTP falhar, a publicação segue. blocking false, como a v1 pede.
 */
function az_bridge_send_published_webhook( WP_Post $post ): void {
	if ( ! defined( 'AZ_STUDIO_WEBHOOK_URL' ) || ! defined( 'AZ_STUDIO_WEBHOOK_SECRET' ) ) {
		return;
	}

	$endpoint = AZ_STUDIO_WEBHOOK_URL;
	$secret   = AZ_STUDIO_WEBHOOK_SECRET;

	if ( ! is_string( $endpoint ) || ! is_string( $secret ) || '' === $endpoint || '' === $secret ) {
		return;
	}

	$endpoint = esc_url_raw( $endpoint );
	if ( '' === $endpoint ) {
		return;
	}

	$permalink = get_permalink( $post );
	if ( ! is_string( $permalink ) || '' === $permalink ) {
		return;
	}

	$published_at = gmdate( 'c' );
	if ( is_string( $post->post_date_gmt ) && ! str_starts_with( $post->post_date_gmt, '0000' ) ) {
		$published = date_create_immutable_from_format(
			'!Y-m-d H:i:s',
			$post->post_date_gmt,
			new DateTimeZone( 'UTC' )
		);
		if ( $published instanceof DateTimeImmutable ) {
			$published_at = $published->format( 'c' );
		}
	}

	$body = wp_json_encode(
		array(
			'event'       => 'post.published',
			'postId'      => (int) $post->ID,
			'url'         => $permalink,
			'title'       => wp_strip_all_tags( $post->post_title ),
			'publishedAt' => $published_at,
		)
	);

	if ( ! is_string( $body ) || '' === $body ) {
		return;
	}

	wp_remote_post(
		$endpoint,
		array(
			'blocking' => false,
			'headers'  => array(
				'Content-Type'   => 'application/json; charset=utf-8',
				'X-AZ-Signature' => 'sha256=' . hash_hmac( 'sha256', $body, $secret ),
			),
			'body'     => $body,
		)
	);
}
