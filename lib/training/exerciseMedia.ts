/** Exercise catalog media helpers for thumbnails and form guides */

import { instructionsForDisplay, isBlockedExerciseMediaUrl } from './contentRights';

export type ExerciseGuidePayload = {
  title: string;
  images: string[];
  videoUrl: string | null;
  embedUrl: string | null;
  instructions: string | null;
  hasVideo: boolean;
};

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
 * ExerciseDB and Free Exercise DB photo hosts are omitted until commercial rights are verified.
 */
export function resolveExerciseMediaUrl(raw?: string | null): string | null {
  const url = cleanUrl(raw);
  if (!url || isBlockedExerciseMediaUrl(url)) return null;
  return url;
}

function pushUniqueImage(images: string[], raw?: string | null) {
  const resolved = resolveExerciseMediaUrl(raw);
  if (resolved && !images.includes(resolved)) images.push(resolved);
}

export function getExerciseThumb(item?: {
  image_url?: string | null;
  gif_url?: string | null;
  media_url?: string | null;
} | null): string | null {
  const fromImage = resolveExerciseMediaUrl(item?.image_url);
  if (fromImage) return fromImage;

  const fromGif = resolveExerciseMediaUrl(item?.gif_url);
  if (fromGif) return fromGif;

  const media = resolveExerciseMediaUrl(item?.media_url);
  if (media && isStillImageUrl(media)) return media;
  return null;
}

export function hasExerciseGuide(item?: {
  image_url?: string | null;
  gif_url?: string | null;
  media_url?: string | null;
  instructions?: string | null;
} | null): boolean {
  if (!item) return false;
  return !!(
    resolveExerciseMediaUrl(item.image_url) ||
    resolveExerciseMediaUrl(item.gif_url) ||
    resolveExerciseMediaUrl(item.media_url) ||
    instructionsForDisplay(item)
  );
}

export function getExerciseGuidePayload(
  item?: {
    name?: string;
    image_url?: string | null;
    gif_url?: string | null;
    media_url?: string | null;
    instructions?: string | null;
  } | null,
  titleFallback = 'Exercise'
): ExerciseGuidePayload | null {
  if (!item || !hasExerciseGuide(item)) return null;

  const images: string[] = [];
  const thumb = resolveExerciseMediaUrl(item.image_url);
  const gif = resolveExerciseMediaUrl(item.gif_url);
  const media = resolveExerciseMediaUrl(item.media_url);

  pushUniqueImage(images, thumb);
  if (thumb) pushUniqueImage(images, deriveAlternateImage(thumb));
  pushUniqueImage(images, gif);

  // Still images / GIFs belong in the photo strip — not the video player
  if (media && media !== gif) {
    if (isStillImageUrl(media)) {
      pushUniqueImage(images, media);
    } else if (!isDirectVideoUrl(media) && !isYoutubeUrl(media) && !isVimeoUrl(media)) {
      pushUniqueImage(images, media);
    }
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
    instructions: instructionsForDisplay(item),
    hasVideo: !!(embedUrl || videoUrl || gif),
  };
}
