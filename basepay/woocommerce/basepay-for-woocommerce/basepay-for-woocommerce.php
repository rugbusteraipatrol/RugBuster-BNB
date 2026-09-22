<?php
/**
 * Plugin Name:       BasePay – USDC Payments for WooCommerce
 * Plugin URI:        https://basepay-production.up.railway.app
 * Description:       Accept USDC on Base straight into your own wallet. Paste a wallet address, click Connect, done. No account, no API keys, no custody.
 * Version:           0.1.0
 * Requires at least: 6.4
 * Requires PHP:      7.4
 * Requires Plugins:  woocommerce
 * WC requires at least: 8.2
 * WC tested up to:   9.9
 * Author:            Fantom Studio
 * Author URI:        https://basepay-production.up.railway.app
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       basepay-for-woocommerce
 * Domain Path:       /languages
 *
 * @package BasePay
 */

defined( 'ABSPATH' ) || exit;

define( 'BASEPAY_WC_VERSION', '0.1.0' );
define( 'BASEPAY_WC_FILE', __FILE__ );
define( 'BASEPAY_WC_DIR', plugin_dir_path( __FILE__ ) );
define( 'BASEPAY_WC_URL', plugin_dir_url( __FILE__ ) );

/**
 * Where the BasePay service lives. Filterable so a self-hosted service can be
 * pointed at without editing the plugin: add_filter( 'basepay_api_base_url', ... ).
 */
function basepay_wc_api_base_url() {
	return untrailingslashit( apply_filters( 'basepay_api_base_url', 'https://basepay-production.up.railway.app' ) );
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
		require_once BASEPAY_WC_DIR . 'includes/class-basepay-api.php';
		require_once BASEPAY_WC_DIR . 'includes/class-basepay-rates.php';
		require_once BASEPAY_WC_DIR . 'includes/class-basepay-webhook.php';
		require_once BASEPAY_WC_DIR . 'includes/class-basepay-gateway.php';

		BasePay_Webhook::init();

		add_filter(
			'woocommerce_payment_gateways',
			function ( $gateways ) {
				$gateways[] = 'BasePay_Gateway';
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
		require_once BASEPAY_WC_DIR . 'includes/class-basepay-blocks.php';
		add_action(
			'woocommerce_blocks_payment_method_type_registration',
			function ( \Automattic\WooCommerce\Blocks\Payments\PaymentMethodRegistry $registry ) {
				$registry->register( new BasePay_Blocks() );
			}
		);
	}
);

add_filter(
	'plugin_action_links_' . plugin_basename( __FILE__ ),
	function ( $links ) {
		$settings = '<a href="' . esc_url( admin_url( 'admin.php?page=wc-settings&tab=checkout&section=basepay' ) ) . '">'
			. esc_html__( 'Settings', 'basepay-for-woocommerce' ) . '</a>';
		array_unshift( $links, $settings );
		return $links;
	}
);
