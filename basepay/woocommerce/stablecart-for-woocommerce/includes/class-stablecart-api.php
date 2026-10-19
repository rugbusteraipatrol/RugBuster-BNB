<?php
/**
 * Thin HTTP client for the StableCart service.
 *
 * Three calls: register this shop, read its plan and usage, update its wallet.
 * Payment sessions are opened by the widget in the buyer's browser, not here.
 *
 * @package StableCart
 */

defined( 'ABSPATH' ) || exit;

class StableCart_API {

	const OPTION_MERCHANT_ID    = 'stablecart_merchant_id';
	const OPTION_MERCHANT_KEY   = 'stablecart_merchant_key';
	const OPTION_WEBHOOK_SECRET = 'stablecart_webhook_secret';
	const OPTION_WALLET         = 'stablecart_connected_wallet';

	/** Secret used to sign webhooks; generated once per site. */
	public static function webhook_secret() {
		$secret = get_option( self::OPTION_WEBHOOK_SECRET );
		if ( ! is_string( $secret ) || strlen( $secret ) < 32 ) {
			$secret = wp_generate_password( 64, false );
			update_option( self::OPTION_WEBHOOK_SECRET, $secret, false );
		}
		return $secret;
	}

	public static function webhook_url() {
		return add_query_arg( 'wc-api', StableCart_Webhook::ENDPOINT, home_url( '/' ) );
	}

	public static function merchant_id() {
		$id = get_option( self::OPTION_MERCHANT_ID );
		return is_string( $id ) && '' !== $id ? $id : null;
	}

	public static function is_connected() {
		return null !== self::merchant_id() && is_string( get_option( self::OPTION_MERCHANT_KEY ) );
	}

	/**
	 * Registers this shop with the service. Returns the merchant id, or a WP_Error
	 * carrying the service's error code in its data.
	 */
	public static function register( $wallet_address ) {
		$response = self::request(
			'POST',
			'/api/merchants',
			array(
				'walletAddress' => $wallet_address,
				'webhookUrl'    => self::webhook_url(),
				'webhookSecret' => self::webhook_secret(),
				'siteUrl'       => home_url( '/' ),
				'platform'      => 'woocommerce',
			)
		);
		if ( is_wp_error( $response ) ) {
			return $response;
		}
		update_option( self::OPTION_MERCHANT_ID, $response['merchantId'], false );
		update_option( self::OPTION_MERCHANT_KEY, $response['merchantKey'], false );
		update_option( self::OPTION_WALLET, $response['walletAddress'], false );
		delete_transient( 'stablecart_merchant_view' );
		return $response['merchantId'];
	}

	/** Changes the payout wallet of the connected merchant. */
	public static function update_wallet( $wallet_address ) {
		$response = self::request( 'PATCH', '/api/merchants/' . rawurlencode( self::merchant_id() ), array( 'walletAddress' => $wallet_address ), true );
		if ( is_wp_error( $response ) ) {
			return $response;
		}
		update_option( self::OPTION_WALLET, $response['walletAddress'], false );
		delete_transient( 'stablecart_merchant_view' );
		return $response['walletAddress'];
	}

	/** Plan and usage, cached for five minutes so the settings page stays quick. */
	public static function merchant_view( $force = false ) {
		if ( ! self::is_connected() ) {
			return null;
		}
		$cached = $force ? false : get_transient( 'stablecart_merchant_view' );
		if ( is_array( $cached ) ) {
			return $cached;
		}
		$response = self::request( 'GET', '/api/merchants/' . rawurlencode( self::merchant_id() ), null, true );
		if ( is_wp_error( $response ) ) {
			return $response;
		}
		set_transient( 'stablecart_merchant_view', $response, 5 * MINUTE_IN_SECONDS );
		return $response;
	}

	public static function disconnect() {
		delete_option( self::OPTION_MERCHANT_ID );
		delete_option( self::OPTION_MERCHANT_KEY );
		delete_option( self::OPTION_WALLET );
		delete_transient( 'stablecart_merchant_view' );
	}

	/**
	 * @return array|WP_Error Decoded JSON body, or an error whose code is the service's error code.
	 */
	private static function request( $method, $path, $body = null, $authenticated = false ) {
		$args = array(
			'method'  => $method,
			'timeout' => 20,
			'headers' => array(
				'accept'     => 'application/json',
				'user-agent' => 'StableCart-WooCommerce/' . STABLECART_WC_VERSION . '; ' . home_url( '/' ),
			),
		);
		if ( null !== $body ) {
			$args['headers']['content-type'] = 'application/json';
			$args['body']                    = wp_json_encode( $body );
		}
		if ( $authenticated ) {
			$args['headers']['authorization'] = 'Bearer ' . get_option( self::OPTION_MERCHANT_KEY );
		}

		$response = wp_remote_request( stablecart_wc_api_base_url() . $path, $args );
		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'NETWORK', $response->get_error_message() );
		}

		$status  = (int) wp_remote_retrieve_response_code( $response );
		$decoded = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( $status >= 200 && $status < 300 && is_array( $decoded ) ) {
			return $decoded;
		}
		$code    = isset( $decoded['error']['code'] ) ? (string) $decoded['error']['code'] : 'HTTP_' . $status;
		$message = isset( $decoded['error']['message'] ) ? (string) $decoded['error']['message'] : __( 'The StableCart service returned an unexpected response.', 'stablecart-for-woocommerce' );
		return new WP_Error( $code, $message, array( 'status' => $status ) );
	}
}
