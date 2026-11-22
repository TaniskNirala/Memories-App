import React from 'react';
import { FeedItem, SinglePostFeedItem } from '../../types/index.ts';
import { Sparkles, Images, Play, Maximize2, Grid } from 'lucide-react';
import { isVideoMedia, getVideoPosterUrl } from '../../utils/videoThumbnail.ts';
import { TgDeletedBadge } from '../TgDeletedBadge.tsx';

export interface PostCollageProps {
  item: SinglePostFeedItem;
  onOpenViewer: (item: FeedItem, initialIndex?: number, initialMode?: 'grid' | 'expanded') => void;
  priority?: boolean;
}

export const PostCollage: React.FC<PostCollageProps> = React.memo(({ item, onOpenViewer, priority = false }) => {
  const files = item.files || [];
  const count = files.length;
  const imgLoading = priority ? 'eager' : 'lazy';

  if (count === 0) {
    return (
      <div className="w-full aspect-16/9 sm:aspect-2/1 rounded-xl bg-neutral-900 border border-[var(--border-color)] flex items-center justify-center mb-3">
        <Sparkles className="w-8 h-8 text-amber-300 opacity-60" />
      </div>
    );
  }

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>, storageKey?: string) => {
    const target = e.currentTarget;
    const stage = target.dataset.fallbackStage || '0';
    if (stage === '0' && storageKey) {
      target.dataset.fallbackStage = '1';
      // If thumb failed, try full res; if full res failed, try thumb
      const altKey = storageKey.includes('_thumb')
        ? storageKey.replace('_thumb', '')
        : storageKey.replace(/(\.[a-zA-Z0-9]+)$/, '_thumb$1');
      target.src = `/api/storage/view?key=${encodeURIComponent(altKey)}`;
    } else if (stage === '1' && storageKey) {
      target.dataset.fallbackStage = '2';
      target.src = `/api/storage/view?key=${encodeURIComponent(storageKey)}`;
    } else if (stage === '2' && storageKey) {
      target.dataset.fallbackStage = '3';
      const clean = storageKey.replace(/^[/\\]+/, '').replace(/^uploads[/\\]+/, '');
      target.src = `/uploads/${clean}`;
    } else if (stage !== '4') {
      target.dataset.fallbackStage = '4';
      target.src =
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="100%" height="100%" fill="%23181829"/><circle cx="400" cy="270" r="45" fill="%23f59e0b" opacity="0.2"/><path d="M370 295 L400 245 L430 295 Z" fill="%23f59e0b" opacity="0.8"/><circle cx="430" cy="245" r="9" fill="%23f43f5e" opacity="0.8"/></svg>';
    }
  };

  const renderMediaTile = (
    f: SinglePostFeedItem['files'][number],
    alt: string,
    imgClassName: string
  ) => {
    if (isVideoMedia(f)) {
      const posterUrl = getVideoPosterUrl(f);
      return (
        <>
          {posterUrl ? (
            <img
              src={posterUrl}
              alt={alt}
              loading={imgLoading}
              decoding="async"
              referrerPolicy="no-referrer"
              onError={(e) => handleImageError(e, f.thumbKey || f.storageKey)}
              className={imgClassName}
            />
          ) : (
            <video
              src={f.viewUrl ? `${f.viewUrl}#t=0.1` : undefined}
              muted
              playsInline
              preload="none"
              className={imgClassName}
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-black/75 border border-white/25 flex items-center justify-center text-white shadow-lg">
              <Play className="w-4 h-4 fill-current text-amber-400 ml-0.5" />
            </div>
          </div>
          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/75 text-white text-[9px] font-bold uppercase tracking-wider pointer-events-none">
            Video
          </span>
          {f.tgDeleted && <TgDeletedBadge compact />}
        </>
      );
    }

    return (
      <>
        <img
          src={f.thumbUrl || f.viewUrl}
          alt={alt}
          loading={imgLoading}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={(e) => handleImageError(e, f.thumbKey || f.storageKey)}
          className={imgClassName}
        />
        {f.tgDeleted && <TgDeletedBadge compact />}
      </>
    );
  };

  // 1 photo or video: Full width
  if (count === 1) {
    const f = files[0];
    if (isVideoMedia(f)) {
      const posterUrl = getVideoPosterUrl(f);
      return (
        <div className="relative w-full aspect-16/9 sm:aspect-2/1 rounded-xl overflow-hidden bg-black border border-[var(--border-color)] mb-3 group/media">
          <video
            src={f.viewUrl}
            poster={posterUrl}
            controls
            playsInline
            preload={posterUrl ? 'none' : 'metadata'}
            onClick={(e) => e.stopPropagation()}
            className="w-full h-full object-contain bg-black"
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenViewer(item, 0, 'expanded');
            }}
            className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full bg-black/80 hover:bg-black/90 border border-white/20 text-white text-[11px] font-medium flex items-center gap-1 shadow-lg transition cursor-pointer"
            title="Open video in full viewer"
          >
            <Maximize2 className="w-3 h-3 text-amber-400" />
            <span>Expand</span>
          </button>
          {f.tgDeleted && <TgDeletedBadge position="top-left" />}
        </div>
      );
    }

    return (
      <div
        onClick={() => onOpenViewer(item, 0, 'expanded')}
        className="relative w-full aspect-16/9 sm:aspect-2/1 rounded-xl overflow-hidden cursor-pointer bg-neutral-900 border border-[var(--border-color)] mb-3 group/media"
      >
        <img
          src={f.thumbUrl || f.viewUrl}
          alt={item.caption || 'Memory photo'}
          loading={imgLoading}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          referrerPolicy="no-referrer"
          onError={(e) => handleImageError(e, f.thumbKey || f.storageKey)}
          className="w-full h-full object-cover sm:group-hover/media:scale-[1.02] transition-transform duration-300"
        />
        {f.tgDeleted && <TgDeletedBadge />}
      </div>
    );
  }

  // 2 items: Split columns side-by-side
  if (count === 2) {
    return (
      <div className="relative w-full aspect-16/10 rounded-xl overflow-hidden mb-3 border border-[var(--border-color)] bg-neutral-950 group/media shadow-md">
        <div className="grid grid-cols-2 gap-1.5 w-full h-full">
          {files.map((f, idx) => (
            <div
              key={f.id || idx}
              onClick={(e) => {
                e.stopPropagation();
                onOpenViewer(item, idx, 'expanded');
              }}
              className="relative w-full h-full overflow-hidden cursor-pointer bg-neutral-900"
            >
              {renderMediaTile(
                f,
                `${item.caption || 'Memory'} ${idx + 1}`,
                'w-full h-full object-cover hover:scale-105 transition-transform duration-300'
              )}
            </div>
          ))}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenViewer(item, 0, 'grid');
          }}
          className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full bg-black/80 hover:bg-black/90 border border-white/20 text-white text-[11px] font-medium flex items-center gap-1.5 shadow-lg transition"
        >
          <Images className="w-3.5 h-3.5 text-amber-400" />
          <span>2 Items</span>
        </button>
      </div>
    );
  }

  // 3 items: 1 large feature item on left, 2 stacked on right
  if (count === 3) {
    return (
      <div className="relative w-full aspect-16/10 rounded-xl overflow-hidden mb-3 border border-[var(--border-color)] bg-neutral-950 group/media shadow-md">
        <div className="grid grid-cols-3 gap-1.5 w-full h-full">
          <div
            onClick={(e) => {
              e.stopPropagation();
              onOpenViewer(item, 0, 'expanded');
            }}
            className="col-span-2 relative w-full h-full overflow-hidden cursor-pointer bg-neutral-900"
          >
            {renderMediaTile(
              files[0],
              `${item.caption || 'Memory'} 1`,
              'w-full h-full object-cover hover:scale-105 transition-transform duration-300'
            )}
          </div>

          <div className="col-span-1 grid grid-rows-2 gap-1.5 h-full">
            {files.slice(1, 3).map((f, i) => {
              const realIdx = i + 1;
              return (
                <div
                  key={f.id || realIdx}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenViewer(item, realIdx, 'expanded');
                  }}
                  className="relative w-full h-full overflow-hidden cursor-pointer bg-neutral-900"
                >
                  {renderMediaTile(
                    f,
                    `${item.caption || 'Memory'} ${realIdx + 1}`,
                    'w-full h-full object-cover hover:scale-105 transition-transform duration-300'
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenViewer(item, 0, 'grid');
          }}
          className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full bg-black/80 hover:bg-black/90 border border-white/20 text-white text-[11px] font-medium flex items-center gap-1.5 shadow-lg transition"
        >
          <Images className="w-3.5 h-3.5 text-amber-400" />
          <span>3 Items</span>
        </button>
      </div>
    );
  }

  // 4 items: 2x2 grid
  if (count === 4) {
    return (
      <div className="relative w-full aspect-16/10 rounded-xl overflow-hidden mb-3 border border-[var(--border-color)] bg-neutral-950 group/media shadow-md">
        <div className="grid grid-cols-2 gap-1.5 w-full h-full">
          {files.map((f, idx) => (
            <div
              key={f.id || idx}
              onClick={(e) => {
                e.stopPropagation();
                onOpenViewer(item, idx, 'expanded');
              }}
              className="relative w-full h-full overflow-hidden cursor-pointer bg-neutral-900"
            >
              {renderMediaTile(
                f,
                `${item.caption || 'Memory'} ${idx + 1}`,
                'w-full h-full object-cover hover:scale-105 transition-transform duration-300'
              )}
            </div>
          ))}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenViewer(item, 0, 'grid');
          }}
          className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full bg-black/80 hover:bg-black/90 border border-white/20 text-white text-[11px] font-medium flex items-center gap-1.5 shadow-lg transition"
        >
          <Images className="w-3.5 h-3.5 text-amber-400" />
          <span>4 Items</span>
        </button>
      </div>
    );
  }

  // 5+ items: 2x2 grid with +N overlay on the 4th item
  const extraCount = count - 4;
  return (
    <div className="relative w-full aspect-16/10 rounded-xl overflow-hidden mb-3 border border-[var(--border-color)] bg-neutral-950 group/media shadow-md">
      <div className="grid grid-cols-2 gap-1.5 w-full h-full">
        {files.slice(0, 4).map((f, idx) => {
          const isFourth = idx === 3;
          return (
            <div
              key={f.id || idx}
              onClick={(e) => {
                e.stopPropagation();
                if (isFourth) {
                  onOpenViewer(item, 0, 'grid');
                } else {
                  onOpenViewer(item, idx, 'expanded');
                }
              }}
              className="relative w-full h-full overflow-hidden cursor-pointer bg-neutral-900 group/cell"
            >
              {renderMediaTile(
                f,
                `${item.caption || 'Memory'} ${idx + 1}`,
                `w-full h-full object-cover transition-transform duration-300 ${
                  isFourth ? 'brightness-75' : 'hover:scale-105'
                }`
              )}

              {isFourth && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white hover:bg-black/60 transition">
                  <span className="font-display font-bold text-xl sm:text-2xl text-amber-300">
                    +{extraCount + 1}
                  </span>
                  <span className="text-[10px] sm:text-xs text-neutral-200 flex items-center gap-1 font-medium mt-0.5">
                    <Grid className="w-3.5 h-3.5 text-amber-400" />
                    <span>View Photos</span>
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onOpenViewer(item, 0, 'grid');
        }}
        className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full bg-black/80 hover:bg-black/90 border border-white/20 text-white text-[11px] font-medium flex items-center gap-1.5 shadow-lg transition"
      >
        <Images className="w-3.5 h-3.5 text-amber-400" />
        <span>{count} Photos</span>
      </button>
    </div>
  );
});
/* ---------------------------------------------------------------------------
   Month rail marker — the anchor for each timeline block
   --------------------------------------------------------------------------- */
