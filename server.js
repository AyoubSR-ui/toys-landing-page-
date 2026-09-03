// Backend for the لعبة اللمس التفاعلي landing page.
// Serves the static site AND creates real orders in FlashManager via its
// Orders API, so the customer's order lands directly in your COD pipeline
// (and syncs to Shopify from there) without any checkout screen at all.

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// CONFIG — set this as a Railway environment variable, NOT here.
// ============================================================
// FLASHMANAGER_API_KEY   your fm_live_... key from FlashManager's API keys
//                        page (Account → API keys).
const FLASHMANAGER_API_KEY = (process.env.FLASHMANAGER_API_KEY || '').trim();
const FLASHMANAGER_BASE_URL = 'https://api.flash-manager.com/v1';

// Server holds the source of truth for SKUs, names, and pricing —
// never trust price/product data sent from the browser.
const VARIANTS = {
  strawberry: { sku: 'TOY-STR', name: 'فراولة', title: 'لعبة اللمس التفاعلي - فراولة' },
  mango:      { sku: 'TOY-MAN', name: 'مانجو',  title: 'لعبة اللمس التفاعلي - مانجو' },
  banana:     { sku: 'TOY-BAN', name: 'موزة',   title: 'لعبة اللمس التفاعلي - موزة' }
};
const UNIT_PRICE = { 1: 2000, 2: 1850 }; // per-unit price by quantity tier; 3+ uses the value below
const UNIT_PRICE_3PLUS = 1700;
const SHIPPING = {
  home:      { label: 'التوصيل للمنزل', cost: 750 },
  stopdesk:  { label: 'Stop Desk', cost: 500 }
};

function unitPriceFor(qty) {
  if (qty >= 3) return UNIT_PRICE_3PLUS;
  return UNIT_PRICE[qty] || UNIT_PRICE[1];
}

app.post('/api/order', async (req, res) => {
  try {
    if (!FLASHMANAGER_API_KEY) {
      return res.status(500).json({ ok: false, error: 'الخادم غير مهيأ بعد (مفتاح FlashManager مفقود).' });
    }

    const { name, phone, wilaya, city, address, variant, qty, shipping } = req.body || {};

    if (!name || !phone || !wilaya || !city || !address || !variant || !qty || !shipping) {
      return res.status(400).json({ ok: false, error: 'جميع الحقول مطلوبة.' });
    }
    if (!VARIANTS[variant]) {
      return res.status(400).json({ ok: false, error: 'الشكل المطلوب غير صالح.' });
    }
    if (!SHIPPING[shipping]) {
      return res.status(400).json({ ok: false, error: 'طريقة التوصيل غير صالحة.' });
    }
    const quantity = Math.max(1, Math.min(10, parseInt(qty, 10) || 1));

    const chosenVariant = VARIANTS[variant];
    const chosenShipping = SHIPPING[shipping];
    const unitPrice = unitPriceFor(quantity);

    const orderPayload = {
      customer_name: name,
      customer_phone: phone,
      province: wilaya,
      city,
      address, // full street/landmark detail beyond city, kept for the delivery agent
      line_items: [
        {
          title: chosenVariant.title,
          sku: chosenVariant.sku,
          quantity,
          price: unitPrice
        }
      ],
      shipping_price: chosenShipping.cost,
      shipping_method: chosenShipping.label
    };

    const fmRes = await fetch(`${FLASHMANAGER_BASE_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': FLASHMANAGER_API_KEY
      },
      body: JSON.stringify(orderPayload)
    });

    const data = await fmRes.json();

    if (!fmRes.ok) {
      console.error('FlashManager error:', data);
      return res.status(502).json({ ok: false, error: 'تعذر إنشاء الطلب في FlashManager.', details: data });
    }

    return res.json({
      ok: true,
      orderId: data.id || data.order_id || null
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: 'خطأ غير متوقع في الخادم.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
