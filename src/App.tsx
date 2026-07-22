import { useState, useEffect, useCallback, useRef } from 'react';
import { TrendingDown, Trash2, Download, RefreshCw, Plus, Target, DollarSign, Globe, BarChart3, PackageOpen, Activity, ArrowDown } from 'lucide-react';
import type { TrackedProduct, DetectedInfo } from './types';

// --- Helpers ---
function sendMessage<T = any>(type: string, data?: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...data }, (response) => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      if (response?.error) { reject(new Error(response.error)); return; }
      resolve(response);
    });
  });
}

function formatPrice(price: number | null, currency: string): string {
  if (price == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(price);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// --- Sparkline ---
function Sparkline({ data, width = 120, height = 32, color = '#5b8def', dropped = false }: {
  data: { date: string; price: number }[];
  width?: number;
  height?: number;
  color?: string;
  dropped?: boolean;
}) {
  if (data.length < 2) {
    return (
      <svg width={width} height={height} className="sparkline-svg">
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
        {data.length === 1 && (
          <circle cx={width / 2} cy={height / 2} r={2.5} fill={dropped ? '#d05c5c' : color} />
        )}
      </svg>
    );
  }

  const prices = data.map(d => d.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const pad = 4;
  const chartH = height - pad * 2;

  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * width,
    y: pad + chartH - ((d.price - min) / range) * chartH,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  const lineColor = dropped ? '#d05c5c' : color;

  return (
    <svg width={width} height={height} className="sparkline-svg">
      <path d={pathD} className="sparkline-line" stroke={lineColor} />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={2.5} fill={lineColor} />
    </svg>
  );
}

// --- CSV Export ---
function exportCSV(products: TrackedProduct[]) {
  const headers = ['Title', 'URL', 'Domain', 'Current Price', 'Target Price', 'Currency', 'Status', 'Created', 'Last Checked'];
  const rows = products.map(p => [
    `"${(p.title || '').replace(/"/g, '""')}"`,
    p.url,
    p.domain,
    p.currentPrice?.toFixed(2) || '',
    p.targetPrice.toFixed(2),
    p.currency,
    p.isDropped ? 'Dropped' : 'Active',
    p.createdAt,
    p.lastChecked || '',
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `pricewatcher-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// --- Add Product Form ---
function AddProductForm({ detected }: { detected: DetectedInfo | null }) {
  const [targetPrice, setTargetPrice] = useState('');
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseFloat(targetPrice);
    if (!target || target <= 0) return;

    setAdding(true);
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];
      if (!currentTab?.url) throw new Error('No active tab');

      const url = new URL(currentTab.url);
      const domain = url.hostname.replace(/^www\./, '');

      await sendMessage('ADD_PRODUCT', {
        url: currentTab.url,
        title: detected?.title || currentTab.title || '',
        domain,
        targetPrice: target,
        currentPrice: detected?.price,
        currency: detected?.currency || 'USD',
      });

      setAdded(true);
      setTargetPrice('');
      setTimeout(() => setAdded(false), 2000);
      // Refresh parent list
      window.dispatchEvent(new CustomEvent('product-added'));
    } catch (err) {
      console.error('Failed to add product:', err);
    } finally {
      setAdding(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4">
      {added ? (
        <div className="flex items-center gap-3 p-3 rounded-md bg-success/10 text-success text-body animate-[popup-enter_200ms_cubic-bezier(0.16,1,0.3,1)]">
          <Activity className="w-4 h-4" />
          <span className="font-medium">Product added to tracking</span>
        </div>
      ) : (
        <>
          <p className="text-secondary text-text-muted mb-3">
            Set a target price and we'll notify you when it drops.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-faint text-secondary">$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="Target price"
                value={targetPrice}
                onChange={e => setTargetPrice(e.target.value)}
                className="input-field pl-7"
                autoFocus
              />
            </div>
            <button type="submit" disabled={adding || !targetPrice} className="btn-primary whitespace-nowrap">
              {adding ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Track
            </button>
          </div>
        </>
      )}
    </form>
  );
}

// --- Product Card ---
function ProductCard({ product, onRemove }: { product: TrackedProduct; onRemove: (id: string) => void }) {
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await sendMessage('REMOVE_PRODUCT', { id: product.id });
      onRemove(product.id);
    } catch (err) {
      console.error('Failed to remove:', err);
      setRemoving(false);
    }
  };

  const priceDiff = product.currentPrice != null
    ? product.currentPrice - product.targetPrice
    : null;
  const diffPct = product.currentPrice != null
    ? Math.round(((product.currentPrice - product.targetPrice) / product.targetPrice) * 100)
    : null;

  return (
    <div className={`section-row flex-col items-stretch gap-2 ${product.isDropped ? 'bg-danger/5' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Globe className="w-3 h-3 text-text-faint shrink-0" />
            <span className="text-meta text-text-faint truncate">{product.domain}</span>
          </div>
          <p className="text-body font-medium text-text truncate mt-0.5">{product.title || 'Untitled'}</p>
        </div>
        <button
          onClick={handleRemove}
          disabled={removing}
          className="btn-danger shrink-0"
          title="Remove"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <span className="text-meta text-text-faint block">Current</span>
            <span className={`text-heading font-semibold tabular-nums leading-tight ${product.isDropped ? 'text-danger' : 'text-text'}`}>
              {formatPrice(product.currentPrice, product.currency)}
            </span>
          </div>
          <div className="w-px h-8 bg-border" />
          <div>
            <span className="text-meta text-text-faint block">Target</span>
            <span className="text-heading font-semibold tabular-nums text-text-muted leading-tight">
              {formatPrice(product.targetPrice, product.currency)}
            </span>
          </div>
        </div>

        <Sparkline
          data={product.priceHistory}
          width={100}
          height={28}
          dropped={product.isDropped}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-meta text-text-faint">
          Checked {timeAgo(product.lastChecked)}
        </span>
        <div className="flex items-center gap-2">
          {priceDiff != null && diffPct != null && (
            <span className={`badge ${product.isDropped ? 'badge-danger' : priceDiff < 0 ? 'badge-success' : 'badge-neutral'}`}>
              {product.isDropped ? 'Dropped' : priceDiff < 0 ? `${diffPct}%` : `+${diffPct}%`}
            </span>
          )}
          {product.isDropped && (
            <span className="badge badge-danger">
              <ArrowDown className="w-3 h-3 mr-0.5" />
              Deal
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Main App ---
export default function App() {
  const [products, setProducts] = useState<TrackedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [detected, setDetected] = useState<DetectedInfo | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const mounted = useRef(true);

  const loadProducts = useCallback(async () => {
    try {
      const { products = [] } = await sendMessage<{ products: TrackedProduct[] }>('GET_PRODUCTS');
      if (mounted.current) setProducts(products);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  const detectCurrentPage = useCallback(async () => {
    setDetecting(true);
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (!tab?.id || !tab?.url) { setDetecting(false); return; }

      // Only attempt detection on product-like pages
      const hostname = new URL(tab.url).hostname;
      if (!hostname.includes('amazon.') && !hostname.includes('ebay.') && !hostname.includes('shop')) {
        // Try on any page — content script will use schema.org or generic selectors
      }

      const result = await chrome.tabs.sendMessage(tab.id, { type: 'DETECT_PRICE' });
      if (mounted.current && result?.price) {
        setDetected(result);
      }
    } catch {
      // Content script may not be loaded
    } finally {
      if (mounted.current) setDetecting(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    loadProducts();
    detectCurrentPage();

    const handleAdded = () => loadProducts();
    window.addEventListener('product-added', handleAdded);

    return () => {
      mounted.current = false;
      window.removeEventListener('product-added', handleAdded);
    };
  }, [loadProducts, detectCurrentPage]);

  const handleRemoveProduct = useCallback((id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
  }, []);

  const handleCheckPrices = async () => {
    setChecking(true);
    try {
      await sendMessage('CHECK_PRICES');
      await loadProducts();
      setToast('Prices refreshed');
      setTimeout(() => setToast(null), 2000);
    } catch (err) {
      console.error('Check failed:', err);
    } finally {
      setChecking(false);
    }
  };

  const droppedCount = products.filter(p => p.isDropped).length;

  // --- Render ---
  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-primary/15 flex items-center justify-center">
            <TrendingDown className="w-4 h-4 text-primary" />
          </div>
          <h1 className="text-title font-semibold text-text">PriceWatcher</h1>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCheckPrices}
            disabled={checking || products.length === 0}
            className="btn-ghost !p-2"
            title="Check all prices"
          >
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
          </button>
          {products.length > 0 && (
            <button
              onClick={() => exportCSV(products)}
              className="btn-ghost !p-2"
              title="Export CSV"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
          {droppedCount > 0 && (
            <span className="badge badge-danger ml-1">
              {droppedCount} drop{droppedCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Current Page Detection */}
      {detected && !showAddForm && (
        <div className="mt-3 section-group">
          <div className="section-row justify-between" onClick={() => setShowAddForm(true)}>
            <div className="flex-1 min-w-0">
              <p className="text-body font-medium text-text truncate">{detected.title || 'Product'}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-heading font-semibold text-primary tabular-nums">
                  {formatPrice(detected.price, detected.currency)}
                </span>
                <span className="text-meta text-text-faint">detected on this page</span>
              </div>
            </div>
            <button className="btn-primary shrink-0">
              <Plus className="w-4 h-4" />
              Track This
            </button>
          </div>
        </div>
      )}

      {detected && showAddForm && (
        <div className="mt-3 section-group">
          <div className="section-row flex-col items-start">
            <p className="text-body font-medium text-text truncate w-full">{detected.title || 'Product'}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <DollarSign className="w-3.5 h-3.5 text-primary" />
              <span className="text-heading font-semibold text-primary tabular-nums">
                {formatPrice(detected.price, detected.currency)}
              </span>
            </div>
          </div>
          <AddProductForm detected={detected} />
        </div>
      )}

      {detecting && (
        <div className="mt-3 section-group">
          <div className="section-row">
            <RefreshCw className="w-4 h-4 text-text-muted animate-spin mr-2" />
            <span className="text-secondary text-text-muted">Detecting price...</span>
          </div>
        </div>
      )}

      {/* Products List */}
      <div className="mt-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <RefreshCw className="w-5 h-5 text-text-faint animate-spin" />
            <span className="text-secondary text-text-faint">Loading...</span>
          </div>
        ) : products.length === 0 && !detected ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <div className="empty-state-icon">
              <PackageOpen className="w-5 h-5 text-primary" />
            </div>
            <p className="text-body font-medium text-text">No products tracked yet</p>
            <p className="text-secondary text-text-muted text-center">
              Visit an Amazon or eBay product page{'\n'}to start tracking prices.
            </p>
          </div>
        ) : (
          <div>
            {products.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-secondary font-medium text-text-muted">
                    {products.length} product{products.length !== 1 ? 's' : ''} tracked
                  </span>
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-3.5 h-3.5 text-text-faint" />
                    <Target className="w-3.5 h-3.5 text-text-faint" />
                  </div>
                </div>
                <div className="section-group">
                  {products
                    .sort((a, b) => {
                      // Sort: dropped first, then by last checked
                      if (a.isDropped !== b.isDropped) return a.isDropped ? -1 : 1;
                      const aDate = a.lastChecked ? new Date(a.lastChecked).getTime() : 0;
                      const bDate = b.lastChecked ? new Date(b.lastChecked).getTime() : 0;
                      return bDate - aDate;
                    })
                    .map(product => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        onRemove={handleRemoveProduct}
                      />
                    ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
        <span className="text-meta text-text-faint">PriceWatcher v1.0</span>
        <span className="text-meta text-text-faint">
          {products.length > 0 ? `Last: ${timeAgo(products.reduce((latest, p) => {
            if (!p.lastChecked) return latest;
            if (!latest) return p.lastChecked;
            return p.lastChecked > latest ? p.lastChecked : latest;
          }, '' as string | null))}` : 'No data'}
        </span>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 toast-enter">
          <div className="px-3 py-2 rounded-md bg-elevated border border-border shadow-lg text-secondary font-medium text-text">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
