<?php
/**
 * Plugin Name:       StableCart for WooCommerce
 * Plugin URI:        https://stablecart.org/#woocommerce
 * Description:       Accept USDC on Base straight into your own wallet. Paste a wallet address, click Connect, done. No account, no API keys, no custody.
 * Version:           0.2.0
 * Requires at least: 6.4
 * Requires PHP:      7.4
 * Requires Plugins:  woocommerce
 * WC requires at least: 8.2
 * WC tested up to:   11.1
 * Author:            Fantom Studio
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       stablecart-for-woocommerce
 *
 * @package StableCart
 */

defined( 'ABSPATH' ) || exit;

define( 'STABLECART_WC_VERSION', '0.2.0' );
define( 'STABLECART_WC_FILE', __FILE__ );
define( 'STABLECART_WC_DIR', plugin_dir_path( __FILE__ ) );
define( 'STABLECART_WC_URL', plugin_dir_url( __FILE__ ) );

/**
 * Where the StableCart service lives. Filterable so a self-hosted service can be
 * pointed at without editing the plugin: add_filter( 'stablecart_api_base_url', ... ).
 */
function stablecart_wc_api_base_url() {
	return untrailingslashit( apply_filters( 'stablecart_api_base_url', 'https://stablecart.org' ) );
}

add_action(
	'before_woocommerce_init',
	function () {
		if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'cart_checkout_blocks', __FILE__, true );
		}
	}
);

add_action(
	'plugins_loaded',
	function () {
		if ( ! class_exists( 'WC_Payment_Gateway' ) ) {
			return;
		}
		require_once STABLECART_WC_DIR . 'includes/class-stablecart-api.php';
		require_once STABLECART_WC_DIR . 'includes/class-stablecart-rates.php';
		require_once STABLECART_WC_DIR . 'includes/class-stablecart-webhook.php';
		require_once STABLECART_WC_DIR . 'includes/class-stablecart-gateway.php';

		StableCart_Webhook::init();

		add_filter(
			'woocommerce_payment_gateways',
			function ( $gateways ) {
				$gateways[] = 'StableCart_Gateway';
				return $gateways;
			}
		);
	}
);

add_action(
	'woocommerce_blocks_loaded',
	function () {
		if ( ! class_exists( \Automattic\WooCommerce\Blocks\Payments\Integrations\AbstractPaymentMethodType::class ) ) {
			return;
		}
		require_once STABLECART_WC_DIR . 'includes/class-stablecart-blocks.php';
		add_action(
			'woocommerce_blocks_payment_method_type_registration',
			function ( \Automattic\WooCommerce\Blocks\Payments\PaymentMethodRegistry $registry ) {
				$registry->register( new StableCart_Blocks() );
			}
		);
	}
);

add_filter(
	'plugin_action_links_' . plugin_basename( __FILE__ ),
	function ( $links ) {
		$settings = '<a href="' . esc_url( admin_url( 'admin.php?page=wc-settings&tab=checkout&section=stablecart' ) ) . '">'
			. esc_html__( 'Settings', 'stablecart-for-woocommerce' ) . '</a>';
		array_unshift( $links, $settings );
		return $links;
	}
);
