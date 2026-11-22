import exifr from 'exifr';

// Client-side resizing (~2048px max dimension) and thumbnail (~400px) with resilient fallback
export async function resizeImage(file: File): Promise<{ mainBlob: Blob; thumbBlob: Blob; width: number; height: number }> {
  return new Promise((resolve) => {
    // If not an image or SVG/GIF, pass through directly
    if (!file.type.startsWith('image/') || file.type.includes('svg') || file.type.includes('gif')) {
      return resolve({
        mainBlob: file,
        thumbBlob: file,
        width: 1200,
        height: 800,
      });
    }

    const img = new window.Image();
    const url = URL.createObjectURL(file);

    const cleanup = () => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // revoking a blob URL can only fail if it is already revoked
      }
    };

    img.onload = async () => {
      try {
        const originalWidth = img.naturalWidth || img.width || 800;
        const originalHeight = img.naturalHeight || img.height || 600;

        // 1. High-Fidelity Main Image:
        // If image is within 4096px (Ultra-HD 4K) and under 25MB, preserve the original untouched file
        // to retain maximum crispness, original camera color space, and zero compression loss!
        const maxDim = 4096;
        let mainBlob: Blob = file;
        let targetWidth = originalWidth;
        let targetHeight = originalHeight;

        if (originalWidth > maxDim || originalHeight > maxDim) {
          if (targetWidth > targetHeight) {
            targetHeight = Math.round((targetHeight * maxDim) / targetWidth);
            targetWidth = maxDim;
          } else {
            targetWidth = Math.round((targetWidth * maxDim) / targetHeight);
            targetHeight = maxDim;
          }

          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
          }

          mainBlob = await new Promise<Blob>((res) => {
            try {
              canvas.toBlob(
                (b) => res(b || file),
                file.type === 'image/png' ? 'image/png' : 'image/jpeg',
                0.95
              );
            } catch {
              res(file);
            }
          });
        }

        // 2. High-DPI Retina Thumbnail: scale to max 960px at 0.88 quality with high smoothing
        const thumbDim = 960;
        let tw = targetWidth;
        let th = targetHeight;
        if (tw > th) {
          th = Math.round((th * thumbDim) / tw);
          tw = thumbDim;
        } else {
          tw = Math.round((tw * thumbDim) / th);
          th = thumbDim;
        }

        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = tw;
        thumbCanvas.height = th;
        const tctx = thumbCanvas.getContext('2d');
        if (tctx) {
          tctx.imageSmoothingEnabled = true;
          tctx.imageSmoothingQuality = 'high';
          tctx.drawImage(img, 0, 0, tw, th);
        }

        cleanup();

        const thumbBlob = await new Promise<Blob>((res) => {
          try {
            thumbCanvas.toBlob((b) => res(b || file), 'image/jpeg', 0.88);
          } catch {
            res(file);
          }
        });

        resolve({
          mainBlob: mainBlob || file,
          thumbBlob: thumbBlob || file,
          width: targetWidth,
          height: targetHeight,
        });
      } catch (err) {
        cleanup();
        resolve({
          mainBlob: file,
          thumbBlob: file,
          width: 1200,
          height: 800,
        });
      }
    };

    img.onerror = () => {
      cleanup();
      resolve({
        mainBlob: file,
        thumbBlob: file,
        width: 1200,
        height: 800,
      });
    };

    img.src = url;
  });
}

// Extract capture date from EXIF metadata (or lastModified date)
export async function extractPhotoDate(file: File): Promise<string | null> {
  try {
    if (file.type.startsWith('image/')) {
      const data = await exifr.parse(file, [
        'DateTimeOriginal',
        'CreateDate',
        'DateCreated',
        'ModifyDate',
        'OffsetTimeOriginal',
      ]);

      const candidate = data?.DateTimeOriginal || data?.CreateDate || data?.DateCreated || data?.ModifyDate;
      if (candidate instanceof Date && !isNaN(candidate.getTime())) {
        return candidate.toISOString().slice(0, 10);
      }
      if (typeof candidate === 'string') {
        const parsed = new Date(candidate);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().slice(0, 10);
        }
      }
    }
  } catch (e) {
    console.debug('EXIF extraction skipped or unsupported for file', file.name, e);
  }

  // Fallback to file.lastModified timestamp if plausible
  if (file.lastModified && typeof file.lastModified === 'number') {
    try {
      const mod = new Date(file.lastModified);
      if (!isNaN(mod.getTime()) && mod.getTime() > 0) {
        return mod.toISOString().slice(0, 10);
      }
    } catch {
      // unreadable lastModified: fall back to no date
    }
  }

  return null;
}
