import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  RotateCcw,
  RotateCw,
  FlipHorizontal,
  Crop,
  Check,
  X,
  RefreshCw,
  Share2,
  Undo2,
  Sparkles,
} from 'lucide-react';

export type AspectRatioOption = 'free' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16';

interface NormalizedCrop {
  x: number; // 0..1 (percent from left of visual area)
  y: number; // 0..1 (percent from top of visual area)
  width: number; // 0..1 (percent width)
  height: number; // 0..1 (percent height)
}

export interface PhotoEditorResult {
  blob: Blob;
  thumbBlob: Blob;
  previewUrl: string;
  width: number;
  height: number;
}

interface PhotoEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  imageAlt?: string;
  onSave: (result: PhotoEditorResult) => Promise<void> | void;
  onSaveAndShare?: (result: PhotoEditorResult) => Promise<void> | void;
  title?: string;
}

export const PhotoEditorModal: React.FC<PhotoEditorModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  imageAlt = 'Editing photo',
  onSave,
  onSaveAndShare,
  title = 'Edit Photo',
}) => {
  const [rotation, setRotation] = useState<number>(0); // 0, 90, 180, 270
  const [flipH, setFlipH] = useState<boolean>(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioOption>('free');
  const [crop, setCrop] = useState<NormalizedCrop>({ x: 0.05, y: 0.05, width: 0.9, height: 0.9 });
  const [isSaving, setIsSaving] = useState(false);
  const [saveAction, setSaveAction] = useState<'save' | 'share' | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>({ width: 800, height: 600 });

  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragInteractionRef = useRef<{
    type: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
    startX: number;
    startY: number;
    startCrop: NormalizedCrop;
    containerWidth: number;
    containerHeight: number;
  } | null>(null);

  // Reset transforms whenever opened freshly with a new URL
  useEffect(() => {
    if (isOpen) {
      setRotation(0);
      setFlipH(false);
      setAspectRatio('free');
      setCrop({ x: 0.05, y: 0.05, width: 0.9, height: 0.9 });
      setIsSaving(false);
      setSaveAction(null);
      setImageLoaded(false);

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        imageRef.current = img;
        setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
        setImageLoaded(true);
      };
      img.onerror = () => {
        // Fallback without crossOrigin if CORS prevents canvas manipulation
        const fallbackImg = new Image();
        fallbackImg.onload = () => {
          imageRef.current = fallbackImg;
          setImageSize({ width: fallbackImg.naturalWidth, height: fallbackImg.naturalHeight });
          setImageLoaded(true);
        };
        fallbackImg.src = imageUrl;
      };
      img.src = imageUrl;
    }
  }, [isOpen, imageUrl]);

  // Adjust crop dimensions when changing aspect ratio
  const applyAspectRatio = useCallback(
    (ratio: AspectRatioOption) => {
      setAspectRatio(ratio);
      if (ratio === 'free') return;

      let targetRatio = 1;
      if (ratio === '1:1') targetRatio = 1;
      else if (ratio === '4:3') targetRatio = 4 / 3;
      else if (ratio === '3:4') targetRatio = 3 / 4;
      else if (ratio === '16:9') targetRatio = 16 / 9;
      else if (ratio === '9:16') targetRatio = 9 / 16;

      const isSideways = rotation === 90 || rotation === 270;
      const visualWidth = isSideways ? imageSize.height : imageSize.width;
      const visualHeight = isSideways ? imageSize.width : imageSize.height;
      const currentVisualAspect = visualWidth / (visualHeight || 1);

      // Fit crop within 0..1 space while matching targetRatio
      let newW = 0.85;
      let newH = (newW * currentVisualAspect) / targetRatio;

      if (newH > 0.85) {
        newH = 0.85;
        newW = (newH * targetRatio) / currentVisualAspect;
      }

      newW = Math.min(Math.max(0.1, newW), 0.96);
      newH = Math.min(Math.max(0.1, newH), 0.96);

      setCrop({
        x: (1 - newW) / 2,
        y: (1 - newH) / 2,
        width: newW,
        height: newH,
      });
    },
    [rotation, imageSize]
  );

  const handleRotateCw = () => {
    setRotation((prev) => (prev + 90) % 360);
    setCrop({ x: 0.05, y: 0.05, width: 0.9, height: 0.9 });
  };

  const handleRotateCcw = () => {
    setRotation((prev) => (prev + 270) % 360);
    setCrop({ x: 0.05, y: 0.05, width: 0.9, height: 0.9 });
  };

  const handleFlipHorizontal = () => {
    setFlipH((prev) => !prev);
  };

  const handleReset = () => {
    setRotation(0);
    setFlipH(false);
    setAspectRatio('free');
    setCrop({ x: 0.05, y: 0.05, width: 0.9, height: 0.9 });
  };

  // Pointer drag handling for crop box
  const startDrag = (e: React.PointerEvent, type: 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w') => {
    e.preventDefault();
    e.stopPropagation();

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    dragInteractionRef.current = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...crop },
      containerWidth: rect.width,
      containerHeight: rect.height,
    };

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragInteractionRef.current) return;
    const { type, startX, startY, startCrop, containerWidth, containerHeight } = dragInteractionRef.current;

    const deltaX = (e.clientX - startX) / containerWidth;
    const deltaY = (e.clientY - startY) / containerHeight;

    let { x, y, width, height } = startCrop;
    const minDim = 0.1; // minimum 10% dimension

    if (type === 'move') {
      x = Math.max(0, Math.min(1 - width, startCrop.x + deltaX));
      y = Math.max(0, Math.min(1 - height, startCrop.y + deltaY));
    } else {
      if (type.includes('e')) {
        width = Math.max(minDim, Math.min(1 - startCrop.x, startCrop.width + deltaX));
      }
      if (type.includes('s')) {
        height = Math.max(minDim, Math.min(1 - startCrop.y, startCrop.height + deltaY));
      }
      if (type.includes('w')) {
        const candidateWidth = Math.max(minDim, startCrop.width - deltaX);
        const candidateX = startCrop.x + (startCrop.width - candidateWidth);
        if (candidateX >= 0) {
          x = candidateX;
          width = candidateWidth;
        }
      }
      if (type.includes('n')) {
        const candidateHeight = Math.max(minDim, startCrop.height - deltaY);
        const candidateY = startCrop.y + (startCrop.height - candidateHeight);
        if (candidateY >= 0) {
          y = candidateY;
          height = candidateHeight;
        }
      }
    }

    setCrop({ x, y, width, height });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragInteractionRef.current) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // pointer capture may already be released
      }
      dragInteractionRef.current = null;
    }
  };

  // Render high-res edited image from source
  const generateEditedBlobs = async (): Promise<PhotoEditorResult | null> => {
    if (!imageRef.current) return null;
    const img = imageRef.current;

    const isSideways = rotation === 90 || rotation === 270;
    const rotatedW = isSideways ? img.naturalHeight : img.naturalWidth;
    const rotatedH = isSideways ? img.naturalWidth : img.naturalHeight;

    const cropPxX = Math.round(crop.x * rotatedW);
    const cropPxY = Math.round(crop.y * rotatedH);
    const cropPxW = Math.max(10, Math.round(crop.width * rotatedW));
    const cropPxH = Math.max(10, Math.round(crop.height * rotatedH));

    // 1. Offscreen Main Canvas
    const canvas = document.createElement('canvas');
    canvas.width = cropPxW;
    canvas.height = cropPxH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.save();
    // Offset by crop origin
    ctx.translate(-cropPxX, -cropPxY);

    // Rotate and flip around center of rotated bounding box
    ctx.translate(rotatedW / 2, rotatedH / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    if (flipH) {
      ctx.scale(-1, 1);
    }
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();

    // 2. High-DPI Retina Thumbnail Canvas (~960px max)
    const maxThumbDim = 960;
    let tw = cropPxW;
    let th = cropPxH;
    if (tw > th) {
      th = Math.round((th * maxThumbDim) / tw);
      tw = maxThumbDim;
    } else {
      tw = Math.round((tw * maxThumbDim) / th);
      th = maxThumbDim;
    }

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = tw;
    thumbCanvas.height = th;
    const tctx = thumbCanvas.getContext('2d');
    if (tctx) {
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = 'high';
      tctx.drawImage(canvas, 0, 0, tw, th);
    }

    const mainBlob = await new Promise<Blob>((res) => {
      canvas.toBlob((b) => res(b!), 'image/jpeg', 0.95);
    });

    const thumbBlob = await new Promise<Blob>((res) => {
      thumbCanvas.toBlob((b) => res(b!), 'image/jpeg', 0.88);
    });

    const previewUrl = URL.createObjectURL(mainBlob);

    return {
      blob: mainBlob,
      thumbBlob,
      previewUrl,
      width: cropPxW,
      height: cropPxH,
    };
  };

  const handleApply = async (action: 'save' | 'share') => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveAction(action);

    try {
      const result = await generateEditedBlobs();
      if (!result) throw new Error('Failed to generate edited image');

      if (action === 'share' && onSaveAndShare) {
        await onSaveAndShare(result);
      } else {
        await onSave(result);
      }
      onClose();
    } catch (err) {
      console.error('Failed to save edited photo:', err);
    } finally {
      setIsSaving(false);
      setSaveAction(null);
    }
  };

  if (!isOpen) return null;

  const isSideways = rotation === 90 || rotation === 270;
  const visualAspect = isSideways
    ? `${imageSize.height} / ${imageSize.width}`
    : `${imageSize.width} / ${imageSize.height}`;

  return (
    <div
      className="scrim z-50 select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) onClose();
      }}
    >
      <div className="relative w-full max-w-4xl max-h-[94vh] bg-neutral-900 border border-neutral-800 rounded-[26px] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden text-white">
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur-xs">
          <div className="flex items-center gap-2">
            <Crop className="w-5 h-5 text-amber-400" />
            <h3 className="font-semibold text-sm sm:text-base text-white">{title}</h3>
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium">
              <Sparkles className="w-3 h-3" /> Crop & Rotate
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs text-[var(--text-secondary)] hover:text-white transition flex items-center gap-1.5"
              title="Reset all edits"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
            <button
              onClick={onClose}
              disabled={isSaving}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-neutral-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Interactive Workspace */}
        <div className="flex-1 overflow-hidden p-4 flex items-center justify-center bg-neutral-950/70 relative">
          {!imageLoaded ? (
            <div className="flex flex-col items-center justify-center text-[var(--text-muted)] gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
              <span className="text-xs">Loading photo...</span>
            </div>
          ) : (
            <div
              ref={containerRef}
              className="relative max-w-full max-h-[58vh] flex items-center justify-center overflow-hidden rounded-xl border border-neutral-800/80 shadow-2xl touch-none select-none"
              style={{ aspectRatio: visualAspect }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              {/* Displayed Source Image with Rotation & Flip */}
              <img
                src={imageUrl}
                alt={imageAlt}
                className="w-full h-full object-contain pointer-events-none transition-transform duration-200"
                style={{
                  transform: `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1})`,
                }}
              />

              {/* Crop Box & Dimmed Dark Backdrop */}
              <div
                className="absolute border-2 border-amber-400 bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] cursor-move"
                style={{
                  left: `${crop.x * 100}%`,
                  top: `${crop.y * 100}%`,
                  width: `${crop.width * 100}%`,
                  height: `${crop.height * 100}%`,
                }}
                onPointerDown={(e) => startDrag(e, 'move')}
              >
                {/* 3x3 Rule-of-Thirds Grid Lines */}
                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40">
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

                {/* Corner Resizing Handles */}
                <div
                  className="absolute -top-2 -left-2 w-4 h-4 rounded-full bg-amber-400 border-2 border-neutral-900 cursor-nwse-resize shadow-md"
                  onPointerDown={(e) => startDrag(e, 'nw')}
                />
                <div
                  className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-amber-400 border-2 border-neutral-900 cursor-nesw-resize shadow-md"
                  onPointerDown={(e) => startDrag(e, 'ne')}
                />
                <div
                  className="absolute -bottom-2 -left-2 w-4 h-4 rounded-full bg-amber-400 border-2 border-neutral-900 cursor-nesw-resize shadow-md"
                  onPointerDown={(e) => startDrag(e, 'sw')}
                />
                <div
                  className="absolute -bottom-2 -right-2 w-4 h-4 rounded-full bg-amber-400 border-2 border-neutral-900 cursor-nwse-resize shadow-md"
                  onPointerDown={(e) => startDrag(e, 'se')}
                />

                {/* Edge Resizing Handles */}
                <div
                  className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-2 rounded-full bg-amber-400 border border-neutral-900 cursor-ns-resize"
                  onPointerDown={(e) => startDrag(e, 'n')}
                />
                <div
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-6 h-2 rounded-full bg-amber-400 border border-neutral-900 cursor-ns-resize"
                  onPointerDown={(e) => startDrag(e, 's')}
                />
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 h-6 w-2 rounded-full bg-amber-400 border border-neutral-900 cursor-ew-resize"
                  onPointerDown={(e) => startDrag(e, 'w')}
                />
                <div
                  className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 h-6 w-2 rounded-full bg-amber-400 border border-neutral-900 cursor-ew-resize"
                  onPointerDown={(e) => startDrag(e, 'e')}
                />
              </div>
            </div>
          )}
        </div>

        {/* Toolbar: Rotation & Aspect Ratio */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-900 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Rotation Controls */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] mr-1 hidden sm:inline">Rotate:</span>
              <button
                type="button"
                onClick={handleRotateCcw}
                className="px-2.5 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs text-[var(--text-secondary)] flex items-center gap-1 transition"
                title="Rotate 90° Counter-Clockwise"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>-90°</span>
              </button>

              <button
                type="button"
                onClick={handleRotateCw}
                className="px-2.5 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs text-[var(--text-secondary)] flex items-center gap-1 transition"
                title="Rotate 90° Clockwise"
              >
                <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                <span>+90°</span>
              </button>

              <button
                type="button"
                onClick={handleFlipHorizontal}
                className={`px-2.5 py-1.5 rounded-xl text-xs flex items-center gap-1 transition ${
                  flipH
                    ? 'bg-amber-500 text-neutral-950 font-semibold'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-[var(--text-secondary)]'
                }`}
                title="Flip Horizontally"
              >
                <FlipHorizontal className="w-3.5 h-3.5" />
                <span>Flip</span>
              </button>
            </div>

            {/* Aspect Ratio Presets */}
            <div className="flex items-center gap-1 overflow-x-auto max-w-full">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] mr-1 hidden sm:inline">Ratio:</span>
              {(['free', '1:1', '4:3', '3:4', '16:9', '9:16'] as AspectRatioOption[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => applyAspectRatio(r)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                    aspectRatio === r
                      ? 'bg-amber-500 text-neutral-950 font-semibold shadow-xs'
                      : 'bg-neutral-800 hover:bg-neutral-700 text-[var(--text-secondary)]'
                  }`}
                >
                  {r === 'free' ? 'Free' : r}
                </button>
              ))}
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-2 border-t border-neutral-800 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-3 sm:px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-muted)] hover:text-white transition"
            >
              Cancel
            </button>

            <div className="flex flex-wrap items-center gap-2 ml-auto">
              {onSaveAndShare && (
                <button
                  type="button"
                  onClick={() => handleApply('share')}
                  disabled={isSaving || !imageLoaded}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs transition flex items-center gap-1.5 border border-neutral-700 disabled:opacity-40"
                  title="Apply edits and share to circle"
                >
                  {isSaving && saveAction === 'share' ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  ) : (
                    <Share2 className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  <span>Save & Share</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleApply('save')}
                disabled={isSaving || !imageLoaded}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:opacity-95 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-md disabled:opacity-40"
              >
                {isSaving && saveAction === 'save' ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Apply & Save</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
