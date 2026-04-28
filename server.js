// ============================================================
// Paperpals Studio — Stripe Payment + Instant PDF Delivery
// Node.js / Express server
// ============================================================
// SETUP:
//   npm install express stripe dotenv cors
//   Create .env file with your keys (see bottom of this file)
//   node server.js
// ============================================================

require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const YOUR_DOMAIN = (process.env.YOUR_DOMAIN || 'http://localhost:3000').replace(/\/$/, '');
// Serve your shop HTML as the frontend
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// Parse JSON — but NOT for the webhook route (needs raw body)
app.use((req, res, next) => {
  if (req.originalUrl === '/webhook') {
    next();
  } else {
    express.json()(req, res, next);
  }
});



// ============================================================
// PRODUCT CATALOGUE
// Map product IDs to: name, price (cents), and PDF filename
// Put your actual PDF files in the /pdfs folder
// ============================================================
const PRODUCTS = {
  'kanji-n4': {
    name: 'Japanese Kanji Practice Worksheets (N4)',
    price: 600, // $6.00 in cents
    pdf: 'n4_kanji_worksheets.pdf',
  },
  'apron-pattern': {
    name: 'Gathering Apron Sewing Pattern',
    price: 1100, // $11.00
    pdf: 'gathering_apron_pattern.pdf',
  },
  'outfit-colouring': {
    name: 'Outfit colouring book',
    price: 800,
    pdf: 'outfitcolouring.pdf',
  },
  'skirt-pattern': {
    name: 'A-Line Skirt PDF Pattern',
    price: 900,
    pdf: 'aline_skirt_pattern.pdf',
  },
  'habit-tracker': {
    name: 'Daily Habit Tracker',
    price: 400,
    pdf: 'daily_habit_tracker.pdf',
  },
  'meal-planner': {
    name: 'Weekly Meal Planner',
    price: 500,
    pdf: 'weekly_meal_planner.pdf',
  },
  'stitch-sampler': {
    name: 'Floral Stitch Sampler',
    price: 1200,
    pdf: 'floral_stitch_sampler.pdf',
  },
  'fern-print': {
    name: 'Botanical Print — Fern',
    price: 600,
    pdf: 'botanical_fern_print.pdf',
  },
  'budget-bundle': {
    name: 'Budget Worksheet Bundle',
    price: 700,
    pdf: 'budget_worksheet_bundle.pdf',
  },
  'goals-planner': {
    name: 'Monthly Goals Planner',
    price: 500,
    pdf: 'monthly_goals_planner.pdf',
  },
};

// ============================================================
// ROUTE: Create a Stripe Checkout Session
// Called when customer clicks "Checkout with Stripe"
// POST /create-checkout-session
// Body: { items: [ { id: 'kanji-n4' }, { id: 'apron-pattern' } ] }
// ============================================================
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { items } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'No items in cart' });
    }

    // Build Stripe line items from cart
    const lineItems = items.map(item => {
      const product = PRODUCTS[item.id];
      if (!product) throw new Error(`Unknown product: ${item.id}`);
      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: product.name,
          },
          unit_amount: product.price,
        },
        quantity: 1,
      };
    });

    // Store the product IDs in metadata so webhook knows what to deliver
    const productIds = items.map(i => i.id).join(',');

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      // After payment, redirect to /success?session_id=xxx
      success_url: `${YOUR_DOMAIN}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${YOUR_DOMAIN}/`,
            metadata: {
        product_ids: productIds,
      },
      // Collect customer email for receipt
      customer_email: req.body.email || undefined,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err.type, err.message, err.raw);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ROUTE: Success page — customer lands here after payment
// GET /success?session_id=cs_xxx
// Verifies payment and serves download links
// ============================================================
app.get('/success', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.query.session_id);

    if (session.payment_status !== 'paid') {
      return res.send('<h2>Payment not complete yet. Please wait a moment and refresh.</h2>');
    }

    const productIds = session.metadata.product_ids.split(',');
    const links = productIds.map(id => {
      const p = PRODUCTS[id];
      return p
        ? `<li><a href="/download?session_id=${req.query.session_id}&product=${id}" 
              style="font-size:18px;color:#FF6B6B;font-weight:bold;">
              ⬇ Download: ${p.name}</a></li>`
        : '';
    }).join('');

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Download Your Files — Paperpals Studio</title>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <link href="https://fonts.googleapis.com/css2?family=Fredoka+One&display=swap" rel="stylesheet"/>
        <style>
          body{font-family:'Fredoka One',cursive;background:#f9f6f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
          .box{background:white;border:4px solid #1a1a1a;border-radius:24px;padding:2.5rem;max-width:500px;width:90%;text-align:center;}
          h1{color:#FF6B6B;font-size:32px;margin-bottom:0.5rem;text-shadow:2px 2px 0 #1a1a1a;}
          p{color:#555;font-family:sans-serif;margin-bottom:1.5rem;}
          ul{list-style:none;padding:0;text-align:left;}
          li{background:#EEEDFE;border:2.5px solid #1a1a1a;border-radius:12px;padding:14px 18px;margin-bottom:10px;}
          a{text-decoration:none;}
          a:hover{text-decoration:underline;}
          .back{display:inline-block;margin-top:1.5rem;color:#888;font-family:sans-serif;font-size:13px;}
        </style>
      </head>
      <body>
        <div class="box">
          <h1>Payment complete!</h1>
          <p>Thank you for your purchase. Click below to download your files instantly.</p>
          <ul>${links}</ul>
          <a class="back" href="/">← Back to shop</a>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Success page error:', err.message);
    res.status(500).send('Something went wrong. Please contact support.');
  }
});

// ============================================================
// ROUTE: Secure PDF download
// GET /download?session_id=cs_xxx&product=kanji-n4
// Verifies the session was actually paid before serving the file
// ============================================================
app.get('/download', async (req, res) => {
  try {
    const { session_id, product } = req.query;

    if (!session_id || !product) {
      return res.status(400).send('Missing parameters.');
    }

    // Re-verify with Stripe that this session was paid
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status !== 'paid') {
      return res.status(403).send('Payment not verified.');
    }

    // Check the product was actually in this order
    const purchasedIds = session.metadata.product_ids.split(',');
    if (!purchasedIds.includes(product)) {
      return res.status(403).send('This product was not part of your order.');
    }

    const productData = PRODUCTS[product];
    if (!productData) {
      return res.status(404).send('Product not found.');
    }

    const filePath = path.join(__dirname, 'pdfs', productData.pdf);
    if (!fs.existsSync(filePath)) {
      console.error('PDF file not found:', filePath);
      return res.status(404).send('File not found on server. Please contact support.');
    }

    // Send the PDF as a download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${productData.pdf}"`);
    res.sendFile(filePath);
  } catch (err) {
    console.error('Download error:', err.message);
    res.status(500).send('Download failed. Please contact support.');
  }
});

// ============================================================
// ROUTE: Stripe Webhook (optional but recommended)
// Stripe calls this URL when a payment completes
// Useful for logging, sending email receipts, etc.
// In Stripe Dashboard → Webhooks → Add endpoint → /webhook
// ============================================================
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const products = session.metadata.product_ids;
    const email = session.customer_email || 'unknown';
    console.log(`✅ Payment received from ${email} for: ${products}`);
    // TODO: send email receipt here using Resend, SendGrid, etc.
  }

  res.json({ received: true });
});

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🛍 Primcore server running on port ${PORT}`);
  console.log(`🌐 Public domain: ${YOUR_DOMAIN}`);
  console.log(`📁  Place PDF files in: ${path.join(__dirname, 'pdfs/')}\n`);
});