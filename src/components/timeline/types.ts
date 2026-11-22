import type { FeedItem } from '../../types/index.ts';

/** Opens the full-screen viewer for a feed item (optionally at a given photo / view mode). */
export type OnOpenViewer = (item: FeedItem, initialIndex?: number, initialMode?: 'grid' | 'expanded') => void;
