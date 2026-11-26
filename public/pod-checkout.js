/* ============================================================================
   pod-checkout.js — lets buyers choose "Pay on Delivery" in the order form.
   Add ONE line to products.html, AFTER products.js:
       <script src="pod-checkout.js"></script>
   Nothing else in products.html / products.js needs to change.
   ============================================================================ */
(function () {
  'use strict';
  if (window.__podCheckoutLoaded) return;
  window.__podCheckoutLoaded = true;

  var NOTE_ONLINE = null;

  function offersPod(p) {
    return !!p && p.type === 'physical' && (p.payment_option === 'pay_on_delivery' || p.payment_option === 'both');
  }

  function setNote(pod) {
    var box = document.getElementById('paymentBreakdown');
    if (!box) return;
    var note = box.lastElementChild;
    if (!note) return;
    if (NOTE_ONLINE === null) NOTE_ONLINE = note.innerHTML;
    note.innerHTML = pod
      ? '<i class="fas fa-hand-holding-dollar"></i> Pay the seller in cash when your order arrives. You\'ll get a delivery code by email — give it to the seller only after you have the item and have paid.'
      : NOTE_ONLINE;
    var strongs = box.querySelectorAll('strong');
    for (var i = 0; i < strongs.length; i++) {
      if (/Total to pay/i.test(strongs[i].textContent || '')) {
        strongs[i].textContent = pod ? 'Total to pay on delivery:' : 'Total to Pay:';
      }
    }
  }

  function inject() {
    var form = document.getElementById('addressForm');
    if (!form) return;
    var old = document.getElementById('podChooser');
    if (old) old.remove();
    NOTE_ONLINE = null;
    var p = (typeof currentProductForOrder !== 'undefined') ? currentProductForOrder : null;
    if (!offersPod(p)) return;

    var podOnly = p.payment_option === 'pay_on_delivery';
    var wrap = document.createElement('div');
    wrap.id = 'podChooser';
    wrap.style.cssText = 'margin-bottom:16px';
    var card = 'display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border:1px solid var(--border,#334155);border-radius:10px;cursor:pointer;margin-top:8px';
    wrap.innerHTML =
      '<label style="display:block;margin-bottom:4px;font-weight:500">How do you want to pay?</label>' +
      (podOnly ? '' :
        '<label style="' + card + '"><input type="radio" name="podPaymentMethod" value="online" checked style="margin-top:3px">' +
        '<span><strong>Pay online</strong><br><small style="opacity:.75">Card or transfer after the seller confirms. Protected by our 7-day refund window.</small></span></label>') +
      '<label style="' + card + '"><input type="radio" name="podPaymentMethod" value="pod"' + (podOnly ? ' checked' : '') + ' style="margin-top:3px">' +
      '<span><strong>Pay on delivery (cash)</strong><br><small style="opacity:.75">Pay the seller in cash when it arrives. ' +
      (podOnly ? 'This seller only accepts cash on delivery.' : '') + '</small></span></label>';

    var anchor = document.getElementById('paymentBreakdown');
    if (anchor) anchor.insertAdjacentElement('beforebegin', wrap); else form.insertBefore(wrap, form.firstChild);

    function refresh() {
      var r = form.querySelector('input[name="podPaymentMethod"]:checked');
      setNote(!!r && r.value === 'pod');
    }
    wrap.addEventListener('change', refresh);
    refresh();
  }

  // After the order form opens, add the chooser to the (freshly cloned) form.
  function wrapOpener() {
    var orig = window.orderPhysicalProduct;
    if (typeof orig !== 'function' || orig.__podWrapped) return;
    var wrapped = async function () {
      var r = await orig.apply(this, arguments);
      setTimeout(inject, 0);
      return r;
    };
    wrapped.__podWrapped = true;
    window.orderPhysicalProduct = wrapped;
  }
  wrapOpener();
  window.addEventListener('load', wrapOpener);

  // Tell the server which payment method was picked when the order is posted.
  var realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (url.indexOf('/api/physical-orders/create') !== -1 && init && typeof init.body === 'string') {
        var r = document.querySelector('#addressForm input[name="podPaymentMethod"]:checked');
        if (r && r.value === 'pod') {
          var body = JSON.parse(init.body);
          body.payment_method = 'pod';
          init = Object.assign({}, init, { body: JSON.stringify(body) });
        }
      }
    } catch (e) { /* never block a checkout because of this helper */ }
    return realFetch(input, init);
  };
})();