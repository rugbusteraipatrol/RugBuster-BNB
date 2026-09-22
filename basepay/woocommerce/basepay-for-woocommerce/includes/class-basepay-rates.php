<?php
/**
 * Store-currency → USD conversion.
 *
 * BasePay quotes in US dollars. A shop priced in EUR, RSD or anything else
 * needs one rate, fetched daily from a free, keyless feed and cached. The
 * merchant can pin the rate by hand instead, which also covers currencies the
 * feed does not carry.
 *
 * @package BasePay
 */

defined( 'ABSPATH' ) || exit;

class BasePay_Rates {

	const FEED      = 'https://open.er-api.com/v6/latest/USD';
	const TRANSIENT = 'basepay_usd_rates';

	/**
	 * How many units of the store currency one US dollar buys, or null when
	 * unknown. `$manual` is the merchant's override (a positive number or '').
	 */
	public static function units_per_usd( $currency, $manual = '' ) {
		$currency = strtoupper( (string) $currency );
		if ( 'USD' === $currency ) {
			return 1.0;
		}
		if ( '' !== $manual && is_numeric( $manual ) && (float) $manual > 0 ) {
			return (float) $manual;
		}
		$rates = self::rates();
		return isset( $rates[ $currency ] ) && $rates[ $currency ] > 0 ? (float) $rates[ $currency ] : null;
	}

	/** Amount in USD, rounded to cents, or null when no rate is available. */
	public static function to_usd( $amount, $currency, $manual = '' ) {
		$rate = self::units_per_usd( $currency, $manual );
		if ( null === $rate ) {
			return null;
		}
		return round( (float) $amount / $rate, 2 );
	}

	private static function rates() {
		$cached = get_transient( self::TRANSIENT );
		if ( is_array( $cached ) ) {
			return $cached;
		}
		$response = wp_remote_get( self::FEED, array( 'timeout' => 10 ) );
		if ( is_wp_error( $response ) ) {
			return array();
		}
		$decoded = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( ! isset( $decoded['result'], $decoded['rates'] ) || 'success' !== $decoded['result'] || ! is_array( $decoded['rates'] ) ) {
			return array();
		}
		set_transient( self::TRANSIENT, $decoded['rates'], 6 * HOUR_IN_SECONDS );
		return $decoded['rates'];
	}
}
