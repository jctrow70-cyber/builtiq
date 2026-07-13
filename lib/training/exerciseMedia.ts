/** Exercise catalog media helpers for thumbnails and form guides */

export type ExerciseGuidePayload = {
  title: string;
  images: string[];
  videoUrl: string | null;
  embedUrl: string | null;
  instructions: string | null;
  hasVideo: boolean;
};

/** Legacy import host — rewrite to jsDelivr for more reliable browser hotlinking */
const FEDB_RAW_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const FEDB_CDN_BASE = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/';
const FEDB_PAGES_BASE = 'https://yuhonas.github.io/free-exercise-db/exercises/';

function cleanUrl(raw?: string | null) {
  const url = String(raw || '').trim();
  return url || null;
}

function isYoutubeUrl(url: string) {
  return /youtube\.com|youtu\.be/i.test(url);
}

function youtubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace('/', '');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    const id = u.searchParams.get('v');
    return id ? `https://www.youtube.com/embed/${id}` : null;
  } catch {
    return null;
  }
}

function isVimeoUrl(url: string) {
  return /vimeo\.com/i.test(url);
}

function vimeoEmbedUrl(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  return m ? `https://player.vimeo.com/video/${m[1]}` : null;
}

function isDirectVideoUrl(url: string) {
  return /\.(mp4|webm|m4v|mov)(\?|$)/i.test(url);
}

export function isStillImageUrl(url: string) {
  return /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url);
}

function deriveAlternateImage(url: string): string | null {
  if (/\/0\.(jpg|jpeg|png|webp|gif)$/i.test(url)) {
    return url.replace(/\/0\.(jpg|jpeg|png|webp|gif)$/i, '/1.$1');
  }
  return null;
}

/**
 * Normalize catalog media URLs for display.
 * - Rewrites Free Exercise DB raw.githubusercontent URLs to jsDelivr
 * - Expands relative FEDB paths (e.g. `Bench_Press/0.jpg`) to absolute CDN URLs
 */
export function resolveExerciseMediaUrl(raw?: string | null): string | null {
  const url = cleanUrl(raw);
  if (!url) return null;

  if (url.startsWith(FEDB_CDN_BASE) || url.startsWith(FEDB_PAGES_BASE)) return url;
  if (url.startsWith(FEDB_RAW_BASE)) return FEDB_CDN_BASE + url.slice(FEDB_RAW_BASE.length);

  // Relative path from older/partial imports
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url) && /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url)) {
    return FEDB_CDN_BASE + url.replace(/^\//, '');
  }

  return url;
}

function pushUniqueImage(images: string[], raw?: string | null) {
  const resolved = resolveExerciseMediaUrl(raw);
  if (resolved && !images.includes(resolved)) images.push(resolved);
}

export function getExerciseThumb(item?: {
  image_url?: string | null;
  media_url?: string | null;
} | null): string | null {
  const fromImage = resolveExerciseMediaUrl(item?.image_url);
  if (fromImage) return fromImage;

  const media = resolveExerciseMediaUrl(item?.media_url);
  if (media && isStillImageUrl(media)) return media;
  return null;
}

export function hasExerciseGuide(item?: {
  image_url?: string | null;
  media_url?: string | null;
  instructions?: string | null;
} | null): boolean {
  if (!item) return false;
  return !!(cleanUrl(item.image_url) || cleanUrl(item.media_url) || String(item.instructions || '').trim());
}

export function getExerciseGuidePayload(
  item?: {
    name?: string;
    image_url?: string | null;
    media_url?: string | null;
    instructions?: string | null;
  } | null,
  titleFallback = 'Exercise'
): ExerciseGuidePayload | null {
  if (!item || !hasExerciseGuide(item)) return null;

  const images: string[] = [];
  const thumb = resolveExerciseMediaUrl(item.image_url);
  const media = resolveExerciseMediaUrl(item.media_url);

  pushUniqueImage(images, thumb);
  if (thumb) pushUniqueImage(images, deriveAlternateImage(thumb));

  // Still images / GIFs belong in the photo strip — not the video player
  if (media && isStillImageUrl(media)) {
    pushUniqueImage(images, media);
  } else if (media && !isDirectVideoUrl(media) && !isYoutubeUrl(media) && !isVimeoUrl(media)) {
    pushUniqueImage(images, media);
  }

  let embedUrl: string | null = null;
  let videoUrl: string | null = null;
  if (media && !isStillImageUrl(media)) {
    if (isYoutubeUrl(media)) embedUrl = youtubeEmbedUrl(media);
    else if (isVimeoUrl(media)) embedUrl = vimeoEmbedUrl(media);
    else if (isDirectVideoUrl(media)) videoUrl = media;
  }

  return {
    title: String(item.name || titleFallback),
    images,
    videoUrl,
    embedUrl,
    instructions: String(item.instructions || '').trim() || null,
    hasVideo: !!(embedUrl || videoUrl),
  };
}
