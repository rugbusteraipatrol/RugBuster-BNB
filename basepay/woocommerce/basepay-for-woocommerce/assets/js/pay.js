/* global basepayOrder */
( function () {
	var slot = document.getElementById( 'basepay-checkout' );
	if ( ! slot || ! window.BasePay || ! window.basepayOrder ) {
		return;
	}
	window.BasePay.mount( {
		merchantId: basepayOrder.merchantId,
		amountUsd: basepayOrder.amountUsd,
		orderRef: basepayOrder.orderRef,
		target: slot,
		locale: basepayOrder.locale,
		apiBaseUrl: basepayOrder.apiBaseUrl,
	} );
	// The order itself is completed by the webhook; the redirect only moves the
	// buyer on once the widget has seen the payment confirmed.
	slot.addEventListener( 'basepay:settled', function ( event ) {
		if ( event.detail && event.detail.status === 'paid' ) {
			setTimeout( function () {
				window.location.href = basepayOrder.returnUrl;
			}, 2500 );
		}
	} );
} )();
