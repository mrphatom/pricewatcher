// PriceWatcher — Content Script
// Detects product prices on e-commerce sites and communicates with background

const PROJECT_ID = '__BLINK_PROJECT_ID__';

function detectPrice(): { price: number | null; title: string; currency: string } {
  const url = location.hostname;
  let price: number | null = null;
  let title = '';
  let currency = 'USD';

  // --- Amazon ---
  if (url.includes('amazon.')) {
    title = (document.querySelector('#productTitle') as HTMLElement)?.textContent?.trim() || '';
    // Try multiple Amazon price selectors
    const priceWhole = document.querySelector('.a-price-whole');
    const priceFraction = document.querySelector('.a-price-fraction');
    if (priceWhole) {
      const whole = priceWhole.textContent?.replace(/[^0-9]/g, '') || '0';
      const frac = priceFraction?.textContent?.replace(/[^0-9]/g, '') || '00';
      price = parseFloat(`${whole}.${frac}`);
    } else {
      const priceEl = document.querySelector('[data-a-color="price"] .a-offscreen, .a-price .a-offscreen, span.a-price span.a-offscreen, #priceblock_dealprice, #priceblock_ourprice, #price_inside_buybox');
      if (priceEl) {
        const text = priceEl.textContent || priceEl.getAttribute('aria-label') || '';
        price = extractPriceFromText(text);
      }
    }
    const symbolEl = document.querySelector('.a-price-symbol');
    if (symbolEl) currency = symbolEl.textContent?.trim() === '£' ? 'GBP' : symbolEl.textContent?.trim() === '€' ? 'EUR' : 'USD';
  }
  // --- eBay ---
  else if (url.includes('ebay.')) {
    title = (document.querySelector('.it-ttl, h1.it-ttl, .x-item-title__mainTitle span') as HTMLElement)?.textContent?.trim() || '';
    const priceEl = document.querySelector('.x-price-primary span, .vi-price .x-price-primary .ux-textspans, [itemprop="price"], .x-bin-price__content .ux-textspans');
    if (priceEl) {
      price = extractPriceFromText(priceEl.textContent || priceEl.getAttribute('content') || '');
      const symbolEl = document.querySelector('[itemprop="priceCurrency"]');
      if (symbolEl) currency = symbolEl.getAttribute('content') || 'USD';
    }
  }
  // --- General / Schema.org ---
  else {
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) title = ogTitle.getAttribute('content') || '';
    if (!title) title = document.title;

    // Schema.org Product price
    const priceMeta = document.querySelector('[itemprop="price"]');
    if (priceMeta) {
      price = parseFloat(priceMeta.getAttribute('content') || priceMeta.textContent || '');
      const currencyMeta = document.querySelector('[itemprop="priceCurrency"]');
      if (currencyMeta) currency = currencyMeta.getAttribute('content') || 'USD';
    }

    // Common price selectors for other sites
    if (!price) {
      const commonSelectors = [
        '[data-testid="price"]',
        '.product-price',
        '.price__current',
        '.current-price',
        '[class*="price"][class*="current"]',
        '.product-details-price',
      ];
      for (const sel of commonSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          price = extractPriceFromText(el.textContent || '');
          if (price) break;
        }
      }
    }
  }

  return { price, title, currency };
}

function extractPriceFromText(text: string): number | null {
  if (!text) return null;
  // Match patterns like $19.99, 19.99, $1,234.56, etc.
  const cleaned = text.replace(/[^\d.,]/g, '').trim();
  // Handle European format: 1.234,56 vs 1,234.56
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized = cleaned;
  if (lastComma > lastDot && lastComma >= cleaned.length - 3) {
    // European: 1.234,56 -> 1234.56
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot >= 0) {
    // US: 1,234.56 -> 1234.56
    normalized = cleaned.replace(/,/g, '');
  }
  const match = normalized.match(/(\d+(?:\.\d{1,2})?)/);
  if (match) return parseFloat(match[1]);
  return null;
}

function getDomain(): string {
  return location.hostname.replace(/^www\./, '');
}

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'DETECT_PRICE') {
    const result = detectPrice();
    sendResponse(result);
    return true;
  }
  return false;
});
