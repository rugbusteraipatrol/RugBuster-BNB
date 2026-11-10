/* global stablecartOrder */
( function () {
	var slot = document.getElementById( 'stablecart-checkout' );
	if ( ! slot || ! window.StableCart || ! window.stablecartOrder ) {
		return;
	}
	window.StableCart.mount( {
		merchantId: stablecartOrder.merchantId,
		amountUsd: stablecartOrder.amountUsd,
		orderRef: stablecartOrder.orderRef,
		target: slot,
		locale: stablecartOrder.locale,
		apiBaseUrl: stablecartOrder.apiBaseUrl,
	} );
	// The order itself is completed by the webhook; the redirect only moves the
	// buyer on once the widget has seen the payment confirmed.
	slot.addEventListener( 'stablecart:settled', function ( event ) {
		if ( event.detail && event.detail.status === 'paid' ) {
			setTimeout( function () {
				window.location.href = stablecartOrder.returnUrl;
			}, 2500 );
		}
	} );
} )();
