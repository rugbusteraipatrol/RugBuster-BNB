<?php
/**
 * The WooCommerce payment gateway.
 *
 * Checkout places the order and sends the buyer to the pay page, where the
 * BasePay widget quotes the order in USDC and shows a QR code. The order is
 * completed by the webhook, never by the browser.
 *
 * @package BasePay
 */

defined( 'ABSPATH' ) || exit;

class BasePay_Gateway extends WC_Payment_Gateway {

	public function __construct() {
		$this->id                 = 'basepay';
		$this->icon               = BASEPAY_WC_URL . 'assets/usdc.svg';
		$this->has_fields         = false;
		$this->method_title       = __( 'BasePay – USDC on Base', 'basepay-for-woocommerce' );
		$this->method_description = __( 'Buyers pay USDC on the Base network straight into your wallet. Nothing is held in between, there is no account to open and no fee on sales.', 'basepay-for-woocommerce' );
		$this->supports           = array( 'products' );

		$this->init_form_fields();
		$this->init_settings();

		$this->title       = $this->get_option( 'title', __( 'USDC on Base', 'basepay-for-woocommerce' ) );
		$this->description = $this->get_option( 'description' );

		add_action( 'woocommerce_update_options_payment_gateways_' . $this->id, array( $this, 'process_admin_options' ) );
		add_action( 'woocommerce_receipt_' . $this->id, array( $this, 'receipt_page' ) );
		add_action( 'admin_notices', array( $this, 'admin_notices' ) );
	}

	public function init_form_fields() {
		$this->form_fields = array(
			'enabled'        => array(
				'title'   => __( 'Enable/Disable', 'basepay-for-woocommerce' ),
				'type'    => 'checkbox',
				'label'   => __( 'Enable USDC payments', 'basepay-for-woocommerce' ),
				'default' => 'yes',
			),
			'wallet_address' => array(
				'title'       => __( 'Your wallet address', 'basepay-for-woocommerce' ),
				'type'        => 'text',
				'description' => __( 'Where the money goes. Any wallet on the Base network (MetaMask, Coinbase Wallet, Rabby, a hardware wallet…). Saving this connects the shop to BasePay; there is nothing else to set up.', 'basepay-for-woocommerce' ),
				'placeholder' => '0x…',
				'desc_tip'    => false,
			),
			'title'          => array(
				'title'       => __( 'Title', 'basepay-for-woocommerce' ),
				'type'        => 'text',
				'description' => __( 'What the buyer sees at checkout.', 'basepay-for-woocommerce' ),
				'default'     => __( 'USDC on Base', 'basepay-for-woocommerce' ),
				'desc_tip'    => true,
			),
			'description'    => array(
				'title'       => __( 'Description', 'basepay-for-woocommerce' ),
				'type'        => 'textarea',
				'description' => __( 'Shown under the title at checkout.', 'basepay-for-woocommerce' ),
				'default'     => __( 'Pay with USDC from any wallet: scan a QR code with your phone or pay from a browser wallet. No account needed.', 'basepay-for-woocommerce' ),
				'desc_tip'    => true,
			),
			'usd_rate'       => array(
				'title'       => __( 'Manual USD rate (optional)', 'basepay-for-woocommerce' ),
				'type'        => 'text',
				'description' => sprintf(
					/* translators: %s: store currency code */
					__( 'How many %s one US dollar is worth. Leave empty to use a daily market rate. Ignored when the store currency is USD.', 'basepay-for-woocommerce' ),
					get_woocommerce_currency()
				),
				'placeholder' => 'USD' === get_woocommerce_currency() ? '1' : '',
				'desc_tip'    => false,
			),
		);
	}

	/** Connection status and plan usage above the settings form. */
	public function admin_options() {
		echo '<h2>' . esc_html( $this->get_method_title() ) . '</h2>';
		echo '<p>' . esc_html( $this->get_method_description() ) . '</p>';
		$this->render_status();
		echo '<table class="form-table">';
		$this->generate_settings_html();
		echo '</table>';
	}

	private function render_status() {
		if ( ! BasePay_API::is_connected() ) {
			echo '<div class="notice notice-info inline"><p>' . esc_html__( 'Not connected yet. Paste your wallet address below and save: the shop registers itself with BasePay and is ready to take payments.', 'basepay-for-woocommerce' ) . '</p></div>';
			return;
		}
		$view = BasePay_API::merchant_view();
		if ( is_wp_error( $view ) ) {
			echo '<div class="notice notice-warning inline"><p>' . esc_html( sprintf(
				/* translators: %s: error message */
				__( 'Connected, but the BasePay service could not be reached just now: %s', 'basepay-for-woocommerce' ),
				$view->get_error_message()
			) ) . '</p></div>';
			return;
		}
		$plan  = isset( $view['plan'] ) ? $view['plan'] : 'free';
		$used  = isset( $view['usage']['paidOrders'] ) ? (int) $view['usage']['paidOrders'] : 0;
		$limit = isset( $view['usage']['limit'] ) ? $view['usage']['limit'] : null;

		echo '<div class="notice notice-success inline"><p>';
		echo '<strong>' . esc_html__( 'Connected.', 'basepay-for-woocommerce' ) . '</strong> ';
		echo esc_html( sprintf(
			/* translators: 1: merchant id, 2: wallet address */
			__( 'Merchant %1$s, paying out to %2$s.', 'basepay-for-woocommerce' ),
			$view['merchantId'],
			$view['walletAddress']
		) );
		echo '<br>';
		$upgrade_url = isset( $view['upgrade']['url'] ) ? (string) $view['upgrade']['url'] : '';
		$price       = isset( $view['upgrade']['priceUsd'] ) ? (string) $view['upgrade']['priceUsd'] : '12.00';
		$expires     = ! empty( $view['planExpiresAt'] ) ? strtotime( (string) $view['planExpiresAt'] ) : 0;

		if ( 'pro' === $plan ) {
			if ( $expires ) {
				echo esc_html( sprintf(
					/* translators: %s: date the Pro plan ends */
					__( 'Plan: Pro — unlimited orders until %s.', 'basepay-for-woocommerce' ),
					wp_date( get_option( 'date_format' ), $expires )
				) );
				if ( $upgrade_url ) {
					echo ' <a href="' . esc_url( $upgrade_url ) . '" target="_blank" rel="noopener">' . esc_html( sprintf(
						/* translators: %s: price in USD */
						__( 'Add 30 days ($%s)', 'basepay-for-woocommerce' ),
						$price
					) ) . '</a>';
				}
			} else {
				echo esc_html__( 'Plan: Pro — unlimited orders.', 'basepay-for-woocommerce' );
			}
		} elseif ( null === $limit ) {
			echo esc_html( sprintf(
				/* translators: %d: number of paid orders this month */
				__( 'Plan: Free — %d paid orders this month.', 'basepay-for-woocommerce' ),
				$used
			) );
		} else {
			echo esc_html( sprintf(
				/* translators: 1: paid orders this month, 2: monthly limit */
				__( 'Plan: Free — %1$d of %2$d paid orders used this month.', 'basepay-for-woocommerce' ),
				$used,
				$limit
			) );
			echo ' ' . esc_html__( 'Once the limit is reached, buyers see USDC as unavailable until next month.', 'basepay-for-woocommerce' );
			if ( $upgrade_url ) {
				echo '</p><p><a class="button button-primary" href="' . esc_url( $upgrade_url ) . '" target="_blank" rel="noopener">' . esc_html( sprintf(
					/* translators: %s: price in USD */
					__( 'Upgrade to Pro — $%s for 30 days', 'basepay-for-woocommerce' ),
					$price
				) ) . '</a> ' . esc_html__( 'Paid in USDC; Pro switches on by itself.', 'basepay-for-woocommerce' );
			}
		}
		echo '</p></div>';
	}

	/**
	 * Saving the settings is the whole onboarding: a new or changed wallet
	 * address registers the shop, or moves its payout, on the service.
	 */
	public function process_admin_options() {
		$saved  = parent::process_admin_options();
		$wallet = trim( (string) $this->get_option( 'wallet_address' ) );

		if ( '' === $wallet ) {
			return $saved;
		}
		if ( ! preg_match( '/^0x[0-9a-fA-F]{40}$/', $wallet ) ) {
			$this->flash( 'error', __( 'That does not look like a wallet address. It should start with 0x and be 42 characters long.', 'basepay-for-woocommerce' ) );
			return $saved;
		}

		$connected_wallet = (string) get_option( BasePay_API::OPTION_WALLET );
		if ( BasePay_API::is_connected() && 0 === strcasecmp( $connected_wallet, $wallet ) ) {
			return $saved;
		}

		$result = BasePay_API::is_connected() ? BasePay_API::update_wallet( $wallet ) : BasePay_API::register( $wallet );
		if ( is_wp_error( $result ) ) {
			$this->flash( 'error', $this->explain( $result ) );
			return $saved;
		}
		$this->flash( 'success', __( 'Connected to BasePay. Your shop can take USDC payments now.', 'basepay-for-woocommerce' ) );
		return $saved;
	}

	/** Turns a service error into something a shop owner can act on. */
	private function explain( WP_Error $error ) {
		switch ( $error->get_error_code() ) {
			case 'WEBHOOK_UNREACHABLE':
				return __( 'BasePay could not reach this site. The shop must be on a public https address (not localhost or a staging site behind a password) so payment notifications can arrive.', 'basepay-for-woocommerce' );
			case 'WEBHOOK_REJECTED':
			case 'WEBHOOK_CHALLENGE_MISMATCH':
				return __( 'BasePay reached this site but the reply was wrong. A security plugin or a cache may be blocking ?wc-api=basepay. Allow that URL and save again.', 'basepay-for-woocommerce' );
			case 'INVALID_WEBHOOK_URL':
				return __( 'BasePay needs this site to be reachable over https from the internet.', 'basepay-for-woocommerce' );
			case 'INVALID_ADDRESS':
				return __( 'The wallet address failed its checksum. Copy it again from your wallet.', 'basepay-for-woocommerce' );
			case 'RATE_LIMITED':
				return __( 'Too many connection attempts. Wait an hour and save again.', 'basepay-for-woocommerce' );
			default:
				return sprintf(
					/* translators: %s: error message */
					__( 'Could not connect to BasePay: %s', 'basepay-for-woocommerce' ),
					$error->get_error_message()
				);
		}
	}

	private function flash( $type, $message ) {
		set_transient( 'basepay_admin_notice', array( 'type' => $type, 'message' => $message ), 60 );
	}

	public function admin_notices() {
		$notice = get_transient( 'basepay_admin_notice' );
		if ( ! is_array( $notice ) ) {
			return;
		}
		delete_transient( 'basepay_admin_notice' );
		printf( '<div class="notice notice-%1$s is-dismissible"><p>%2$s</p></div>', esc_attr( $notice['type'] ), esc_html( $notice['message'] ) );
	}

	public function is_available() {
		if ( ! parent::is_available() || ! BasePay_API::is_connected() ) {
			return false;
		}
		return null !== BasePay_Rates::units_per_usd( get_woocommerce_currency(), $this->get_option( 'usd_rate' ) );
	}

	/** "WC-{id}-{key fragment}": the fragment keeps a guessed id from matching. */
	public static function order_ref( WC_Order $order ) {
		return 'WC-' . $order->get_id() . '-' . substr( str_replace( 'wc_order_', '', $order->get_order_key() ), 0, 8 );
	}

	public function process_payment( $order_id ) {
		$order = wc_get_order( $order_id );
		$usd   = BasePay_Rates::to_usd( $order->get_total(), $order->get_currency(), $this->get_option( 'usd_rate' ) );
		if ( null === $usd || $usd < 0.01 ) {
			wc_add_notice( __( 'USDC payment is not available right now. Please choose another payment method.', 'basepay-for-woocommerce' ), 'error' );
			return array( 'result' => 'failure' );
		}

		$order->update_meta_data( '_basepay_amount_usd', number_format( $usd, 2, '.', '' ) );
		$order->update_status( 'pending', __( 'Awaiting USDC payment on Base.', 'basepay-for-woocommerce' ) );
		$order->save();

		return array(
			'result'   => 'success',
			'redirect' => $order->get_checkout_payment_url( true ),
		);
	}

	/** The pay page: mounts the BasePay widget for this order. */
	public function receipt_page( $order_id ) {
		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			return;
		}
		if ( $order->is_paid() ) {
			echo '<p>' . esc_html__( 'This order is already paid. Thank you!', 'basepay-for-woocommerce' ) . '</p>';
			return;
		}

		$usd = (string) $order->get_meta( '_basepay_amount_usd' );
		if ( '' === $usd ) {
			$usd = BasePay_Rates::to_usd( $order->get_total(), $order->get_currency(), $this->get_option( 'usd_rate' ) );
			$usd = null === $usd ? '' : number_format( $usd, 2, '.', '' );
			if ( '' !== $usd ) {
				$order->update_meta_data( '_basepay_amount_usd', $usd );
				$order->save();
			}
		}
		if ( '' === $usd ) {
			echo '<p>' . esc_html__( 'USDC payment is not available right now. Please contact the shop.', 'basepay-for-woocommerce' ) . '</p>';
			return;
		}

		$config = array(
			'apiBaseUrl' => basepay_wc_api_base_url(),
			'merchantId' => BasePay_API::merchant_id(),
			'amountUsd'  => $usd,
			'orderRef'   => self::order_ref( $order ),
			'locale'     => substr( get_locale(), 0, 2 ),
			'returnUrl'  => $order->get_checkout_order_received_url(),
		);

		wp_enqueue_script( 'basepay-widget', basepay_wc_api_base_url() . '/widget/widget.js', array(), BASEPAY_WC_VERSION, true );
		wp_enqueue_script( 'basepay-pay', BASEPAY_WC_URL . 'assets/js/pay.js', array( 'basepay-widget' ), BASEPAY_WC_VERSION, true );
		wp_localize_script( 'basepay-pay', 'basepayOrder', $config );

		if ( 'USD' !== $order->get_currency() ) {
			printf(
				'<p class="basepay-rate">%s</p>',
				esc_html( sprintf(
					/* translators: 1: order total in store currency, 2: USD amount */
					__( 'Your total of %1$s is %2$s USD at today\'s rate. Pay that amount in USDC below.', 'basepay-for-woocommerce' ),
					wp_strip_all_tags( wc_price( $order->get_total(), array( 'currency' => $order->get_currency() ) ) ),
					'$' . $usd
				) )
			);
		}
		echo '<div id="basepay-checkout" style="max-width:480px"></div>';
	}
}
