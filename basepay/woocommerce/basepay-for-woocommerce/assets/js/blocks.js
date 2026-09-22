/* global wc, wp */
( function () {
	var settings = wc.wcSettings.getSetting( 'basepay_data', {} );
	var label = wp.htmlEntities.decodeEntities( settings.title || 'USDC on Base' );
	var el = wp.element.createElement;

	var Label = function () {
		return el(
			'span',
			{ style: { display: 'flex', alignItems: 'center', gap: '8px', width: '100%' } },
			label,
			settings.icon
				? el( 'img', { src: settings.icon, alt: '', style: { height: '20px', marginLeft: 'auto' } } )
				: null
		);
	};

	var Content = function () {
		return el( 'div', null, wp.htmlEntities.decodeEntities( settings.description || '' ) );
	};

	wc.wcBlocksRegistry.registerPaymentMethod( {
		name: 'basepay',
		label: el( Label ),
		content: el( Content ),
		edit: el( Content ),
		canMakePayment: function () {
			return true;
		},
		ariaLabel: label,
		supports: { features: settings.supports || [ 'products' ] },
	} );
} )();
