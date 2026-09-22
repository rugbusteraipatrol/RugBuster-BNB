<?php
/**
 * Registers the gateway with the block-based (React) checkout.
 *
 * The block checkout does not render gateway HTML; it needs a small script
 * that declares the method. Placing the order still goes through
 * StableCart_Gateway::process_payment, which redirects to the pay page.
 *
 * @package StableCart
 */

defined( 'ABSPATH' ) || exit;

use Automattic\WooCommerce\Blocks\Payments\Integrations\AbstractPaymentMethodType;

class StableCart_Blocks extends AbstractPaymentMethodType {

	protected $name = 'stablecart';

	public function initialize() {
		$this->settings = get_option( 'woocommerce_stablecart_settings', array() );
	}

	public function is_active() {
		$gateways = WC()->payment_gateways()->payment_gateways();
		return isset( $gateways['stablecart'] ) && $gateways['stablecart']->is_available();
	}

	public function get_payment_method_script_handles() {
		wp_register_script(
			'stablecart-blocks',
			STABLECART_WC_URL . 'assets/js/blocks.js',
			array( 'wc-blocks-registry', 'wc-settings', 'wp-element', 'wp-html-entities' ),
			STABLECART_WC_VERSION,
			true
		);
		return array( 'stablecart-blocks' );
	}

	public function get_payment_method_data() {
		return array(
			'title'       => $this->get_setting( 'title', __( 'USDC on Base', 'stablecart-for-woocommerce' ) ),
			'description' => $this->get_setting( 'description', '' ),
			'icon'        => STABLECART_WC_URL . 'assets/usdc.svg',
			'supports'    => array( 'products' ),
		);
	}
}
