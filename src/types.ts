// PriceWatcher — Types

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

export interface DetectedInfo {
  price: number | null;
  title: string;
  currency: string;
}
