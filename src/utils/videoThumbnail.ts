const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|mkv|avi|ogv|3gp)(\?|#|$)/i;
const AUDIO_EXT_RE = /\.(mp3|m4a|wav|ogg|aac|flac)(\?|#|$)/i;

export interface MediaLike {
  fileType?: string;
  mimeType?: string;
  storageKey?: string;
  thumbKey?: string;
  viewUrl?: string;
  thumbUrl?: string;
}

export function isVideoMedia(media?: MediaLike | null): boolean {
  if (!media) return false;
  if (media.fileType === 'video') return true;
  if (media.mimeType && media.mimeType.startsWith('video/')) return true;
  if (media.storageKey && VIDEO_EXT_RE.test(media.storageKey)) return true;
  if (media.viewUrl && VIDEO_EXT_RE.test(media.viewUrl)) return true;
  return false;
}

export function isAudioMedia(media?: MediaLike | null): boolean {
  if (!media) return false;
  if (media.fileType === 'audio') return true;
  if (media.mimeType && media.mimeType.startsWith('audio/')) return true;
  if (media.storageKey && AUDIO_EXT_RE.test(media.storageKey)) return true;
  if (media.viewUrl && AUDIO_EXT_RE.test(media.viewUrl)) return true;
  return false;
}

/**
 * Returns a valid image poster URL for a video if a separate image thumbnail exists,
 * or undefined when thumbUrl points to a video stream itself.
 */
export function getVideoPosterUrl(media?: MediaLike | null): string | undefined {
  if (!media?.thumbUrl) return undefined;
  if (media.thumbKey && media.storageKey && media.thumbKey === media.storageKey) {
    return undefined;
  }
  if (media.thumbUrl === media.viewUrl) {
    return undefined;
  }
  if (media.thumbKey && VIDEO_EXT_RE.test(media.thumbKey)) {
    return undefined;
  }
  if (VIDEO_EXT_RE.test(media.thumbUrl)) {
    return undefined;
  }
  return media.thumbUrl;
}

/**
 * Captures a crisp JPEG poster frame from a selected video File in the browser.
 * Returns null gracefully if the browser cannot decode the video codec within 4 seconds.
 */
export async function extractVideoThumbnail(
  file: File
): Promise<{ thumbBlob: Blob; previewUrl: string; width: number; height: number } | null> {
  if (!file.type.startsWith('video/') && !VIDEO_EXT_RE.test(file.name)) {
    return null;
  }

  return new Promise((resolve) => {
    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);
    let settled = false;

    const finish = (result: { thumbBlob: Blob; previewUrl: string; width: number; height: number } | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {}
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {}
      resolve(result);
    };

    const timeoutId = setTimeout(() => finish(null), 4500);

    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const captureFrame = () => {
      try {
        const vw = video.videoWidth || 1280;
        const vh = video.videoHeight || 720;
        const maxThumbDim = 960;
        let tw = vw;
        let th = vh;
        if (tw > th && tw > maxThumbDim) {
          th = Math.round((th * maxThumbDim) / tw);
          tw = maxThumbDim;
        } else if (th >= tw && th > maxThumbDim) {
          tw = Math.round((tw * maxThumbDim) / th);
          th = maxThumbDim;
        }

        const canvas = document.createElement('canvas');
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext('2d');
        if (!ctx) return finish(null);
        ctx.drawImage(video, 0, 0, tw, th);

        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size === 0) return finish(null);
            const previewUrl = URL.createObjectURL(blob);
            finish({ thumbBlob: blob, previewUrl, width: vw, height: vh });
          },
          'image/jpeg',
          0.86
        );
      } catch {
        finish(null);
      }
    };

    video.onloadedmetadata = () => {
      try {
        const targetTime =
          Number.isFinite(video.duration) && video.duration > 0.4
            ? Math.min(1.0, video.duration * 0.15)
            : 0.05;
        video.currentTime = targetTime;
      } catch {
        // If seeking fails, wait for loadeddata
      }
    };

    video.onseeked = () => {
      captureFrame();
    };

    video.onloadeddata = () => {
      // Fallback if onseeked doesn't trigger (e.g. very short clip or currentTime=0)
      if (video.readyState >= 2 && video.currentTime === 0) {
        setTimeout(() => {
          if (!settled) captureFrame();
        }, 250);
      }
    };

    video.onerror = () => finish(null);
    video.src = objectUrl;
  });
}
