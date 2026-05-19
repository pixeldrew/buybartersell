export interface ListingAnalysis {
  brand: string | null;
  item: string | null;
  size: string | null;
  year: string | null;
  price: string | null;
  currency: string | null;
  condition: string | null;
  sentiment: 'selling' | 'wanted' | 'info' | 'unrelated';
}

export interface ListingMediaFile {
  filename: string;
  type: string;
  path: string;
  url: string;
}

export interface ListingThread {
  id: string;
  groupId: string;
  sender: string;
  phoneNumber: string | null;
  displayName: string | null;
  startTimestamp: string;
  endTimestamp: string;
  messageIds: string[];
  combinedText: string;
  mediaCount: number;
  mediaFiles: ListingMediaFile[];
  links: string[];
  analysis: ListingAnalysis;
}

export interface ListingFiltersMeta {
  sentiments: string[];
  brands: string[];
  items: string[];
  sizes: string[];
  years: string[];
  currencies: string[];
  conditions: string[];
  priceRange: {
    min: number | null;
    max: number | null;
  };
}

export interface ListingQueryState {
  sentiment: string;
  brand: string;
  item: string;
  size: string;
  year: string;
  priceMin: string;
  priceMax: string;
  currency: string;
  condition: string;
}
