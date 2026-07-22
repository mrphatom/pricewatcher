// PriceWatcher — Background Service Worker

export interface TrackedProduct {
  id: string;
  url: string;
  title: string;
  domain: string;
  targetPrice: number;
  currentPrice: number | null;
  currency: string;
  createdAt: string;
  lastChecked: string | null;
  priceHistory: { date: string; price: number }[];
  isDropped: boolean;
  notified: boolean;
}

// --- Helpers ---
function generateId(): string {
  return crypto.randomUUID();
}

async function getAllProducts(): Promise<TrackedProduct[]> {
  const { products = [] } = await chrome.storage.local.get(['products']);
  return products;
}

async function saveProducts(products: TrackedProduct[]): Promise<void> {
  await chrome.storage.local.set({ products });
}

async function updateBadge(): Promise<void> {
  const products = await getAllProducts();
  const droppedCount = products.filter(p => p.isDropped).length;
  if (droppedCount > 0) {
    chrome.action.setBadgeText({ text: String(droppedCount) });
    chrome.action.setBadgeBackgroundColor({ color: '#d05c5c' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// --- Install ---
chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
  // Check prices every hour
  chrome.alarms.create('priceCheck', { periodInMinutes: 60 });
});

// --- Alarm handler: check all tracked products ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'priceCheck') {
    await checkAllPrices();
  }
});

async function checkAllPrices(): Promise<void> {
  const products = await getAllProducts();
  let changed = false;

  for (const product of products) {
    try {
      const url = new URL(product.url);
      const resp = await fetch(product.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (!resp.ok) continue;
      const html = await resp.text();

      // Parse price from HTML
      let price: number | null = null;

      if (url.hostname.includes('amazon.')) {
        // Amazon price extraction from HTML
        const priceMatch = html.match(/"price":\s*"?(\d+(?:\.\d{1,2})?)"?/);
        if (!priceMatch) {
          const wholeMatch = html.match(/<span class="a-price-whole">([^<]+)/);
          const fracMatch = html.match(/<span class="a-price-fraction">(\d+)</);
          if (wholeMatch) {
            const whole = wholeMatch[1].replace(/[^0-9]/g, '');
            const frac = fracMatch ? fracMatch[1] : '00';
            price = parseFloat(`${whole}.${frac}`);
          }
        } else {
          price = parseFloat(priceMatch[1]);
        }
      } else if (url.hostname.includes('ebay.')) {
        const priceMatch = html.match(/"price":\s*"?(\d+(?:\.\d{1,2})?)"?/);
        if (priceMatch) price = parseFloat(priceMatch[1]);
        if (!price) {
          const itempropMatch = html.match(/<meta\s+itemprop="price"\s+content="([^"]+)"/);
          if (itempropMatch) price = parseFloat(itempropMatch[1]);
        }
      } else {
        const itempropMatch = html.match(/<meta\s+itemprop="price"\s+content="([^"]+)"/);
        if (itempropMatch) price = parseFloat(itempropMatch[1]);
      }

      if (price && price > 0 && price !== product.currentPrice) {
        const previousPrice = product.currentPrice;
        product.currentPrice = price;
        product.lastChecked = new Date().toISOString();
        product.priceHistory.push({ date: new Date().toISOString(), price });

        // Keep last 30 entries
        if (product.priceHistory.length > 30) {
          product.priceHistory = product.priceHistory.slice(-30);
        }

        // Check if price dropped below target
        if (price <= product.targetPrice) {
          if (!product.isDropped || !product.notified) {
            product.isDropped = true;
            const dropPct = previousPrice ? Math.round(((previousPrice - price) / previousPrice) * 100) : 0;
            chrome.notifications.create(`drop-${product.id}`, {
              type: 'basic',
              iconUrl: 'icons/icon128.png',
              title: 'Price Drop!',
              message: `${product.title || 'Product'} is now ${product.currency} ${price.toFixed(2)}${dropPct > 0 ? ` (${dropPct}% drop)` : ''} — below your target of ${product.currency} ${product.targetPrice.toFixed(2)}`,
              priority: 2,
            });
            product.notified = true;
          }
        } else if (product.isDropped) {
          product.isDropped = false;
          product.notified = false;
        }

        changed = true;
      }
    } catch {
      // Skip failed fetches silently
    }
    // Delay between requests to be polite
    await new Promise(r => setTimeout(r, 1000));
  }

  if (changed) {
    await saveProducts(products);
    await updateBadge();
  }
}

// --- Notification clicks: open product URL ---
chrome.notifications.onClicked.addListener((notificationId) => {
  const productId = notificationId.replace('drop-', '');
  getAllProducts().then(products => {
    const product = products.find(p => p.id === productId);
    if (product) {
      chrome.tabs.create({ url: product.url });
    }
  });
});

// --- Message handler ---
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'ADD_PRODUCT': {
        const products = await getAllProducts();
        // Check if already tracked
        const exists = products.find(p => p.url === msg.url);
        if (exists) {
          // Update target price
          exists.targetPrice = msg.targetPrice;
          exists.notified = false;
          if (exists.currentPrice && exists.currentPrice <= exists.targetPrice) {
            exists.isDropped = true;
          }
          await saveProducts(products);
          sendResponse({ success: true, product: exists, updated: true });
          return;
        }

        const product: TrackedProduct = {
          id: generateId(),
          url: msg.url,
          title: msg.title || '',
          domain: msg.domain || '',
          targetPrice: msg.targetPrice,
          currentPrice: msg.currentPrice || null,
          currency: msg.currency || 'USD',
          createdAt: new Date().toISOString(),
          lastChecked: msg.currentPrice ? new Date().toISOString() : null,
          priceHistory: msg.currentPrice ? [{ date: new Date().toISOString(), price: msg.currentPrice }] : [],
          isDropped: msg.currentPrice ? msg.currentPrice <= msg.targetPrice : false,
          notified: false,
        };
        products.push(product);
        await saveProducts(products);
        await updateBadge();
        sendResponse({ success: true, product });
        return;
      }

      case 'GET_PRODUCTS': {
        const products = await getAllProducts();
        sendResponse({ products });
        return;
      }

      case 'REMOVE_PRODUCT': {
        let products = await getAllProducts();
        products = products.filter(p => p.id !== msg.id);
        await saveProducts(products);
        await updateBadge();
        sendResponse({ success: true });
        return;
      }

      case 'CLEAR_NOTIFICATION': {
        const products = await getAllProducts();
        const product = products.find(p => p.id === msg.id);
        if (product) {
          product.notified = false;
          await saveProducts(products);
        }
        await updateBadge();
        sendResponse({ success: true });
        return;
      }

      case 'CHECK_PRICES': {
        await checkAllPrices();
        sendResponse({ success: true });
        return;
      }

      case 'GET_BADGE_COUNT': {
        const products = await getAllProducts();
        sendResponse({ count: products.filter(p => p.isDropped).length });
        return;
      }

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  })().catch(e => sendResponse({ error: e.message }));

  return true; // async
});
