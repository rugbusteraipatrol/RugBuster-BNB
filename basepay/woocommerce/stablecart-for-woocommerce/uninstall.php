<?php
/**
 * Removes everything the plugin stored. Order notes and order meta are left
 * alone: they are the shop's records of what was paid.
 *
 * @package StableCart
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

foreach ( array( 'stablecart_merchant_id', 'stablecart_merchant_key', 'stablecart_webhook_secret', 'stablecart_connected_wallet', 'woocommerce_stablecart_settings' ) as $stablecart_option ) {
	delete_option( $stablecart_option );
}
delete_transient( 'stablecart_merchant_view' );
delete_transient( 'stablecart_usd_rates' );
