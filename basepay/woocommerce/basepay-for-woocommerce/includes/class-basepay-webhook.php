<?php
/**
 * Receives BasePay webhooks at /?wc-api=basepay.
 *
 * Three events: `merchant.verify` (answered during Connect, proves this site
 * holds the secret), `payment.paid` (order paid) and `payment.underpaid`
 * (order on hold with a note saying how much arrived). Every request is
 * HMAC-verified against the raw body before anything is looked at.
 *
 * @package BasePay
 */

defined( 'ABSPATH' ) || exit;

class BasePay_Webhook {

	const ENDPOINT          = 'basepay';
	const TOLERANCE_SECONDS = 300;

	public static function init() {
		add_action( 'woocommerce_api_' . self::ENDPOINT, array( __CLASS__, 'handle' ) );
	}

	public static function handle() {
		$raw       = file_get_contents( 'php://input' );
		$timestamp = isset( $_SERVER['HTTP_X_BASEPAY_TIMESTAMP'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_X_BASEPAY_TIMESTAMP'] ) ) : '';
		$signature = isset( $_SERVER['HTTP_X_BASEPAY_SIGNATURE'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_X_BASEPAY_SIGNATURE'] ) ) : '';

		if ( ! self::verify( $raw, $timestamp, $signature, BasePay_API::webhook_secret() ) ) {
			self::respond( 401, array( 'error' => 'invalid signature' ) );
		}

		$event = json_decode( $raw, true );
		if ( ! is_array( $event ) || ! isset( $event['type'], $event['data'] ) || ! is_array( $event['data'] ) ) {
			self::respond( 400, array( 'error' => 'malformed event' ) );
		}

		switch ( $event['type'] ) {
			case 'merchant.verify':
				self::respond( 200, array( 'challenge' => isset( $event['data']['challenge'] ) ? (string) $event['data']['challenge'] : '' ) );
				break; // Unreachable; respond() exits.
			case 'payment.paid':
			case 'payment.underpaid':
				self::apply_payment( $event['type'], $event['data'] );
				self::respond( 200, array( 'ok' => true ) );
				break;
			default:
				// Unknown events are acknowledged so the service does not retry them.
				self::respond( 200, array( 'ignored' => true ) );
		}
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
		$order = self::order_from_ref( isset( $data['orderRef'] ) ? (string) $data['orderRef'] : '' );
		if ( ! $order ) {
			return; // Not ours (another shop's ref, or a deleted order). Acknowledge and move on.
		}
		if ( 'basepay' !== $order->get_payment_method() ) {
			return;
		}

		$session_id = isset( $data['sessionId'] ) ? sanitize_text_field( (string) $data['sessionId'] ) : '';
		$tx         = isset( $data['transactions'][0]['txHash'] ) ? sanitize_text_field( (string) $data['transactions'][0]['txHash'] ) : '';
		$received   = isset( $data['receivedUsdc'] ) ? sanitize_text_field( (string) $data['receivedUsdc'] ) : '';
		$due        = isset( $data['amountUsdc'] ) ? sanitize_text_field( (string) $data['amountUsdc'] ) : '';
		$explorer   = $tx ? 'https://basescan.org/tx/' . rawurlencode( $tx ) : '';

		// The amount the widget was told to charge is recorded when the pay page
		// renders; a session for a different amount must not settle this order.
		$expected_usd = (string) $order->get_meta( '_basepay_amount_usd' );
		$quoted_usd   = isset( $data['amountUsd'] ) ? (string) $data['amountUsd'] : '';
		if ( '' !== $expected_usd && '' !== $quoted_usd && ! self::same_dollar_amount( $expected_usd, $quoted_usd ) ) {
			$order->add_order_note(
				sprintf(
					/* translators: 1: amount quoted to the buyer, 2: amount this order expects */
					__( 'BasePay: ignored a payment quoted at $%1$s USD; this order expects $%2$s USD.', 'basepay-for-woocommerce' ),
					$quoted_usd,
					$expected_usd
				)
			);
			return;
		}

		$order->update_meta_data( '_basepay_session_id', $session_id );
		if ( $tx ) {
			$order->update_meta_data( '_basepay_tx_hash', $tx );
		}

		if ( 'payment.paid' === $type ) {
			if ( $order->is_paid() ) {
				$order->save();
				return; // Already settled; a retried delivery.
			}
			$order->add_order_note(
				sprintf(
					/* translators: 1: USDC amount, 2: transaction link */
					__( 'BasePay: %1$s USDC received on Base. Transaction: %2$s', 'basepay-for-woocommerce' ),
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
				__( 'BasePay: underpaid — %1$s of %2$s USDC received. Nothing is refunded automatically; contact the buyer. Transaction: %3$s', 'basepay-for-woocommerce' ),
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
		if ( BasePay_Gateway::order_ref( $order ) !== $ref ) {
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
