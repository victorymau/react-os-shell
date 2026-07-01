import { useEffect, useRef, useCallback } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { PaginatedResponse } from './types';

interface UseInfiniteScrollOptions<T> {
  /** queryKey segments — arbitrary cache shapes (filters often include booleans,
   *  dates, undefined). Callers pass their natural filter shape. */
  queryKey: (string | Record<string, unknown>)[];
  fetchFn: (params: Record<string, string>) => Promise<PaginatedResponse<T>>;
  /** Extra query-string params. Undefined values are dropped so axios doesn't
   *  serialise them as "?key=undefined". */
  extraParams?: Record<string, string | undefined>;
  pageSize?: number;
}

/**
 * Wraps TanStack `useInfiniteQuery` with an IntersectionObserver-driven
 * sentinel so attaching `sentinelRef` to a div near the bottom of a scrollable
 * container auto-fires `fetchNextPage` as the user scrolls.
 *
 * Works inside modal windows too — the observer roots itself on the nearest
 * scrollable ancestor rather than the viewport.
 */
export function useInfiniteScroll<T>({
  queryKey,
  fetchFn,
  extraParams = {},
  pageSize: _pageSize = 25,
}: UseInfiniteScrollOptions<T>) {
  void _pageSize; // reserved for future use; current backend defaults are fine
  const sentinelRef = useRef<HTMLDivElement>(null);

  const cleanExtra = Object.fromEntries(
    Object.entries(extraParams).filter(([, v]) => v !== undefined),
  ) as Record<string, string>;

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam = 1 }) =>
      fetchFn({ page: String(pageParam), ...cleanExtra }),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.next) {
        return allPages.length + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
  });

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    // Find the nearest scrollable ancestor — using root:null (viewport) fails
    // when the list is inside a modal window because the sentinel can scroll
    // into view within the modal's own overflow container without ever
    // entering the viewport.
    let scrollParent: HTMLElement | null = el.parentElement;
    while (scrollParent) {
      const overflow = getComputedStyle(scrollParent).overflowY;
      if (overflow === 'auto' || overflow === 'scroll') break;
      scrollParent = scrollParent.parentElement;
    }

    const observer = new IntersectionObserver(handleObserver, {
      root: scrollParent,
      rootMargin: '200px',
      threshold: 0,
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [handleObserver]);

  // Defensive: drop any null/undefined entries that creep in from a malformed
  // page payload (e.g. backend serializer returns null for soft-deleted
  // records). Otherwise downstream `.map(r => r.id)` blows up the whole list.
  //
  // Then de-dupe by `id` across pages. Offset pagination over a non-unique
  // ordering key — or a background refetch of the already-loaded pages while
  // the underlying data shifts — can hand back the same record on two pages;
  // flattening them would render that row twice (the duplicate-row bug). Keep
  // the first occurrence. Items without an `id` can't be de-duped, so keep them.
  const seenIds = new Set<unknown>();
  const allItems = (query.data?.pages.flatMap((page) => page?.results ?? []) ?? [])
    .filter((x): x is T => x != null)
    .filter((x) => {
      const id = (x as { id?: unknown }).id;
      if (id == null) return true;
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });
  const totalCount = query.data?.pages[0]?.count ?? 0;

  return {
    items: allItems,
    totalCount,
    isLoading: query.isLoading,
    isFetchingNextPage,
    hasNextPage: !!hasNextPage,
    sentinelRef,
    refetch: query.refetch,
  };
}
