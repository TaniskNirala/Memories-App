import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  X,
  Upload,
  Crop,
  Grid,
  Check,
  RefreshCw,
  Image as ImageIcon,
  ArrowLeft,
  Maximize2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Group } from '../types/index.ts';
import { apiFetch, useAuth } from '../context/AuthContext.tsx';
import { errMessage } from '../lib/errors.ts';

export type CircleImageKind = 'icon' | 'banner';

interface CirclePhotoCandidate {
  id: string;
  postId: string;
  thumbUrl: string;
  fullUrl: string;
  width?: number;
  height?: number;
}

interface NormalizedCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CircleImageEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  kind: CircleImageKind;
  groups: Group[];
  initialGroupId?: string;
  /** When opened directly from "Set as Circle Banner / Icon" on a photo */
  initialImageUrl?: string;
  onSaved: (groupId: string, urls: { iconUrl?: string; bannerUrl?: string }) => void;
}

const BANNER_ASPECT = 3 / 1; // 1200 x 400 YouTube-style wide banner
const ICON_ASPECT = 1; // 512 x 512 square circle icon
const BANNER_OUT = { width: 1200, height: 400 };
const ICON_OUT = { width: 512, height: 512 };

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/** Computes a centered initial crop box locked to targetAspect in normalized 0..1 image coords. */
function makeCenteredCrop(imgW: number, imgH: number, targetAspect: number, scale = 0.88): NormalizedCrop {
  const imgAspect = imgW / (imgH || 1);
  // In normalized image coordinates: (normW * imgW) / (normH * imgH) = targetAspect
  // => normW / normH = targetAspect / imgAspect
  const normRatio = targetAspect / imgAspect;

  let width = scale;
  let height = width / normRatio;

  if (height > scale) {
    height = scale;
    width = height * normRatio;
  }

  width = clamp(width, 0.12, 1);
  height = clamp(height, 0.12, 1);

  return {
    x: (1 - width) / 2,
    y: (1 - height) / 2,
    width,
    height,
  };
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      const fallback = new Image();
      fallback.onload = () => resolve(fallback);
      fallback.onerror = () => reject(new Error('Could not load image'));
      fallback.src = src;
    };
    img.src = src;
  });
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const srcRatio = iw / ih;
  const dstRatio = dw / dh;

  let sx = 0;
  let sy = 0;
  let sw = iw;
  let sh = ih;

  if (srcRatio > dstRatio) {
    sw = ih * dstRatio;
    sx = (iw - sw) / 2;
  } else {
    sh = iw / dstRatio;
    sy = (ih - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

export const CircleImageEditorModal: React.FC<CircleImageEditorModalProps> = ({
  isOpen,
  onClose,
  kind,
  groups,
  initialGroupId,
  initialImageUrl,
  onSaved,
}) => {
  const { user, isAdmin } = useAuth();

  const editableGroups = useMemo(
    () =>
      groups.filter((g) =>
        typeof g.canEditImages === 'boolean'
          ? g.canEditImages
          : isAdmin || (!g.isEveryone && g.creatorId === user?.id)
      ),
    [groups, isAdmin, user?.id]
  );

  const [targetGroupId, setTargetGroupId] = useState<string>('');
  const [sourceTab, setSourceTab] = useState<'circle' | 'upload'>('circle');
  const [iconMode, setIconMode] = useState<'single' | 'collage'>('single');

  // Circle photo candidates
  const [circlePhotos, setCirclePhotos] = useState<CirclePhotoCandidate[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photosHasMore, setPhotosHasMore] = useState(false);
  const [photosOffset, setPhotosOffset] = useState(0);

  // Single photo cropper state
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null);
  const [cropImageReady, setCropImageReady] = useState(false);
  const [cropImageSize, setCropImageSize] = useState({ width: 1200, height: 800 });
  const [crop, setCrop] = useState<NormalizedCrop>({ x: 0.05, y: 0.25, width: 0.9, height: 0.5 });
  const cropImgRef = useRef<HTMLImageElement | null>(null);
  const cropBoxContainerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: 'move' | 'nw' | 'ne' | 'sw' | 'se';
    startX: number;
    startY: number;
    startCrop: NormalizedCrop;
    boxW: number;
    boxH: number;
  } | null>(null);

  // Multi-photo icon collage state (2-4 photos, icon only)
  const [collageUrls, setCollageUrls] = useState<string[]>([]);
  const [collageGap, setCollageGap] = useState<number>(6);
  const [collageBusy, setCollageBusy] = useState(false);
  const collageCanvasRef = useRef<HTMLCanvasElement>(null);

  // Local object URLs to clean up
  const objectUrlsRef = useRef<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const targetAspect = kind === 'banner' ? BANNER_ASPECT : ICON_ASPECT;
  const outputDims = kind === 'banner' ? BANNER_OUT : ICON_OUT;

  const revokeObjectUrls = useCallback(() => {
    for (const u of objectUrlsRef.current) {
      URL.revokeObjectURL(u);
    }
    objectUrlsRef.current = [];
  }, []);

  // Initialize state whenever modal opens
  useEffect(() => {
    if (!isOpen) {
      revokeObjectUrls();
      return;
    }

    setError(null);
    setSaving(false);
    setIconMode('single');
    setCollageUrls([]);
    setSourceTab('circle');

    const preferred =
      initialGroupId && editableGroups.some((g) => g.id === initialGroupId)
        ? initialGroupId
        : editableGroups[0]?.id || '';
    setTargetGroupId(preferred);

    if (initialImageUrl) {
      setCropSourceUrl(initialImageUrl);
    } else {
      setCropSourceUrl(null);
    }
  }, [isOpen, initialGroupId, initialImageUrl, editableGroups, revokeObjectUrls]);

  // Fetch circle photos when targetGroupId changes and we're picking from circle
  const fetchCirclePhotos = useCallback(
    async (groupId: string, reset: boolean, nextOffset = 0) => {
      if (!groupId) return;
      setPhotosLoading(true);
      try {
        const res = await apiFetch(`/api/groups/${groupId}/photos?limit=36&offset=${reset ? 0 : nextOffset}`);
        if (res.ok) {
          const data = await res.json();
          const list: CirclePhotoCandidate[] = data.photos || [];
          setCirclePhotos((prev) => (reset ? list : [...prev, ...list]));
          setPhotosOffset((reset ? 0 : nextOffset) + list.length);
          setPhotosHasMore(Boolean(data.hasMore));
        }
      } catch (e) {
        console.error('Failed to load circle photos', e);
      } finally {
        setPhotosLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!isOpen || !targetGroupId || cropSourceUrl) return;
    fetchCirclePhotos(targetGroupId, true, 0);
  }, [isOpen, targetGroupId, cropSourceUrl, fetchCirclePhotos]);

  // Load crop image when cropSourceUrl changes
  useEffect(() => {
    if (!isOpen || !cropSourceUrl) {
      setCropImageReady(false);
      cropImgRef.current = null;
      return;
    }

    let cancelled = false;
    setCropImageReady(false);
    setError(null);

    loadImageElement(cropSourceUrl)
      .then((img) => {
        if (cancelled) return;
        cropImgRef.current = img;
        const w = img.naturalWidth || img.width || 1200;
        const h = img.naturalHeight || img.height || 800;
        setCropImageSize({ width: w, height: h });
        setCrop(makeCenteredCrop(w, h, targetAspect, 0.88));
        setCropImageReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not load this photo for cropping. Try another photo.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, cropSourceUrl, targetAspect]);

  // Render live collage canvas whenever collageUrls or collageGap change
  useEffect(() => {
    if (!isOpen || kind !== 'icon' || iconMode !== 'collage' || collageUrls.length < 2) return;
    const canvas = collageCanvasRef.current;
    if (!canvas) return;
    let cancelled = false;

    setCollageBusy(true);
    Promise.all(collageUrls.slice(0, 4).map((u) => loadImageElement(u)))
      .then((imgs) => {
        if (cancelled) return;
        const size = ICON_OUT.width;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#0d0d14';
        ctx.fillRect(0, 0, size, size);

        const g = collageGap;
        const half = (size - g) / 2;

        if (imgs.length === 2) {
          drawCoverImage(ctx, imgs[0], 0, 0, half, size);
          drawCoverImage(ctx, imgs[1], half + g, 0, half, size);
        } else if (imgs.length === 3) {
          drawCoverImage(ctx, imgs[0], 0, 0, half, size);
          drawCoverImage(ctx, imgs[1], half + g, 0, half, half);
          drawCoverImage(ctx, imgs[2], half + g, half + g, half, half);
        } else if (imgs.length >= 4) {
          drawCoverImage(ctx, imgs[0], 0, 0, half, half);
          drawCoverImage(ctx, imgs[1], half + g, 0, half, half);
          drawCoverImage(ctx, imgs[2], 0, half + g, half, half);
          drawCoverImage(ctx, imgs[3], half + g, half + g, half, half);
        }
      })
      .catch(() => {
        if (!cancelled) setError('One of the selected photos could not be loaded for the collage.');
      })
      .finally(() => {
        if (!cancelled) setCollageBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, kind, iconMode, collageUrls, collageGap]);

  // Drag / resize handlers for interactive aspect-locked crop box
  useEffect(() => {
    const onMove = (clientX: number, clientY: number) => {
      const drag = dragRef.current;
      if (!drag) return;

      const dx = (clientX - drag.startX) / (drag.boxW || 1);
      const dy = (clientY - drag.startY) / (drag.boxH || 1);
      const s = drag.startCrop;
      const normRatio = targetAspect / (cropImageSize.width / (cropImageSize.height || 1));

      if (drag.mode === 'move') {
        setCrop({
          ...s,
          x: clamp(s.x + dx, 0, 1 - s.width),
          y: clamp(s.y + dy, 0, 1 - s.height),
        });
        return;
      }

      // Corner resize preserving exact aspect ratio
      const minW = Math.min(0.14, 0.14 * normRatio);
      let newW = s.width;

      if (drag.mode === 'se' || drag.mode === 'ne') {
        newW = s.width + dx;
      } else {
        newW = s.width - dx;
      }

      newW = clamp(newW, Math.max(0.1, minW), 1);
      let newH = newW / normRatio;

      if (newH > 1) {
        newH = 1;
        newW = newH * normRatio;
      }

      let newX = s.x;
      let newY = s.y;

      if (drag.mode === 'nw') {
        newX = s.x + s.width - newW;
        newY = s.y + s.height - newH;
      } else if (drag.mode === 'ne') {
        newY = s.y + s.height - newH;
      } else if (drag.mode === 'sw') {
        newX = s.x + s.width - newW;
      }

      // Keep strictly inside 0..1 bounds while preserving ratio
      if (newX < 0) {
        newX = 0;
        if (drag.mode === 'nw' || drag.mode === 'sw') {
          newW = s.x + s.width;
          newH = newW / normRatio;
          if (drag.mode === 'nw') newY = s.y + s.height - newH;
        }
      }
      if (newY < 0) {
        newY = 0;
        if (drag.mode === 'nw' || drag.mode === 'ne') {
          newH = s.y + s.height;
          newW = newH * normRatio;
          if (drag.mode === 'nw') newX = s.x + s.width - newW;
        }
      }
      if (newX + newW > 1) {
        newW = 1 - newX;
        newH = newW / normRatio;
      }
      if (newY + newH > 1) {
        newH = 1 - newY;
        newW = newH * normRatio;
        if (drag.mode === 'nw' || drag.mode === 'sw') {
          newX = clamp(s.x + s.width - newW, 0, 1 - newW);
        }
      }

      if (newW >= 0.08 && newH >= 0.08) {
        setCrop({ x: newX, y: newY, width: newW, height: newH });
      }
    };

    const handleMouseMove = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const handleTouchMove = (e: TouchEvent) => {
      if (dragRef.current && e.touches[0]) {
        e.preventDefault();
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const handleEnd = () => {
      dragRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [targetAspect, cropImageSize]);

  const currentScalePct = useMemo(() => {
    const maxCrop = makeCenteredCrop(cropImageSize.width, cropImageSize.height, targetAspect, 1);
    return Math.round(clamp((crop.width / (maxCrop.width || 1)) * 100, 15, 100));
  }, [crop.width, cropImageSize, targetAspect]);

  if (!isOpen) return null;

  const startDrag = (mode: 'move' | 'nw' | 'ne' | 'sw' | 'se', clientX: number, clientY: number) => {
    const rect = cropBoxContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      mode,
      startX: clientX,
      startY: clientY,
      startCrop: { ...crop },
      boxW: rect.width,
      boxH: rect.height,
    };
  };

  const handleScaleChange = (pct: number) => {
    const scale = clamp(pct / 100, 0.15, 1);
    const next = makeCenteredCrop(cropImageSize.width, cropImageSize.height, targetAspect, scale);
    // Keep current center if possible
    const cx = crop.x + crop.width / 2;
    const cy = crop.y + crop.height / 2;
    setCrop({
      width: next.width,
      height: next.height,
      x: clamp(cx - next.width / 2, 0, 1 - next.width),
      y: clamp(cy - next.height / 2, 0, 1 - next.height),
    });
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    setError(null);

    if (kind === 'icon' && files.length >= 2) {
      const picked = files.slice(0, 4).map((f) => {
        const u = URL.createObjectURL(f);
        objectUrlsRef.current.push(u);
        return u;
      });
      setIconMode('collage');
      setCollageUrls(picked);
      setCropSourceUrl(null);
      return;
    }

    const u = URL.createObjectURL(files[0]);
    objectUrlsRef.current.push(u);
    setCropSourceUrl(u);
  };

  const toggleCollagePhoto = (url: string) => {
    setError(null);
    setCollageUrls((prev) => {
      if (prev.includes(url)) return prev.filter((item) => item !== url);
      if (prev.length >= 4) return prev;
      return [...prev, url];
    });
  };

  const uploadBlob = async (blob: Blob) => {
    if (!targetGroupId) {
      setError('Pick a circle first');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('image', blob, `circle-${kind}.jpg`);
      const res = await apiFetch(`/api/groups/${targetGroupId}/image/${kind}`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Could not save circle ${kind}`);
        return;
      }
      onSaved(targetGroupId, { iconUrl: data.iconUrl, bannerUrl: data.bannerUrl });
      onClose();
    } catch (err) {
      setError(errMessage(err) || `Could not save circle ${kind}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCropped = async () => {
    const img = cropImgRef.current;
    if (!img || !cropImageReady) return;

    const canvas = document.createElement('canvas');
    canvas.width = outputDims.width;
    canvas.height = outputDims.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const sx = crop.x * cropImageSize.width;
    const sy = crop.y * cropImageSize.height;
    const sw = crop.width * cropImageSize.width;
    const sh = crop.height * cropImageSize.height;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outputDims.width, outputDims.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError('Could not render cropped image');
          return;
        }
        void uploadBlob(blob);
      },
      'image/jpeg',
      0.92
    );
  };

  const handleSaveCollage = async () => {
    const canvas = collageCanvasRef.current;
    if (!canvas || collageUrls.length < 2) return;

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError('Could not render icon collage');
          return;
        }
        void uploadBlob(blob);
      },
      'image/jpeg',
      0.92
    );
  };

  const selectedGroup = editableGroups.find((g) => g.id === targetGroupId);

  return (
    <div
      className="scrim z-[90]"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[24px] border border-[var(--border-color)] bg-[var(--bg-card)] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.9)]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-color)] px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {cropSourceUrl && !initialImageUrl && (
              <button
                type="button"
                onClick={() => setCropSourceUrl(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
                title="Back to photo picker"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0">
              <p className="eyebrow text-[0.6rem]">
                {kind === 'banner' ? '3:1 Circle Banner · 1200×400' : '1:1 Circle Icon · 512×512'}
              </p>
              <h3 className="truncate font-display text-sm font-bold text-[var(--text-primary)]">
                {cropSourceUrl
                  ? `Crop ${kind === 'banner' ? 'Circle Banner' : 'Circle Icon'}`
                  : kind === 'icon'
                    ? 'Customize Circle Icon'
                    : 'Customize Circle Banner'}
              </h3>
            </div>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Target Circle Picker (when multiple editable circles or opened from a photo) */}
        {editableGroups.length === 0 ? (
          <div className="p-6 text-center text-xs text-[var(--text-secondary)]">
            Only a circle creator or an admin can customize circle banners and icons.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {(initialImageUrl || editableGroups.length > 1) && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
                <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                  Target circle
                </span>
                <select
                  value={targetGroupId}
                  onChange={(e) => setTargetGroupId(e.target.value)}
                  className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] focus:outline-hidden"
                >
                  {editableGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* MODE 1: INTERACTIVE CROPPER */}
            {cropSourceUrl ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
                  <span className="flex items-center gap-1.5">
                    <Crop className="h-3.5 w-3.5 text-[var(--accent-amber)]" />
                    Drag frame or corners to crop to {kind === 'banner' ? '3:1 banner' : '1:1 icon'} size
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setCrop(makeCenteredCrop(cropImageSize.width, cropImageSize.height, targetAspect, 1))
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-[10.5px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    <Maximize2 className="h-3 w-3" /> Fit max
                  </button>
                </div>

                {/* Crop Viewport */}
                <div className="flex items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[#08080e] p-3">
                  {!cropImageReady ? (
                    <div className="flex h-56 items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
                      <RefreshCw className="h-4 w-4 animate-spin" /> Loading photo…
                    </div>
                  ) : (
                    <div
                      ref={cropBoxContainerRef}
                      className="relative inline-block max-h-[46vh] select-none overflow-hidden rounded-lg"
                    >
                      <img
                        src={cropSourceUrl}
                        alt="Crop preview"
                        draggable={false}
                        className="block max-h-[46vh] max-w-full object-contain"
                      />

                      {/* Darkened overlay around crop */}
                      <div
                        onMouseDown={(e) => {
                          e.preventDefault();
                          startDrag('move', e.clientX, e.clientY);
                        }}
                        onTouchStart={(e) => {
                          if (e.touches[0]) startDrag('move', e.touches[0].clientX, e.touches[0].clientY);
                        }}
                        style={{
                          left: `${crop.x * 100}%`,
                          top: `${crop.y * 100}%`,
                          width: `${crop.width * 100}%`,
                          height: `${crop.height * 100}%`,
                          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.62)',
                        }}
                        className="absolute cursor-move border-2 border-amber-400"
                      >
                        {/* Rule-of-thirds guides */}
                        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-35">
                          <div className="border-r border-b border-white/60" />
                          <div className="border-r border-b border-white/60" />
                          <div className="border-b border-white/60" />
                          <div className="border-r border-b border-white/60" />
                          <div className="border-r border-b border-white/60" />
                          <div className="border-b border-white/60" />
                          <div className="border-r border-white/60" />
                          <div className="border-r border-white/60" />
                          <div />
                        </div>

                        {/* Circular preview hint for icon */}
                        {kind === 'icon' && (
                          <div className="pointer-events-none absolute inset-0 rounded-full border border-dashed border-white/75" />
                        )}

                        {/* Corner Resize Handles */}
                        {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                          <span
                            key={corner}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              startDrag(corner, e.clientX, e.clientY);
                            }}
                            onTouchStart={(e) => {
                              e.stopPropagation();
                              if (e.touches[0]) startDrag(corner, e.touches[0].clientX, e.touches[0].clientY);
                            }}
                            className={`absolute h-3.5 w-3.5 rounded-full border border-neutral-900 bg-amber-400 shadow ${
                              corner === 'nw'
                                ? '-left-1.5 -top-1.5 cursor-nwse-resize'
                                : corner === 'ne'
                                  ? '-right-1.5 -top-1.5 cursor-nesw-resize'
                                  : corner === 'sw'
                                    ? '-bottom-1.5 -left-1.5 cursor-nesw-resize'
                                    : '-bottom-1.5 -right-1.5 cursor-nwse-resize'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Scale Slider */}
                <div className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
                  <span className="text-[11px] font-semibold text-[var(--text-secondary)] shrink-0">
                    Crop size
                  </span>
                  <input
                    type="range"
                    min={15}
                    max={100}
                    value={currentScalePct}
                    onChange={(e) => handleScaleChange(Number(e.target.value))}
                    className="flex-1 accent-[var(--accent-amber)]"
                  />
                  <span className="w-10 text-right font-mono text-[11px] text-[var(--text-muted)]">
                    {currentScalePct}%
                  </span>
                </div>
              </div>
            ) : (
              /* MODE 2: PICK PHOTO(S) OR UPLOAD */
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1">
                    <button
                      type="button"
                      onClick={() => setSourceTab('circle')}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        sourceTab === 'circle'
                          ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-2xs'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <ImageIcon className="mr-1.5 inline h-3.5 w-3.5" />
                      Circle Photos
                    </button>
                    <button
                      type="button"
                      onClick={() => setSourceTab('upload')}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        sourceTab === 'upload'
                          ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-2xs'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <Upload className="mr-1.5 inline h-3.5 w-3.5" />
                      Upload
                    </button>
                  </div>

                  {/* Single vs Multi-Photo Collage toggle (Circle Icon ONLY) */}
                  {kind === 'icon' && (
                    <div className="flex items-center gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIconMode('single');
                          setCollageUrls([]);
                        }}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                          iconMode === 'single'
                            ? 'bg-[var(--accent-amber)] text-[#1a1204]'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        <Crop className="mr-1 inline h-3 w-3" />
                        Single Photo
                      </button>
                      <button
                        type="button"
                        onClick={() => setIconMode('collage')}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                          iconMode === 'collage'
                            ? 'bg-[var(--accent-amber)] text-[#1a1204]'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        <Grid className="mr-1 inline h-3 w-3" />
                        Auto-Collage (2–4)
                      </button>
                    </div>
                  )}
                </div>

                {/* Live Collage Preview (when Icon + Collage mode) */}
                {kind === 'icon' && iconMode === 'collage' && (
                  <div className="flex flex-col sm:flex-row items-center gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5">
                    <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-full border-2 border-[var(--accent-amber)]/60 bg-[#0d0d14] shadow-md">
                      {collageUrls.length >= 2 ? (
                        <canvas ref={collageCanvasRef} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center p-2 text-center text-[10px] text-[var(--text-muted)]">
                          <Sparkles className="mb-1 h-4 w-4 text-[var(--accent-amber)]" />
                          Pick 2–4 photos
                        </div>
                      )}
                      {collageBusy && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <RefreshCw className="h-4 w-4 animate-spin text-white" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
                      <p className="text-xs font-bold text-[var(--text-primary)]">
                        Automatic Circle Icon Collage ({collageUrls.length}/4 selected)
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                        Select 2, 3, or 4 photos below (or upload multiple files) to automatically compose a square channel icon.
                      </p>
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                        <button
                          type="button"
                          onClick={() => setCollageGap((prev) => (prev === 0 ? 6 : 0))}
                          className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 py-1 text-[10.5px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        >
                          {collageGap > 0 ? 'Divider: Clean line' : 'Divider: Seamless'}
                        </button>
                        {collageUrls.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setCollageUrls([])}
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 py-1 text-[10.5px] font-semibold text-rose-400 hover:bg-rose-500/10"
                          >
                            <Trash2 className="h-3 w-3" /> Clear
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {sourceTab === 'upload' ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border-color)] bg-[var(--bg-surface)]/60 p-8 text-center transition hover:border-[var(--accent-amber)]/60"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      multiple={kind === 'icon'}
                      onChange={handleFilePick}
                      className="hidden"
                    />
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-amber)]/15 text-[var(--accent-amber)]">
                      <Upload className="h-5 w-5" />
                    </div>
                    <p className="text-xs font-bold text-[var(--text-primary)]">
                      {kind === 'icon'
                        ? 'Choose 1 photo to crop, or 2–4 photos for an automatic collage'
                        : 'Choose a photo from your device to crop as the 3:1 banner'}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">PNG, JPEG or WebP up to 4 MB</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {photosLoading && circlePhotos.length === 0 ? (
                      <div className="flex items-center justify-center gap-2 py-12 text-xs text-[var(--text-muted)]">
                        <RefreshCw className="h-4 w-4 animate-spin" /> Loading photos in {selectedGroup?.name || 'circle'}…
                      </div>
                    ) : circlePhotos.length === 0 ? (
                      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-center text-xs text-[var(--text-muted)]">
                        No photos in this circle yet. Switch to <strong>Upload</strong> to pick one from your device.
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                          {circlePhotos.map((p) => {
                            const selectedIdx = collageUrls.indexOf(p.fullUrl);
                            const isSelected = selectedIdx !== -1;
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  if (kind === 'icon' && iconMode === 'collage') {
                                    toggleCollagePhoto(p.fullUrl);
                                  } else {
                                    setCropSourceUrl(p.fullUrl);
                                  }
                                }}
                                className={`group relative aspect-square overflow-hidden rounded-xl border-2 bg-neutral-900 transition ${
                                  isSelected
                                    ? 'border-[var(--accent-amber)] ring-2 ring-[var(--accent-amber)]/35'
                                    : 'border-transparent hover:border-[var(--accent-amber)]/60'
                                }`}
                              >
                                <img
                                  src={p.thumbUrl}
                                  alt=""
                                  loading="lazy"
                                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                                />
                                {kind === 'icon' && iconMode === 'collage' && isSelected && (
                                  <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-amber)] text-[10px] font-bold text-[#1a1204] shadow">
                                    {selectedIdx + 1}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {photosHasMore && (
                          <div className="text-center">
                            <button
                              type="button"
                              disabled={photosLoading}
                              onClick={() => fetchCirclePhotos(targetGroupId, false, photosOffset)}
                              className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            >
                              {photosLoading ? 'Loading…' : 'Load more photos'}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {error && (
              <p className="tone-rose rounded-xl border px-3 py-2 text-xs font-semibold">{error}</p>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border-color)] px-5 py-3">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-xl px-3.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>

          {cropSourceUrl ? (
            <button
              type="button"
              disabled={saving || !cropImageReady || !targetGroupId}
              onClick={handleSaveCropped}
              className="btn btn-primary btn-sm flex items-center gap-1.5"
            >
              {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {saving ? 'Saving…' : kind === 'banner' ? 'Save Circle Banner' : 'Save Circle Icon'}
            </button>
          ) : (
            kind === 'icon' &&
            iconMode === 'collage' && (
              <button
                type="button"
                disabled={saving || collageBusy || collageUrls.length < 2 || !targetGroupId}
                onClick={handleSaveCollage}
                className="btn btn-primary btn-sm flex items-center gap-1.5"
              >
                {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {saving ? 'Saving…' : 'Save Collage Icon'}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
};
