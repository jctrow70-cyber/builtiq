'use client';

import { useEffect, useState, type ComponentType, type ReactNode } from 'react';

export type ScreenModule<P> = { default: ComponentType<P> };
export type ScreenLoader<P> = () => Promise<ScreenModule<P>>;

const loaded = new Map<ScreenLoader<unknown>, ComponentType<unknown>>();
const pending = new Map<ScreenLoader<unknown>, Promise<ComponentType<unknown>>>();

export type PreloadNetwork = {
  saveData?: boolean;
  effectiveType?: string;
  deviceMemory?: number;
};

/** Skip idle preload on data-saver, very slow links, and low-memory devices. */
export function shouldPreloadScreens(network: PreloadNetwork) {
  if (network.saveData) return false;
  const type = String(network.effectiveType || '');
  if (type === 'slow-2g' || type === '2g') return false;
  if (typeof network.deviceMemory === 'number' && network.deviceMemory > 0 && network.deviceMemory <= 2) return false;
  return true;
}

export function readPreloadNetwork(): PreloadNetwork {
  if (typeof navigator === 'undefined') return {};
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
    deviceMemory?: number;
  };
  return {
    saveData: !!nav.connection?.saveData,
    effectiveType: nav.connection?.effectiveType,
    deviceMemory: nav.deviceMemory,
  };
}

export function readCachedScreen<P>(loader: ScreenLoader<P>): ComponentType<P> | null {
  return (loaded.get(loader as ScreenLoader<unknown>) as ComponentType<P> | undefined) || null;
}

/** Load once. A second call joins the same import and does not fetch the module again. */
export function loadLazyScreen<P>(loader: ScreenLoader<P>): Promise<ComponentType<P>> {
  const cached = readCachedScreen(loader);
  if (cached) return Promise.resolve(cached);
  const key = loader as ScreenLoader<unknown>;
  let request = pending.get(key) as Promise<ComponentType<P>> | undefined;
  if (!request) {
    request = loader().then((mod) => {
      loaded.set(key, mod.default as ComponentType<unknown>);
      pending.delete(key);
      return mod.default;
    });
    pending.set(key, request as Promise<ComponentType<unknown>>);
  }
  return request;
}

/** Import the module only. Does not render it or run its data loaders. */
export function preloadLazyScreen<P>(loader: ScreenLoader<P>) {
  void loadLazyScreen(loader).catch(() => {});
}

export function scheduleIdlePreload(start: () => void, network: PreloadNetwork = readPreloadNetwork()) {
  if (typeof window === 'undefined' || !shouldPreloadScreens(network)) return () => {};
  const run = () => {
    if (!shouldPreloadScreens(readPreloadNetwork())) return;
    start();
  };
  const idle = window.requestIdleCallback;
  if (typeof idle === 'function') {
    const id = idle(() => run(), { timeout: 5000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, 2000);
  return () => window.clearTimeout(id);
}

/**
 * First open shows `fallback` until the chunk arrives.
 * A later mount renders the cached component on the first paint.
 */
export function LazyScreen<P>({
  loader,
  fallback = null,
  children,
}: {
  loader: ScreenLoader<P>;
  fallback?: ReactNode;
  children: (Comp: ComponentType<P>) => ReactNode;
}): ReactNode {
  const [Comp, setComp] = useState<ComponentType<P> | null>(() => readCachedScreen(loader));
  useEffect(() => {
    if (Comp) return;
    let cancelled = false;
    loadLazyScreen(loader).then((next) => {
      if (!cancelled) setComp(() => next);
    });
    return () => {
      cancelled = true;
    };
  }, [loader, Comp]);
  if (!Comp) return fallback;
  return children(Comp);
}
