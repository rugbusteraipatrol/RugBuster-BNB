<?php
/**
 * Receives StableCart webhooks at /?wc-api=stablecart.
 *
 * Three events: `merchant.verify` (answered during Connect, proves this site
 * holds the secret), `payment.paid` (order paid) and `payment.underpaid`
 * (order on hold with a note saying how much arrived). Every request is
 * HMAC-verified against the raw body before anything is looked at.
 *
 * @package StableCart
 */

defined( 'ABSPATH' ) || exit;

class StableCart_Webhook {

	const ENDPOINT          = 'stablecart';
	const TOLERANCE_SECONDS = 300;

	public static function init() {
		add_action( 'woocommerce_api_' . self::ENDPOINT, array( __CLASS__, 'handle' ) );
	}

	public static function handle() {
		// The signature covers the raw bytes, so the body is read unmodified and
		// verified before anything in it is looked at. Every value taken out of it
		// afterwards is validated against the shape it must have, and sanitized.
		$raw       = (string) file_get_contents( 'php://input' ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- signed webhook, not a form.
		$timestamp = isset( $_SERVER['HTTP_X_STABLECART_TIMESTAMP'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_X_STABLECART_TIMESTAMP'] ) ) : '';
		$signature = isset( $_SERVER['HTTP_X_STABLECART_SIGNATURE'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_X_STABLECART_SIGNATURE'] ) ) : '';

		if ( ! self::verify( $raw, $timestamp, $signature, StableCart_API::webhook_secret() ) ) {
			self::respond( 401, array( 'error' => 'invalid signature' ) );
		}

		$event = json_decode( $raw, true );
		if ( ! is_array( $event ) || ! isset( $event['type'], $event['data'] ) || ! is_array( $event['data'] ) ) {
			self::respond( 400, array( 'error' => 'malformed event' ) );
		}

		// Not sanitize_key(): event names contain a dot ('payment.paid'), which it strips.
		$type = is_string( $event['type'] ) ? sanitize_text_field( $event['type'] ) : '';
		$data = self::clean( $event['data'] );

		switch ( $type ) {
			case 'merchant.verify':
				self::respond( 200, array( 'challenge' => self::text( $data, 'challenge' ) ) );
				break; // Unreachable; respond() exits.
			case 'payment.paid':
			case 'payment.underpaid':
				self::apply_payment( $type, $data );
				self::respond( 200, array( 'ok' => true ) );
				break;
			default:
				// Unknown events are acknowledged so the service does not retry them.
				self::respond( 200, array( 'ignored' => true ) );
		}
	}

	/**
	 * Sanitizes the decoded event: json_decode only parses, it does not clean.
	 * Every scalar becomes a sanitized string, recursively, and keys are keys.
	 *
	 * @param mixed $value Decoded JSON value.
	 * @return mixed Sanitized value.
	 */
	private static function clean( $value ) {
		if ( is_array( $value ) ) {
			$out = array();
			foreach ( $value as $key => $item ) {
				// Keys keep their case (the service sends camelCase) but nothing else.
				$clean_key         = is_string( $key ) ? preg_replace( '/[^A-Za-z0-9_-]/', '', $key ) : (int) $key;
				$out[ $clean_key ] = self::clean( $item );
			}
			return $out;
		}
		if ( is_bool( $value ) || is_null( $value ) ) {
			return $value;
		}
		return sanitize_text_field( (string) $value );
	}

	/**
	 * One sanitized string out of the event data.
	 *
	 * @param array  $data Sanitized event data.
	 * @param string $key  Key to read.
	 * @return string
	 */
	private static function text( $data, $key ) {
		return isset( $data[ $key ] ) && is_scalar( $data[ $key ] ) ? (string) $data[ $key ] : '';
	}

	/**
	 * A decimal amount out of the event data, or '' when it is not one.
	 *
	 * @param array  $data Sanitized event data.
	 * @param string $key  Key to read.
	 * @return string
	 */
	private static function amount( $data, $key ) {
		$value = self::text( $data, $key );
		return preg_match( '/^\d{1,12}(\.\d{1,6})?$/', $value ) ? $value : '';
	}

	/** HMAC-SHA256 over "{timestamp}.{rawBody}", constant-time, with a bounded replay window. */
	public static function verify( $raw, $timestamp, $signature, $secret ) {
		if ( '' === $secret || ! ctype_digit( (string) $timestamp ) ) {
			return false;
		}
		if ( abs( time() - (int) $timestamp ) > self::TOLERANCE_SECONDS ) {
			return false;
		}
		$presented = strtolower( preg_replace( '/^sha256=/i', '', $signature ) );
		if ( ! preg_match( '/^[0-9a-f]{64}$/', $presented ) ) {
			return false;
		}
		$expected = hash_hmac( 'sha256', $timestamp . '.' . $raw, $secret );
		return hash_equals( $expected, $presented );
	}

	private static function apply_payment( $type, $data ) {
		$order = self::order_from_ref( self::text( $data, 'orderRef' ) );
		if ( ! $order ) {
			return; // Not ours (another shop's ref, or a deleted order). Acknowledge and move on.
		}
		if ( 'stablecart' !== $order->get_payment_method() ) {
			return;
		}

		$session_id = self::text( $data, 'sessionId' );
		$tx         = isset( $data['transactions'][0]['txHash'] ) ? (string) $data['transactions'][0]['txHash'] : '';
		// A transaction hash is 32 bytes of hex; anything else does not go near an order note.
		$tx         = preg_match( '/^0x[0-9a-fA-F]{64}$/', $tx ) ? $tx : '';
		$received   = self::amount( $data, 'receivedUsdc' );
		$due        = self::amount( $data, 'amountUsdc' );
		$explorer   = $tx ? 'https://basescan.org/tx/' . rawurlencode( $tx ) : '';

		// The amount the widget was told to charge is recorded when the pay page
		// renders; a session for a different amount must not settle this order.
		$expected_usd = (string) $order->get_meta( '_stablecart_amount_usd' );
		$quoted_usd   = self::amount( $data, 'amountUsd' );
		if ( '' !== $expected_usd && '' !== $quoted_usd && ! self::same_dollar_amount( $expected_usd, $quoted_usd ) ) {
			$order->add_order_note(
				sprintf(
					/* translators: 1: amount quoted to the buyer, 2: amount this order expects */
					__( 'StableCart: ignored a payment quoted at $%1$s USD; this order expects $%2$s USD.', 'stablecart-for-woocommerce' ),
					$quoted_usd,
					$expected_usd
				)
			);
			return;
		}

		$order->update_meta_data( '_stablecart_session_id', $session_id );
		if ( $tx ) {
			$order->update_meta_data( '_stablecart_tx_hash', $tx );
		}

		if ( 'payment.paid' === $type ) {
			if ( $order->is_paid() ) {
				$order->save();
				return; // Already settled; a retried delivery.
			}
			$order->add_order_note(
				sprintf(
					/* translators: 1: USDC amount, 2: transaction link */
					__( 'StableCart: %1$s USDC received on Base. Transaction: %2$s', 'stablecart-for-woocommerce' ),
					$received,
					$explorer ? $explorer : $tx
				)
			);
			$order->payment_complete( $tx ? $tx : $session_id );
			return;
		}

		// Underpaid: money arrived, but not enough. Hold the order for a human.
		$order->update_status(
			'on-hold',
			sprintf(
				/* translators: 1: received USDC, 2: due USDC, 3: transaction link */
				__( 'StableCart: underpaid — %1$s of %2$s USDC received. Nothing is refunded automatically; contact the buyer. Transaction: %3$s', 'stablecart-for-woocommerce' ),
				$received,
				$due,
				$explorer ? $explorer : $tx
			)
		);
		$order->save();
	}

	/** Order refs are "WC-{order id}-{first 8 chars of the order key}", set by the gateway. */
	private static function order_from_ref( $ref ) {
		if ( ! preg_match( '/^WC-(\d+)-([A-Za-z0-9_]+)$/', $ref, $m ) ) {
			return null;
		}
		$order = wc_get_order( (int) $m[1] );
		if ( ! $order ) {
			return null;
		}
		// The key fragment stops a guessed order id from settling somebody else's order.
		if ( StableCart_Gateway::order_ref( $order ) !== $ref ) {
			return null;
		}
		return $order;
	}

	/** Dollar amounts with two decimals; comparing after rounding avoids needing bcmath. */
	private static function same_dollar_amount( $a, $b ) {
		return abs( round( (float) $a, 2 ) - round( (float) $b, 2 ) ) < 0.005;
	}

	private static function respond( $status, $body ) {
		status_header( $status );
		header( 'content-type: application/json; charset=utf-8' );
		echo wp_json_encode( $body );
		exit;
	}
}
