/** Exercise catalog media helpers for thumbnails and form guides */

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

function deriveAlternateImage(url: string): string | null {
  if (/\/0\.(jpg|jpeg|png|webp)$/i.test(url)) {
    return url.replace(/\/0\.(jpg|jpeg|png|webp)$/i, '/1.$1');
  }
  return null;
}

export function getExerciseThumb(item?: { image_url?: string | null } | null): string | null {
  return cleanUrl(item?.image_url);
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
  const thumb = cleanUrl(item.image_url);
  const media = cleanUrl(item.media_url);
  if (thumb) images.push(thumb);
  if (thumb) {
    const alt = deriveAlternateImage(thumb);
    if (alt && !images.includes(alt)) images.push(alt);
  }
  if (media && !images.includes(media) && !isDirectVideoUrl(media) && !isYoutubeUrl(media) && !isVimeoUrl(media)) {
    images.push(media);
  }

  let embedUrl: string | null = null;
  let videoUrl: string | null = null;
  if (media) {
    if (isYoutubeUrl(media)) embedUrl = youtubeEmbedUrl(media);
    else if (isVimeoUrl(media)) embedUrl = vimeoEmbedUrl(media);
    else if (isDirectVideoUrl(media) || /\.gif(\?|$)/i.test(media)) videoUrl = media;
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
