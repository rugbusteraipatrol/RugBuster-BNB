<?php
/**
 * Removes everything the plugin stored. Order notes and order meta are left
 * alone: they are the shop's records of what was paid.
 *
 * @package BasePay
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

foreach ( array( 'basepay_merchant_id', 'basepay_merchant_key', 'basepay_webhook_secret', 'basepay_connected_wallet', 'woocommerce_basepay_settings' ) as $basepay_option ) {
	delete_option( $basepay_option );
}
delete_transient( 'basepay_merchant_view' );
delete_transient( 'basepay_usd_rates' );
