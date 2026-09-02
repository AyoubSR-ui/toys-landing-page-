// Backend for the لعبة اللمس التفاعلي landing page.
// Serves the static site AND creates real Shopify draft orders via the
// Admin API, so the customer's order lands directly in Shopify without
// ever seeing Shopify's own checkout screen.

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// CONFIG — set these as Railway environment variables, NOT here.
// ============================================================
// SHOPIFY_STORE_DOMAIN   e.g. ay10i3-ha.myshopify.com
// SHOPIFY_ADMIN_TOKEN    Admin API access token from your custom app
//                        (Shopify admin → Settings → Apps and sales
//                        channels → Develop apps → your app → API
//                        credentials). Needs the write_draft_orders scope.
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const SHOPIFY_API_VERSION = '2024-10';

// Server holds the source of truth for variant IDs, names, and pricing —
// never trust price/variant data sent from the browser.
const VARIANTS = {
  strawberry: { id: 48488634089666, name: 'فراولة' },
  mango:      { id: 48488634056898, name: 'مانجو' },
  banana:     { id: 48488634122434, name: 'موزة' }
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
    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_TOKEN) {
      return res.status(500).json({ ok: false, error: 'الخادم غير مهيأ بعد (متغيرات Shopify مفقودة).' });
    }

    const { name, phone, wilaya, address, variant, qty, shipping } = req.body || {};

    if (!name || !phone || !wilaya || !address || !variant || !qty || !shipping) {
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

    const draftOrderPayload = {
      draft_order: {
        line_items: [
          {
            variant_id: chosenVariant.id,
            quantity,
            price: unitPrice.toFixed(2)
          }
        ],
        shipping_line: {
          title: chosenShipping.label,
          price: chosenShipping.cost.toFixed(2)
        },
        shipping_address: {
          first_name: name,
          phone,
          address1: address,
          city: wilaya,
          country: 'DZ'
        },
        note: `طلب دفع عند الاستلام — ${chosenShipping.label} (${chosenShipping.cost} دج)`,
        note_attributes: [
          { name: 'الاسم', value: name },
          { name: 'الهاتف', value: phone },
          { name: 'الولاية', value: wilaya },
          { name: 'العنوان', value: address },
          { name: 'الشكل', value: chosenVariant.name },
          { name: 'طريقة التوصيل', value: `${chosenShipping.label} (${chosenShipping.cost} دج)` }
        ],
        tags: 'COD, لعبة اللمس التفاعلي',
        use_customer_default_address: false
      }
    };

    const shopifyRes = await fetch(
      `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/draft_orders.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ADMIN_TOKEN
        },
        body: JSON.stringify(draftOrderPayload)
      }
    );

    const data = await shopifyRes.json();

    if (!shopifyRes.ok) {
      console.error('Shopify error:', data);
      return res.status(502).json({ ok: false, error: 'تعذر إنشاء الطلب في Shopify.', details: data });
    }

    return res.json({
      ok: true,
      orderName: data.draft_order?.name || null,
      orderId: data.draft_order?.id || null
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
