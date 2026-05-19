import { useEffect, useMemo, useRef, useState, type InputHTMLAttributes } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  CircleDollarSignIcon,
  ExpandIcon,
  FilterIcon,
  ImageOffIcon,
  Link2Icon,
  Loader2Icon,
  RefreshCwIcon,
  XIcon,
} from 'lucide-react';
import { getListingFiltersMeta, getListings } from './api';
import type { ListingFiltersMeta, ListingMediaFile, ListingQueryState, ListingThread } from './types';
import { Badge } from '@buybartersell/ui/components/ui/badge';
import { Button } from '@buybartersell/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@buybartersell/ui/components/ui/card';
import { Input } from '@buybartersell/ui/components/ui/input';
import { Skeleton } from '@buybartersell/ui/components/ui/skeleton';

const EMPTY_FILTERS: ListingQueryState = {
  sentiment: '',
  brand: '',
  item: '',
  size: '',
  year: '',
  priceMin: '',
  priceMax: '',
  currency: '',
  condition: '',
};

function filtersFromLocation(): ListingQueryState {
  const params = new URLSearchParams(window.location.search);
  return {
    sentiment: params.get('sentiment') ?? '',
    brand: params.get('brand') ?? '',
    item: params.get('item') ?? '',
    size: params.get('size') ?? '',
    year: params.get('year') ?? '',
    priceMin: params.get('priceMin') ?? '',
    priceMax: params.get('priceMax') ?? '',
    currency: params.get('currency') ?? '',
    condition: params.get('condition') ?? '',
  };
}

function syncFiltersToLocation(filters: ListingQueryState): void {
  const params = new URLSearchParams();
  const entries = Object.entries(filters) as Array<[keyof ListingQueryState, string]>;

  for (const [key, value] of entries) {
    if (value.trim()) params.set(key, value.trim());
  }

  const next = params.toString();
  const path = `${window.location.pathname}${next ? `?${next}` : ''}`;
  window.history.replaceState(null, '', path);
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function formatPhoneNumber(phoneNumber: string | null): string | null {
  if (!phoneNumber) return null;
  const digits = phoneNumber.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length > 10) return `+${digits}`;
  return phoneNumber;
}

function formatPrice(price: string | null, currency: string | null): string | null {
  if (!price) return null;
  if (!currency) return price;
  return `${currency} ${price}`;
}

function isFilterActive(filters: ListingQueryState): boolean {
  return Object.values(filters).some((value) => value.trim().length > 0);
}

function mediaLabel(media: ListingMediaFile): string {
  if (media.type === 'document') return 'Document';
  if (media.type === 'audio') return 'Audio';
  if (media.type === 'video') return 'Video';
  if (media.type === 'sticker') return 'Sticker';
  return 'Image';
}

function backdropMediaFromFiles(mediaFiles: ListingMediaFile[]): ListingMediaFile | null {
  return mediaFiles.find((media) => media.type === 'image' || media.type === 'sticker' || media.type === 'video') ?? null;
}

export function App() {
  const [filters, setFilters] = useState<ListingQueryState>(() => filtersFromLocation());
  const [meta, setMeta] = useState<ListingFiltersMeta | null>(null);
  const [items, setItems] = useState<ListingThread[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [gallery, setGallery] = useState<{ item: ListingThread; index: number } | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const requestKeyRef = useRef(0);

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((value) => value.trim()).length,
    [filters],
  );

  useEffect(() => {
    getListingFiltersMeta()
      .then((response) => setMeta(response.filters))
      .catch((err) => setMetaError((err as Error).message));
  }, []);

  useEffect(() => {
    syncFiltersToLocation(filters);
    const requestKey = requestKeyRef.current + 1;
    requestKeyRef.current = requestKey;
    setHydrated(true);
    setLoading(true);
    setLoadingMore(false);
    setError(null);

    getListings(filters)
      .then((response) => {
        if (requestKeyRef.current !== requestKey) return;
        setItems(response.items);
        setNextCursor(response.nextCursor);
      })
      .catch((err) => {
        if (requestKeyRef.current !== requestKey) return;
        setItems([]);
        setNextCursor(null);
        setError((err as Error).message);
      })
      .finally(() => {
        if (requestKeyRef.current === requestKey) {
          setLoading(false);
        }
      });
  }, [filters]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hydrated || loading || loadingMore || !nextCursor) return;

    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (!entry?.isIntersecting) return;

      const requestKey = requestKeyRef.current;
      setLoadingMore(true);
      getListings(filters, nextCursor)
        .then((response) => {
          if (requestKeyRef.current !== requestKey) return;
          setItems((current) => [...current, ...response.items]);
          setNextCursor(response.nextCursor);
        })
        .catch((err) => {
          if (requestKeyRef.current !== requestKey) return;
          setError((err as Error).message);
        })
        .finally(() => {
          if (requestKeyRef.current === requestKey) {
            setLoadingMore(false);
          }
        });
    }, { rootMargin: '600px 0px' });

    observer.observe(node);
    return () => observer.disconnect();
  }, [filters, hydrated, loading, loadingMore, nextCursor]);

  useEffect(() => {
    if (!gallery) return;

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setGallery(null);
        return;
      }
      if (event.key === 'ArrowLeft') {
        setGallery((current) => current ? {
          ...current,
          index: (current.index - 1 + current.item.mediaFiles.length) % current.item.mediaFiles.length,
        } : current);
        return;
      }
      if (event.key === 'ArrowRight') {
        setGallery((current) => current ? {
          ...current,
          index: (current.index + 1) % current.item.mediaFiles.length,
        } : current);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gallery]);

  return (
    <main className="min-h-screen px-4 py-5 text-foreground sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="h-fit rounded-[1.75rem] border-stone-300/70 bg-[var(--listing-paper)]/90">
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FilterIcon className="size-4" />
                  Filter products
                </CardTitle>
                {isFilterActive(filters) ? (
                  <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                    Reset
                  </Button>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                Filter on saved analysis fields. Query params stay in the URL.
              </p>
              {metaError ? <p className="text-sm text-destructive">{metaError}</p> : null}
            </CardHeader>
            <CardContent className="grid gap-4">
              <SelectField label="Sentiment" value={filters.sentiment} options={meta?.sentiments ?? []} onChange={(value) => setFilters((current) => ({ ...current, sentiment: value }))} />
              <SelectField label="Brand" value={filters.brand} options={meta?.brands ?? []} onChange={(value) => setFilters((current) => ({ ...current, brand: value }))} />
              <SelectField label="Item" value={filters.item} options={meta?.items ?? []} onChange={(value) => setFilters((current) => ({ ...current, item: value }))} />
              <SelectField label="Size" value={filters.size} options={meta?.sizes ?? []} onChange={(value) => setFilters((current) => ({ ...current, size: value }))} />
              <SelectField label="Year" value={filters.year} options={meta?.years ?? []} onChange={(value) => setFilters((current) => ({ ...current, year: value }))} />
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Min price" inputMode="decimal" placeholder={meta?.priceRange.min?.toString() ?? '0'} value={filters.priceMin} onChange={(value) => setFilters((current) => ({ ...current, priceMin: value }))} />
                <TextField label="Max price" inputMode="decimal" placeholder={meta?.priceRange.max?.toString() ?? '0'} value={filters.priceMax} onChange={(value) => setFilters((current) => ({ ...current, priceMax: value }))} />
              </div>
              <SelectField label="Currency" value={filters.currency} options={meta?.currencies ?? []} onChange={(value) => setFilters((current) => ({ ...current, currency: value }))} />
              <SelectField label="Condition" value={filters.condition} options={meta?.conditions ?? []} onChange={(value) => setFilters((current) => ({ ...current, condition: value }))} />
            </CardContent>
          </Card>

          <section className="space-y-4">
            {error ? (
              <Card className="rounded-[1.5rem] border-destructive/40 bg-destructive/5">
                <CardContent className="flex items-center justify-between gap-4 p-5">
                  <p className="text-sm text-destructive">{error}</p>
                  <Button variant="outline" onClick={() => setFilters((current) => ({ ...current }))}>
                    <RefreshCwIcon className="size-4" />
                    Retry
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {loading ? (
              <ListingSkeletonGrid />
            ) : items.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="grid gap-4 md:grid-cols-3 2xl:grid-cols-4">
                {items.map((item) => (
                  <ListingCard key={item.id} item={item} onOpenGallery={(index) => setGallery({ item, index })} />
                ))}
              </div>
            )}

            <div ref={sentinelRef} />
            {loadingMore ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                Loading more listings
              </div>
            ) : null}
          </section>
        </section>
      </div>
      {gallery ? (
        <GalleryModal
          item={gallery.item}
          index={gallery.index}
          onClose={() => setGallery(null)}
          onPrevious={() => setGallery((current) => current ? {
            ...current,
            index: (current.index - 1 + current.item.mediaFiles.length) % current.item.mediaFiles.length,
          } : current)}
          onNext={() => setGallery((current) => current ? {
            ...current,
            index: (current.index + 1) % current.item.mediaFiles.length,
          } : current)}
          onSelect={(index) => setGallery((current) => current ? { ...current, index } : current)}
        />
      ) : null}
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] border border-stone-200/80 bg-white/70 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-stone-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-stone-900">{value}</p>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">{label}</span>
      <div className="relative">
        <select
          className="flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-9 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">All</option>
          {options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </label>
  );
}

function TextField({
  label,
  value,
  placeholder,
  inputMode,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode'];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">{label}</span>
      <Input value={value} placeholder={placeholder} inputMode={inputMode} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ListingCard({
  item,
  onOpenGallery,
}: {
  item: ListingThread;
  onOpenGallery: (index: number) => void;
}) {
  const price = formatPrice(item.analysis.price, item.analysis.currency);
  const identity = item.displayName ?? formatPhoneNumber(item.phoneNumber) ?? item.sender;
  const backdropMedia = backdropMediaFromFiles(item.mediaFiles);
  const attachmentMedia = item.mediaFiles.filter((media) => media !== backdropMedia);
  const hasGallery = item.mediaFiles.length > 1;

  return (
    <article
      className={`group relative overflow-visible rounded-[1.75rem] border border-stone-300/70 bg-stone-900 shadow-[0_24px_50px_-30px_rgba(50,40,10,0.55)] ${hasGallery ? 'cursor-pointer' : ''}`}
      onClick={hasGallery ? () => onOpenGallery(0) : undefined}
      onKeyDown={hasGallery ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenGallery(0);
        }
      } : undefined}
      role={hasGallery ? 'button' : undefined}
      tabIndex={hasGallery ? 0 : undefined}
      aria-label={hasGallery ? `Open gallery for ${item.analysis.brand ?? 'listing'} ${item.analysis.item ?? ''}`.trim() : undefined}
    >
      <div className="absolute inset-0 overflow-hidden rounded-[1.75rem]">
        <MediaBackdrop mediaFile={backdropMedia} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/30 to-black/82" />
      </div>
      <div className="relative flex min-h-[14.5rem] flex-col justify-end p-5 sm:min-h-[16rem]">
        <div className="space-y-5 rounded-[1.35rem] border border-white/12 bg-black/22 p-5 backdrop-blur-[3px]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-full bg-white/16 px-3 py-1 text-[0.7rem] uppercase tracking-[0.18em] text-white backdrop-blur">
                  {item.analysis.sentiment}
                </Badge>
                {price ? (
                  <Badge variant="secondary" className="rounded-full border border-white/10 bg-amber-200/88 px-3 py-1 text-stone-950">
                    <CircleDollarSignIcon className="size-3.5" />
                    {price}
                  </Badge>
                ) : null}
              </div>
              <h2 className="max-w-xl text-xl font-semibold text-white sm:text-2xl">
                {item.analysis.brand ?? 'Unknown brand'} {item.analysis.item ?? 'listing'}
              </h2>
              <p className="text-sm text-stone-200">
                {identity}
                {item.phoneNumber && item.displayName ? ` · ${formatPhoneNumber(item.phoneNumber)}` : ''}
                {' · '}
                {formatTimestamp(item.endTimestamp)}
              </p>
            </div>
            {hasGallery ? (
              <Badge variant="secondary" className="rounded-full border border-white/10 bg-white/14 px-3 py-1 text-white">
                <ExpandIcon className="size-3.5" />
                {item.mediaFiles.length} media
              </Badge>
            ) : null}
          </div>

          <p
            className="overflow-hidden whitespace-pre-wrap text-sm leading-6 text-stone-100"
            style={{
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 3,
            }}
          >
            {item.combinedText || 'No message text was captured for this thread.'}
          </p>

          <div className="flex flex-wrap gap-2">
            {item.analysis.brand ? <ListingProperty label="Brand" value={item.analysis.brand} /> : null}
            {item.analysis.item ? <ListingProperty label="Item" value={item.analysis.item} /> : null}
            {item.analysis.size ? <ListingProperty label="Size" value={item.analysis.size} /> : null}
            {item.analysis.year ? <ListingProperty label="Year" value={item.analysis.year} /> : null}
            {item.analysis.condition ? <ListingProperty label="Condition" value={item.analysis.condition} /> : null}
          </div>

          {attachmentMedia.length ? (
            <div className="flex flex-wrap gap-2">
              {attachmentMedia.map((mediaFile) => (
                <a
                  key={mediaFile.path}
                  className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/10 px-3 py-1 text-xs text-white transition-colors hover:bg-white/16"
                  href={mediaFile.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                >
                  {mediaLabel(mediaFile)}
                </a>
              ))}
            </div>
          ) : null}

          {item.links.length ? (
            <div className="flex flex-wrap gap-2">
              {item.links.map((link) => (
                <Badge key={link} variant="outline" className="rounded-full border-white/20 bg-white/8 px-3 py-1 text-white">
                  <Link2Icon className="size-3.5" />
                  {link}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function GalleryModal({
  item,
  index,
  onClose,
  onPrevious,
  onNext,
  onSelect,
}: {
  item: ListingThread;
  index: number;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSelect: (index: number) => void;
}) {
  const mediaFile = item.mediaFiles[index];

  if (!mediaFile) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/82 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[1.75rem] border border-white/12 bg-stone-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative flex min-h-[72vh] items-center justify-center bg-black">
          {mediaFile.type === 'image' || mediaFile.type === 'sticker' ? (
            <img src={mediaFile.url} alt={mediaLabel(mediaFile)} className="max-h-[68vh] w-full object-contain" />
          ) : null}
          {mediaFile.type === 'video' ? (
            <video src={mediaFile.url} controls autoPlay className="max-h-[68vh] w-full bg-black object-contain" />
          ) : null}
          {mediaFile.type === 'audio' ? (
            <div className="flex h-full min-h-[50vh] w-full items-center justify-center p-8">
              <audio src={mediaFile.url} controls autoPlay className="w-full max-w-xl" />
            </div>
          ) : null}
          {mediaFile.type === 'document' ? (
            <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center text-white">
              <Badge variant="secondary">{mediaLabel(mediaFile)}</Badge>
              <a className="text-base font-medium underline" href={mediaFile.url} target="_blank" rel="noreferrer">
                Open attachment
              </a>
            </div>
          ) : null}

          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-4 bg-gradient-to-b from-black/72 via-black/38 to-transparent px-5 py-4 text-white">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">
                {item.analysis.brand ?? 'Unknown brand'} {item.analysis.item ?? 'listing'}
              </h2>
              <p className="text-sm text-stone-300">
                {index + 1} of {item.mediaFiles.length} · {mediaLabel(mediaFile)}
              </p>
            </div>
            <Button variant="ghost" className="shrink-0 text-white hover:bg-white/10 hover:text-white" onClick={onClose}>
              <XIcon className="size-4" />
              Close
            </Button>
          </div>

          <button
            type="button"
            className="absolute left-4 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/12 bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/65"
            onClick={onPrevious}
            aria-label="Previous media"
          >
            <ChevronLeftIcon className="size-5" />
          </button>
          <button
            type="button"
            className="absolute right-4 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/12 bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/65"
            onClick={onNext}
            aria-label="Next media"
          >
            <ChevronRightIcon className="size-5" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 overflow-x-auto border-t border-white/10 px-5 py-4">
          {item.mediaFiles.map((entry, entryIndex) => (
            <button
              key={entry.path}
              type="button"
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                entryIndex === index
                  ? 'border-amber-300 bg-amber-200 text-stone-950'
                  : 'border-white/12 bg-white/6 text-stone-200 hover:bg-white/12'
              }`}
              onClick={() => onSelect(entryIndex)}
            >
              {entryIndex + 1}. {mediaLabel(entry)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ListingProperty({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-white/18 bg-white/12 px-3 py-1 text-xs text-stone-100 backdrop-blur">
      <strong className="font-semibold text-white">{label}:</strong> {value}
    </span>
  );
}

function MediaBackdrop({ mediaFile }: { mediaFile: ListingMediaFile | null }) {
  if (!mediaFile) {
    return (
      <div className="absolute inset-0 flex items-center justify-center gap-2 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.25),_transparent_32%),linear-gradient(160deg,_rgba(28,25,23,0.95),_rgba(68,64,60,0.88))] text-sm text-stone-300">
      </div>
    );
  }

  if (mediaFile.type === 'video') {
    return (
      <video
        src={mediaFile.url}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        muted
        playsInline
        autoPlay
        loop
      />
    );
  }

  return (
    <img
      src={mediaFile.url}
      alt={mediaLabel(mediaFile)}
      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
      loading="lazy"
    />
  );
}

function ListingSkeletonGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Card key={index} className="overflow-hidden rounded-[1.75rem] border-stone-300/70">
          <Skeleton className="h-52 w-full rounded-none" />
          <CardContent className="space-y-4 p-5">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-7 w-3/5" />
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-8 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="rounded-[1.5rem] border-dashed border-stone-300/80 bg-[var(--listing-paper)]/70">
      <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <Badge variant="secondary">No results</Badge>
        <h2 className="text-xl font-semibold text-stone-900">No listing threads matched the current filters.</h2>
        <p className="max-w-xl text-sm leading-6 text-stone-600">
          Clear one or more filters to widen the feed, or wait for new analyzed threads to arrive.
        </p>
      </CardContent>
    </Card>
  );
}
