/* LAUNDRY GURU: small browser-only order system.
   HTML holds the pages and garment prices. CSS controls appearance.
   This file remembers choices, adds the bill and runs forms.
   No payment provider, shop, transport service or database is connected. */
'use strict';
document.documentElement.classList.add('js');

// 1. SETTINGS: bulk/transport prices and the optional WhatsApp link.
// Leave this empty until the business approves its WhatsApp link.
const whatsappLink = '';
const pricePerKilogram = 8000;
const pricePerBasket = 35000;
const pickupAndReturnPrice = 10000;
// Keep the original storage names so existing saved orders remain available.
const storageNames = { draft: 'laundry-haven-draft', orders: 'laundry-haven-orders', complaints: 'laundry-haven-complaints' };
const serviceNames = { washing: 'Washing', 'dry-cleaning': 'Dry cleaning', ironing: 'Ironing' };
function isService(name) { return ['washing', 'dry-cleaning', 'ironing'].includes(name); }
const speedNames = { express: 'Express · about 4 opening hours', standard: 'Standard · about 24 hours', economy: 'Economy · about 48 hours' };
const page = document.body.dataset.page;
const address = new URLSearchParams(window.location.search);
let storageWorks = true;

// 2. STORAGE: remember details on this browser, with a clear failure message.
function showStorageError() {
  storageWorks = false;
  const message = document.getElementById('storage-message');
  message.hidden = false;
  message.textContent = 'Browser storage is unavailable. You can read this site, but orders cannot be saved. Allow site storage and reload to try a order.';
}
function readStorage(name, fallback) {
  try { return JSON.parse(localStorage.getItem(name)) || fallback; }
  catch (error) { return fallback; }
}
function saveStorage(name, value) {
  try { localStorage.setItem(name, JSON.stringify(value)); return true; }
  catch (error) { showStorageError(); return false; }
}
try { localStorage.setItem('laundry-haven-check', 'ok'); localStorage.removeItem('laundry-haven-check'); }
catch (error) { showStorageError(); }
let draft = readStorage(storageNames.draft, {});
if (!draft || typeof draft !== 'object' || Array.isArray(draft)) draft = {};
if (!isService(draft.service)) draft.service = 'washing';
if (!Array.isArray(draft.items)) draft.items = [];
draft.items = draft.items.filter(function (item) {
  return item && typeof item.id === 'string' && typeof item.name === 'string' && Number.isFinite(item.price) && item.price > 0 && Number.isInteger(item.count) && item.count > 0 && item.count <= 100;
});
if (!['item', 'kg', 'basket'].includes(draft.method)) draft.method = 'item';
if (!['express', 'standard', 'economy'].includes(draft.speed)) draft.speed = 'standard';
if (!['dropoff', 'pickup'].includes(draft.delivery)) draft.delivery = 'dropoff';
if (!['deposit', 'full'].includes(draft.package)) draft.package = 'deposit';
if (!['mtn', 'airtel'].includes(draft.network)) draft.network = 'mtn';
if (!Number.isFinite(draft.bulk) || draft.bulk <= 0) draft.bulk = 1;
function rememberDraft() { return saveStorage(storageNames.draft, draft); }
function storedOrders() {
  const orders = readStorage(storageNames.orders, []);
  if (!Array.isArray(orders)) return [];
  return orders.filter(function (order) {
    return order && /^[A-Z0-9]{6}$/.test(order.reference) && typeof order.invoice === 'string' &&
      typeof order.transaction === 'string' && isService(order.service) &&
      Array.isArray(order.items) && order.items.every(function (item) {
        return item && typeof item.name === 'string' && Number.isFinite(item.price) && Number.isInteger(item.count);
      }) && order.cost && Number.isFinite(order.cost.balance);
  });
}

// 3. SMALL HELPERS: format money and safely put text into an HTML summary.
function money(amount) { return 'UGX ' + Math.round(amount).toLocaleString('en-UG'); }
function safeText(value) {
  return String(value).replace(/[&<>"']/g, function (letter) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[letter];
  });
}
function selectedValue(form, name) { return form.elements[name].value; }
function selectRadio(form, name, value) {
  const radio = form.querySelector('input[name="' + name + '"][value="' + value + '"]');
  if (radio) radio.checked = true;
}
function hasQuantity() { return draft.items.length > 0 && draft.quantityReady === true; }
function goTo(file, step) { window.location.href = file + '?service=' + draft.service + '&step=' + step; }
function markStep(step) {
  const stages = ['clothes', 'quantity', 'delivery', 'payment'];
  document.querySelectorAll('.steps li').forEach(function (entry) {
    const stage = entry.dataset.step;
    if (stage === step) entry.setAttribute('aria-current', 'step');
    if (stages.indexOf(stage) < stages.indexOf(step)) {
      const file = stages.indexOf(stage) < 2 ? 'products.html' : 'pay.html';
      entry.innerHTML = '<a href="' + file + '?service=' + draft.service + '&step=' + stage + '">' + entry.innerHTML + '</a>';
    }
  });
}

// 4. BILL: used by the basket, payment form and final receipt.
// A speed adjustment affects cleaning only. Transport is added afterwards.
function bill(order) {
  let cleaning = 0;
  order.items.forEach(function (item) { cleaning += item.price * item.count; });
  if (order.method === 'kg') cleaning = order.bulk * pricePerKilogram;
  if (order.method === 'basket') cleaning = order.bulk * pricePerBasket;
  const speedChange = Math.round(cleaning * (order.speed === 'express' ? 0.5 : order.speed === 'economy' ? -0.1 : 0));
  const transport = order.delivery === 'pickup' ? pickupAndReturnPrice : 0;
  const total = cleaning + speedChange + transport;
  const due = order.package === 'full' ? total : Math.ceil(total / 2);
  return { cleaning: cleaning, speedChange: speedChange, transport: transport, total: total, due: due, balance: total - due };
}
function quantityDescription(order) {
  if (order.method === 'kg') return order.bulk + ' kg · ' + money(pricePerKilogram) + ' / kg';
  if (order.method === 'basket') return order.bulk + ' basket(s) · up to 6 kg each';
  return 'Per cloth · ' + order.items.reduce(function (sum, item) { return sum + item.count; }, 0) + ' item(s)';
}
function summaryHtml(order, showClothes) {
  if (!order.items.length) return '<p>Select clothes to begin your estimate.</p>';
  const cost = bill(order);
  let html = '';
  if (showClothes !== false) {
    html = '<strong>' + serviceNames[order.service] + '</strong><ul class="summary-items">';
    order.items.forEach(function (item) {
      html += '<li>' + (order.method === 'item' ? item.count + ' × ' : '') + safeText(item.name) + '</li>';
    });
    html += '</ul><p class="small">' + safeText(quantityDescription(order)) + '</p>';
  }
  html += '<div class="summary-line"><span>Cleaning estimate</span><span>' + money(cost.cleaning) + '</span></div>';
  if (order.deliveryReady) {
    html += '<div class="summary-line"><span>' + (order.speed === 'economy' ? 'Economy discount' : order.speed === 'express' ? 'Express charge' : 'Standard service') + '</span><span>' + money(cost.speedChange) + '</span></div>';
    html += '<div class="summary-line"><span>Pickup & return</span><span>' + money(cost.transport) + '</span></div>';
  }
  html += '<div class="summary-line summary-total"><span>' + (order.deliveryReady ? 'Total' : 'Before pickup & time') + '</span><span>' + money(order.deliveryReady ? cost.total : cost.cleaning) + '</span></div>';
  if (order.deliveryReady) html += '<div class="summary-line"><span>Due now (' + (order.package === 'full' ? '100%' : '50%') + ')</span><span>' + money(cost.due) + '</span></div>';
  return html;
}
function updateSummary() {
  document.querySelectorAll('[data-summary]').forEach(function (box) { box.innerHTML = summaryHtml(draft); });
  const due = document.getElementById('amount-due');
  if (due) due.textContent = money(bill(draft).due);
}

// 5. PRODUCTS, STEP 1: select the service and garment types.
// Connected to #clothes-form and each .product-card in products.html.
function startProducts() {
  const requestedService = address.get('service');
  if (address.get('new') === '1' || (isService(requestedService) && requestedService !== draft.service)) {
    draft = { service: isService(requestedService) ? requestedService : 'washing', items: [], method: 'item', bulk: 1, delivery: 'dropoff', speed: 'standard', package: 'deposit', network: 'mtn' };
    rememberDraft();
    // Starting another order is a one-time action, even after Refresh or Back.
    if (address.get('new') === '1') window.history.replaceState(null, '', 'products.html?service=' + draft.service + '&step=clothes');
  }
  if (address.get('step') === 'quantity' && draft.items.length) { startQuantity(); return; }
  markStep('clothes');
  document.getElementById('service-title').textContent = serviceNames[draft.service];
  document.getElementById('service-note').textContent = draft.service === 'ironing' ? 'Bring clean, dry clothes. Select the items you would like pressed.' : 'Select all the kinds of clothes you have. Add quantities in the next step.';
  document.querySelector('[data-service="' + draft.service + '"]').setAttribute('aria-current', 'true');
  const cards = document.querySelectorAll('.product-card');
  cards.forEach(function (card) {
    const price = Number(card.getAttribute('data-' + draft.service));
    const input = card.querySelector('input');
    input.disabled = !price;
    input.checked = Boolean(price && draft.items.find(function (item) { return item.id === input.value; }));
    card.classList.toggle('unavailable', !price);
    card.querySelector('.product-price').textContent = price ? money(price) + ' / item' : 'Not offered for this service';
    card.querySelector('.product-select').textContent = price ? (input.checked ? 'Selected ✓' : 'Select item') : 'Choose washing for this item';
  });
  function rememberClothes() {
    const previousItems = draft.items;
    draft.items = [];
    cards.forEach(function (card) {
      const input = card.querySelector('input');
      if (input.checked && !input.disabled) {
        const previous = previousItems.find(function (item) { return item.id === input.value; });
        draft.items.push({ id: input.value, name: card.querySelector('.product-name').textContent.trim(), price: Number(card.getAttribute('data-' + draft.service)), special: ['jacket', 'suit', 'bedding', 'gown'].includes(input.value), count: previous ? previous.count : 1 });
      }
      if (!input.disabled) card.querySelector('.product-select').textContent = input.checked ? 'Selected ✓' : 'Select item';
    });
    if (draft.items.some(function (item) { return item.special; })) draft.method = 'item';
    draft.quantityReady = false;
    draft.deliveryReady = false;
    rememberDraft();
    updateSummary();
  }
  document.getElementById('clothes-form').addEventListener('change', rememberClothes);
  document.getElementById('clothes-form').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!draft.items.length) { document.getElementById('clothes-error').textContent = 'Choose at least one type of clothing to continue.'; return; }
    if (rememberDraft()) goTo('products.html', 'quantity');
  });
  updateSummary();
}

// 6. PRODUCTS, STEP 2: count each item, or choose kilograms/baskets.
// Connected to #quantity-form. Special-care items always use per-cloth pricing.
function startQuantity() {
  document.getElementById('clothes-section').hidden = true;
  document.getElementById('quantity-section').hidden = false;
  document.querySelector('h1').textContent = 'Choose your quantity';
  document.getElementById('step-description').textContent = 'Step 2 of 4 · ' + serviceNames[draft.service] + ' · Choose how to price your laundry.';
  document.getElementById('back-to-clothes').href = 'products.html?service=' + draft.service + '&step=clothes';
  markStep('quantity');
  const form = document.getElementById('quantity-form');
  const bulkAllowed = draft.service === 'washing' && !draft.items.some(function (item) { return item.special; });
  if (!bulkAllowed) {
    draft.method = 'item';
    document.getElementById('kg-choice').hidden = true;
    document.getElementById('basket-choice').hidden = true;
    form.elements.method.forEach(function (radio) { if (radio.value !== 'item') radio.disabled = true; });
    document.getElementById('quantity-note').textContent = 'These clothes use per-cloth pricing. Enter a count for every selected type.';
  }
  selectRadio(form, 'method', draft.method);
  document.getElementById('item-quantities').innerHTML = draft.items.map(function (item, index) {
    return '<div class="quantity-row"><label for="count-' + index + '">' + safeText(item.name) + '<small>' + money(item.price) + ' each</small></label><input id="count-' + index + '" type="number" min="1" max="100" step="1" required value="' + item.count + '"><strong id="line-' + index + '">' + money(item.price * item.count) + '</strong></div>';
  }).join('');
  document.getElementById('bulk-count').value = draft.bulk;
  function updateMethod(resetBulk) {
    draft.method = selectedValue(form, 'method');
    const isItem = draft.method === 'item';
    document.getElementById('item-quantities').hidden = !isItem;
    document.getElementById('bulk-quantity').hidden = isItem;
    document.querySelectorAll('.quantity-row input').forEach(function (input) { input.disabled = !isItem; });
    const bulk = document.getElementById('bulk-count');
    bulk.disabled = isItem;
    bulk.required = !isItem;
    bulk.min = draft.method === 'kg' ? '0.5' : '1';
    bulk.step = draft.method === 'kg' ? '0.5' : '1';
    bulk.max = draft.method === 'kg' ? '100' : '20';
    if (resetBulk && !bulk.checkValidity()) { bulk.value = 1; draft.bulk = 1; }
    document.getElementById('bulk-label').textContent = draft.method === 'kg' ? 'How many kilograms? (half-kilograms allowed)' : 'How many baskets? (up to 6 kg in each)';
    document.getElementById('bulk-help').textContent = 'The shop would check the actual ' + (draft.method === 'kg' ? 'weight' : 'basket count and weight') + ' and confirm any price change before cleaning.';
    updateSummary();
  }
  form.addEventListener('input', function (event) {
    if (event.target.name === 'method') updateMethod(true);
    draft.items.forEach(function (item, index) {
      const input = document.getElementById('count-' + index);
      if (input.checkValidity() && input.value) item.count = Number(input.value);
      document.getElementById('line-' + index).textContent = money(item.price * item.count);
    });
    const bulk = document.getElementById('bulk-count');
    if (!bulk.disabled && bulk.checkValidity()) draft.bulk = Number(bulk.value);
    draft.deliveryReady = false;
    draft.quantityReady = false;
    updateSummary();
    rememberDraft();
  });
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    draft.quantityReady = true;
    draft.deliveryReady = false;
    if (rememberDraft()) goTo('pay.html', 'delivery');
  });
  updateMethod(true);
}

// 7. PAY, STEP 3: choose drop-off/pickup and the cleaning speed.
// Connected to #delivery-form in pay.html.
function startDelivery() {
  document.getElementById('delivery-section').hidden = false;
  document.getElementById('pay-title').textContent = 'Choose pickup & time';
  document.getElementById('step-description').textContent = 'Step 3 of 4 · ' + serviceNames[draft.service] + ' · Choose how and when.';
  markStep('delivery');
  const form = document.getElementById('delivery-form');
  selectRadio(form, 'delivery', draft.delivery);
  selectRadio(form, 'speed', draft.speed);
  const area = document.getElementById('pickup-area');
  area.value = draft.area || '';
  function updateDelivery() {
    draft.delivery = selectedValue(form, 'delivery');
    draft.speed = selectedValue(form, 'speed');
    draft.area = draft.delivery === 'pickup' ? area.value : '';
    area.required = draft.delivery === 'pickup';
    area.disabled = draft.delivery !== 'pickup';
    document.getElementById('pickup-details').hidden = draft.delivery !== 'pickup';
    draft.deliveryReady = true;
    rememberDraft();
    updateSummary();
  }
  form.addEventListener('change', updateDelivery);
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    updateDelivery();
    if (rememberDraft()) goTo('pay.html', 'payment');
  });
  updateDelivery();
}

// 8. REVIEW: show every decision, with links back to the right step.
function reviewHtml(order, editable) {
  const rows = [
    [serviceNames[order.service], order.items.map(function (item) { return (order.method === 'item' ? item.count + ' × ' : '') + item.name; }).join(', '), 'products.html?step=clothes'],
    ['Quantity', quantityDescription(order), 'products.html?step=quantity'],
    ['Pickup / drop-off', order.delivery === 'pickup' ? 'Pickup & return · ' + order.area : 'I will bring and collect my clothes', 'pay.html?step=delivery'],
    ['Ready time', speedNames[order.speed], 'pay.html?step=delivery']
  ];
  return rows.map(function (row) {
    return '<div class="review-row"><div><strong>' + safeText(row[0]) + '</strong><p>' + safeText(row[1]) + '</p></div>' + (editable ? '<a href="' + row[2] + '">Edit</a>' : '') + '</div>';
  }).join('');
}

// 9. PAY, STEP 4: payment only. Typing an ID never verifies payment.
// Connected to #payment-form. HTML requires a transaction ID and the agreement. Typing an ID does not verify payment.
function startPayment() {
  document.getElementById('payment-section').hidden = false;
  document.getElementById('pay-title').textContent = 'Review your order & payment';
  document.getElementById('step-description').textContent = 'Step 4 of 4 · Review your order and create a reference.';
  document.getElementById('review-details').innerHTML = reviewHtml(draft, true);
  markStep('payment');
  const form = document.getElementById('payment-form');
  selectRadio(form, 'package', draft.package);
  selectRadio(form, 'network', draft.network);
  form.addEventListener('change', function () {
    draft.package = selectedValue(form, 'package');
    draft.network = selectedValue(form, 'network');
    rememberDraft();
    updateSummary();
  });
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    const message = document.getElementById('payment-error');
    const transaction = document.getElementById('transaction-id').value.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{7,29}$/.test(transaction)) { message.textContent = 'Enter an 8–30 character transaction ID using letters, digits or hyphens.'; return; }
    const orders = storedOrders();
    if (orders.some(function (order) { return order.transaction.toUpperCase() === transaction.toUpperCase(); })) {
      message.textContent = 'That transaction ID is already linked to an order. Check the existing receipt or enter a different transaction ID.'; return;
    }
    const identity = nextReference(orders);
    if (!identity) { message.textContent = 'The daily order limit has been reached. Clear data on Policies to restart.'; return; }
    const order = Object.assign({}, draft, identity, { transaction: transaction, created: new Date().toISOString(), cost: bill(draft) });
    orders.push(order);
    if (saveStorage(storageNames.orders, orders)) {
      window.location.href = 'pay.html?step=complete&reference=' + order.reference;
    }
  });
  updateSummary();
}

// 10. REFERENCE: date + daily invoice count make a 6-character code.
// YY (2 digits) + day-of-year in base 36 (2) + daily number in base 36 (2).
// Base 36 means using 0–9 and A–Z. Codes are unique in this browser's saved list.
function nextReference(orders) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Kampala', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  function part(name) { return parts.find(function (entry) { return entry.type === name; }).value; }
  const year = part('year');
  const month = part('month');
  const day = part('day');
  const date = year + month + day;
  const dayOfYear = Math.floor((Date.UTC(Number(year), Number(month) - 1, Number(day)) - Date.UTC(Number(year), 0, 0)) / 86400000);
  // Count older LH invoices too, so changing the name does not reuse a number.
  const sameDay = orders.filter(function (order) {
    return order.invoice && (order.invoice.startsWith('LG-' + date + '-') || order.invoice.startsWith('LH-' + date + '-'));
  });
  let number = sameDay.reduce(function (highest, order) { return Math.max(highest, Number(order.invoice.split('-')[2]) || 0); }, 0) + 1;
  while (number < 1296) {
    const reference = year.slice(-2) + dayOfYear.toString(36).padStart(2, '0').toUpperCase() + number.toString(36).padStart(2, '0').toUpperCase();
    if (!orders.some(function (order) { return order.reference === reference; })) return { reference: reference, invoice: 'LG-' + date + '-' + String(number).padStart(4, '0') };
    number += 1;
  }
  return null;
}
function startReceipt() {
  const order = storedOrders().find(function (entry) { return entry.reference === address.get('reference'); });
  if (!order) return false;
  document.getElementById('complete-section').hidden = false;
  document.getElementById('pay-title').textContent = 'Your laundry reference';
  document.getElementById('step-description').textContent = 'Order saved · Keep this code to find your order again.';
  document.getElementById('receipt-reference').textContent = order.reference;
  document.getElementById('receipt-invoice').textContent = 'Invoice ' + order.invoice;
  document.getElementById('receipt-details').innerHTML = reviewHtml(order, false) + summaryHtml(order, false) + '<p>Payment method: ' + (order.network === 'mtn' ? 'MTN MoMo' : 'Airtel Money') + '<br>Transaction ID: ' + safeText(order.transaction) + '<br>Balance before return: ' + money(order.cost.balance) + '</p>';
  document.getElementById('receipt-track').href = 'index.html?reference=' + order.reference + '#track';
  document.getElementById('print-receipt').addEventListener('click', function () { window.print(); });
  document.getElementById('checkout-summary').hidden = true;
  document.getElementById('how-to-pay').hidden = true;
  document.querySelector('.steps').hidden = true;
  document.getElementById('checkout-layout').classList.add('finished-order');
  return true;
}
function startPayPage() {
  if (address.get('step') === 'complete' && startReceipt()) { document.getElementById('empty-order').hidden = true; return; }
  if (!hasQuantity()) { document.getElementById('checkout-summary').hidden = true; return; }
  document.getElementById('empty-order').hidden = true;
  if (address.get('step') === 'payment' && draft.deliveryReady && (draft.delivery !== 'pickup' || draft.area)) startPayment();
  else startDelivery();
}

// 11. HOME TRACKING: look up a saved code or the fixed DEMO01 order.
// Status does not advance with time; there is no staff system connected.
function startHome() {
  const trackForm = document.getElementById('track-form');
  function track() {
    const code = document.getElementById('track-code').value.trim().toUpperCase();
    const box = document.getElementById('track-result');
    const order = storedOrders().find(function (entry) { return entry.reference === code; });
    box.hidden = false;
    if (code === 'DEMO01') {
      box.innerHTML = '<h3>DEMO01 · Example order</h3><p><strong>Ready for collection · example</strong></p><ol class="status-line"><li>Received</li><li>Cleaning</li><li class="current">Ready</li><li>Returned</li></ol><p>This fixed example shows how an order status would look. Actual laundry progress is not connected to this website.</p>';
    } else if (order) {
      box.innerHTML = '<h3>' + safeText(code) + ' · ' + serviceNames[order.service] + '</h3><p><strong>Awaiting payment review</strong></p><ol class="status-line"><li class="current">Order saved</li><li>Payment review</li><li>Cleaning</li><li>Ready</li></ol><p>No payment has been verified and no pickup has been booked. This record is saved in this browser only.</p><p>Invoice: ' + safeText(order.invoice) + '</p><p><a href="pay.html?step=complete&reference=' + safeText(code) + '">View receipt →</a></p>';
    } else {
      box.innerHTML = '<h3>We could not find that code here</h3><p>Check the six characters. orders can only be found in the browser and website address where they were created. Try DEMO01 for an example.</p>';
    }
  }
  trackForm.addEventListener('submit', function (event) { event.preventDefault(); track(); });
  const incoming = address.get('reference');
  if (incoming && /^[A-Za-z0-9]{6}$/.test(incoming)) { document.getElementById('track-code').value = incoming; track(); }
  // Complaints are saved locally and explicitly never described as sent.
  document.getElementById('complaint-form').addEventListener('submit', function (event) {
    event.preventDefault();
    const code = document.getElementById('complaint-code').value.trim().toUpperCase();
    const result = document.getElementById('complaint-result');
    if (code !== 'DEMO01' && !storedOrders().some(function (order) { return order.reference === code; })) {
      result.textContent = 'That reference was not found in this browser. Check the code or try the code DEMO01.'; return;
    }
    const text = document.getElementById('complaint-message').value.trim();
    if (text.length < 10) { result.textContent = 'Write at least 10 characters about the issue.'; return; }
    let complaints = readStorage(storageNames.complaints, []);
    if (!Array.isArray(complaints)) complaints = [];
    const complaint = { number: 'C' + String(complaints.length + 1).padStart(3, '0'), reference: code, type: document.getElementById('complaint-type').value, message: text, date: new Date().toISOString() };
    complaints.push(complaint);
    if (saveStorage(storageNames.complaints, complaints)) {
      result.textContent = 'Complaint ' + complaint.number + ' saved for ' + code + ' in this browser. It has not been sent to Laundry Guru.';
      event.target.reset();
    }
  });
}

// 12. ABOUT AND POLICIES: optional approved WhatsApp link and clear records.
if (page === 'about' && /^https:\/\/wa\.me\/[0-9]+$/.test(whatsappLink)) {
  document.getElementById('whatsapp-link').href = whatsappLink;
  document.getElementById('whatsapp-link').textContent = 'Order on WhatsApp →';
  document.getElementById('whatsapp-message').textContent = 'Open our WhatsApp link to confirm your order and collection details with the team.';
}
if (page === 'policies') {
  document.getElementById('clear-data').addEventListener('click', function () {
    const result = document.getElementById('clear-result');
    if (!document.getElementById('clear-agreement').checked) { result.textContent = 'Tick the box first if you want to remove your records.'; return; }
    try {
      Object.values(storageNames).forEach(function (key) { localStorage.removeItem(key); });
      document.getElementById('clear-agreement').checked = false;
      result.textContent = 'This browser’s Laundry Guru draft, orders and complaints have been cleared.';
    } catch (error) { showStorageError(); }
  });
}
// 13. STARTUP: connect only the code needed by the current HTML page.
if (page === 'products') startProducts();
if (page === 'pay') startPayPage();
if (page === 'index') startHome();
// Browser Back may restore an old page from memory. Reload its saved choices.
window.addEventListener('pageshow', function (event) {
  if (event.persisted) window.location.reload();
});

// 14. MOBILE MENU: open the existing HTML menu without building new links.
// Escape closes it and returns focus to the Menu button.
const menuButton = document.querySelector('.menu-toggle');
const mainMenu = document.getElementById('main-menu');
if (menuButton && mainMenu) {
  function closeMenu() {
    mainMenu.classList.remove('is-open');
    menuButton.setAttribute('aria-expanded', 'false');
  }
  menuButton.addEventListener('click', function () {
    const isOpen = mainMenu.classList.toggle('is-open');
    menuButton.setAttribute('aria-expanded', String(isOpen));
  });
  mainMenu.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
      closeMenu();
      menuButton.focus();
    }
  });
}

// 15. SOAP BUBBLES: click or press Enter/Space to pop a decorative bubble.
// CSS handles the motion and turns animation off for reduced-motion settings.
// There are no extra particles, sounds or changes to an order.
document.querySelectorAll('button[data-bubble]').forEach(function (bubble) {
  bubble.addEventListener('click', function () {
    if (bubble.classList.contains('popped')) return;
    bubble.classList.add('popped');
    window.setTimeout(function () { bubble.classList.remove('popped'); }, 700);
  });
});
