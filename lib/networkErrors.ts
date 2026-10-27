function isTransientNetworkMessage(message?: string | null) {
  const msg = String(message || '').trim();
  const lower = msg.toLowerCase();
  // Safari/iOS often reports aborted or flaky fetches as "Load failed" /
  // "TypeError: Load failed". Empty messages are not treated as network
  // failures — callers should keep their own fallback.
  return (
    lower === 'load failed' ||
    lower === 'failed to fetch' ||
    lower === 'typeerror: load failed' ||
    lower === 'networkerror when attempting to fetch resource.' ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('access control') ||
    lower.includes('the network connection was lost') ||
    lower.includes('load failed')
  );
}

function errorMessageOf(error?: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || '');
  }
  return String(error || '');
}

/** True for Safari/iOS "TypeError: Load failed" and similar flaky fetch errors. */
export function isTransientNetworkError(error?: unknown) {
  return isTransientNetworkMessage(errorMessageOf(error));
}

export function friendlyWriteError(error?: unknown, fallback = 'Something went wrong. Please try again.') {
  const msg = errorMessageOf(error);
  if (isTransientNetworkMessage(msg)) {
    return 'Could not reach BuildIQ just then (Load failed / network). Check your connection and try again.';
  }
  return msg || fallback;
}

/**
 * Retries a Supabase write when the client reports a transient network failure
 * (common on mobile Safari while logging sets). Non-network errors return immediately.
 */
export async function retryTransientSupabaseWrite<T extends { error: unknown }>(
  run: () => PromiseLike<T>,
  opts?: { attempts?: number; delayMs?: number }
): Promise<T> {
  const attempts = Math.max(1, opts?.attempts ?? 3);
  const delayMs = Math.max(0, opts?.delayMs ?? 400);
  let last: T | undefined;

  for (let i = 0; i < attempts; i++) {
    try {
      last = await run();
      if (!last?.error || !isTransientNetworkError(last.error) || i === attempts - 1) {
        return last;
      }
    } catch (error) {
      if (!isTransientNetworkError(error) || i === attempts - 1) throw error;
      last = { error } as T;
    }
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
    }
  }

  return last as T;
}
