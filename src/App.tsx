import React, { useState, useEffect, useMemo } from 'react';
import { AuthProvider, useAuth, apiFetch } from './context/AuthContext.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { Header } from './components/Header.tsx';
import { BottomNav } from './components/BottomNav.tsx';
import { CircleRail } from './components/CircleRail.tsx';
import { TimelineFeed } from './components/TimelineFeed.tsx';
import { FeedSearchBar, FeedFilterState } from './components/FeedSearchBar.tsx';
import { AuthScreen } from './components/AuthScreen.tsx';
import { PendingApprovalScreen } from './components/PendingApprovalScreen.tsx';
import { UploadModal } from './components/UploadModal.tsx';
import { MediaViewerModal } from './components/MediaViewerModal.tsx';
import { CommentsDrawer } from './components/CommentsDrawer.tsx';
import { CollectionDetailModal } from './components/CollectionDetailModal.tsx';
import { GroupManagementModal } from './components/GroupManagementModal.tsx';
import { SharePlacementModal } from './components/SharePlacementModal.tsx';
import { ProposeCollectionModal } from './components/ProposeCollectionModal.tsx';
import { PendingReferencesBanner } from './components/PendingReferencesBanner.tsx';
import { TrashView } from './components/TrashView.tsx';
import { AdminPanel } from './components/AdminPanel.tsx';
import { OfflineIndicator } from './components/OfflineIndicator.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { DuplicateCleanerModal } from './components/DuplicateCleanerModal.tsx';
import { FeedItem, Group, NotificationItem } from './types/index.ts';
import { RefreshCw, Upload } from 'lucide-react';

const MainContent: React.FC = () => {
  const { user, loading, isPending, isAdmin } = useAuth();

  // Navigation tab
  const [currentTab, setCurrentTab] = useState<'feed' | 'collections' | 'groups' | 'admin' | 'trash'>('feed');

  // Guard against non-admin users ever accessing or lingering on admin tab
  useEffect(() => {
    if (!isAdmin && currentTab === 'admin') {
      setCurrentTab('feed');
    }
  }, [user?.id, isAdmin, currentTab]);

  // Feed state
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [hasMoreFeed, setHasMoreFeed] = useState(false);

  // Group filter selected on Left Circle Rail
  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>(undefined);
  const [groups, setGroups] = useState<Group[]>([]);

  // Modals state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [dragUploadFiles, setDragUploadFiles] = useState<File[]>([]);
  const [isWindowDragging, setIsWindowDragging] = useState(false);
  const [isGroupsModalOpen, setIsGroupsModalOpen] = useState(false);
  const [isCreateGroupMode, setIsCreateGroupMode] = useState(false);
  const [isProposeModalOpen, setIsProposeModalOpen] = useState(false);
  const [viewerItem, setViewerItem] = useState<FeedItem | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerMode, setViewerMode] = useState<'grid' | 'expanded'>('expanded');
  const [commentsItem, setCommentsItem] = useState<FeedItem | null>(null);
  const [commentsGroupId, setCommentsGroupId] = useState<string | undefined>(undefined);
  const [highlightCommentId, setHighlightCommentId] = useState<string | undefined>(undefined);
  const [shareItem, setShareItem] = useState<FeedItem | null>(null);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [isDuplicatesModalOpen, setIsDuplicatesModalOpen] = useState(false);

  // Search & filter state
  const initialFeedFilters: FeedFilterState = {
    searchQuery: '',
    contributorId: 'all',
    tag: 'all',
    startDate: '',
    endDate: '',
  };
  const [feedFilters, setFeedFilters] = useState<FeedFilterState>(initialFeedFilters);

  // Filtered feed items based on search query, contributor, tag, and date range
  const filteredFeedItems = useMemo(() => {
    return feedItems.filter((item) => {
      // 1. Text Search Query
      if (feedFilters.searchQuery.trim()) {
        const q = feedFilters.searchQuery.trim().toLowerCase();
        const caption = (item.type === 'single_post' ? item.caption : `${item.title} ${item.description || ''}`).toLowerCase();
        const author = item.type === 'single_post' ? item.owner : item.creator;
        const authorName = (author?.displayName || '').toLowerCase();
        const authorUsername = (author?.username || '').toLowerCase();
        const groupPlacements = (item.placements || []).map((p) => p.groupName.toLowerCase()).join(' ');

        const matchesQuery =
          caption.includes(q) ||
          authorName.includes(q) ||
          authorUsername.includes(q) ||
          groupPlacements.includes(q);

        if (!matchesQuery) return false;
      }

      // 2. Contributor Filter
      if (feedFilters.contributorId && feedFilters.contributorId !== 'all') {
        const author = item.type === 'single_post' ? item.owner : item.creator;
        if (!author || author.id !== feedFilters.contributorId) {
          return false;
        }
      }

      // 3. Tag Filter
      if (feedFilters.tag && feedFilters.tag !== 'all') {
        const targetTag = feedFilters.tag.toLowerCase();
        const cleanTag = targetTag.replace(/^#/, '');
        const text = (item.type === 'single_post' ? item.caption : `${item.title} ${item.description || ''}`).toLowerCase();
        const groupPlacements = (item.placements || []).map((p) => p.groupName.toLowerCase());

        const matchesHashtag = text.includes(`#${cleanTag}`) || text.includes(cleanTag);
        const matchesGroup = groupPlacements.some((g) => g.includes(cleanTag));

        if (!matchesHashtag && !matchesGroup) {
          return false;
        }
      }

      // 4. Date Range Filter
      const rawDate = item.type === 'single_post' ? (item.takenAt || item.sortDate) : (item.eventDate || item.sortDate);
      if (rawDate && (feedFilters.startDate || feedFilters.endDate)) {
        const itemDate = new Date(rawDate);
        if (!isNaN(itemDate.getTime())) {
          if (feedFilters.startDate) {
            const start = new Date(feedFilters.startDate);
            start.setHours(0, 0, 0, 0);
            if (itemDate < start) return false;
          }
          if (feedFilters.endDate) {
            const end = new Date(feedFilters.endDate);
            end.setHours(23, 59, 59, 999);
            if (itemDate > end) return false;
          }
        }
      }

      return true;
    });
  }, [feedItems, feedFilters]);

  const isFiltersActive = Boolean(
    feedFilters.searchQuery.trim() ||
    (feedFilters.contributorId && feedFilters.contributorId !== 'all') ||
    (feedFilters.tag && feedFilters.tag !== 'all') ||
    feedFilters.startDate ||
    feedFilters.endDate
  );

  const handleOpenViewer = (item: FeedItem, initialIndex: number = 0, initialMode?: 'grid' | 'expanded') => {
    setViewerItem(item);
    setViewerIndex(initialIndex);
    if (initialMode) {
      setViewerMode(initialMode);
    } else if (item.type === 'single_post' && item.files.length > 1) {
      setViewerMode('grid');
    } else {
      setViewerMode('expanded');
    }
  };

  // Fetch circles/groups
  const fetchGroups = async () => {
    if (!user || isPending) return;
    try {
      const res = await apiFetch('/api/groups');
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups || []);
      }
    } catch (e) {
      console.error('Failed to fetch groups', e);
    }
  };

  // Fetch feed
  const fetchFeed = async (reset: boolean = false) => {
    if (!user || isPending) return;
    setFeedLoading(true);

    try {
      const params = new URLSearchParams();
      if (selectedGroupId) params.append('groupId', selectedGroupId);
      if (!reset && feedCursor) params.append('cursor', feedCursor);
      params.append('limit', '25');

      const res = await apiFetch(`/api/feed?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (reset) {
          setFeedItems(data.items || []);
        } else {
          setFeedItems((prev) => [...prev, ...(data.items || [])]);
        }
        setFeedCursor(data.nextCursor);
        setHasMoreFeed(Boolean(data.nextCursor));
      }
    } catch (e) {
      console.error('Failed to fetch feed', e);
    } finally {
      setFeedLoading(false);
    }
  };

  useEffect(() => {
    if (user && !isPending) {
      fetchGroups();
      fetchFeed(true);
    }
  }, [user, isPending, selectedGroupId]);

  // Global drag-and-drop support: dragging files into window initiates upload
  useEffect(() => {
    let counter = 0;

    const handleWindowDragEnter = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.types?.includes('Files')) {
        counter++;
        setIsWindowDragging(true);
      }
    };

    const handleWindowDragLeave = (e: DragEvent) => {
      e.preventDefault();
      counter--;
      if (counter <= 0) {
        counter = 0;
        setIsWindowDragging(false);
      }
    };

    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault();
      counter = 0;
      setIsWindowDragging(false);

      if (!user || isPending) return;

      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const filesArray = Array.from(e.dataTransfer.files).filter(
          (f) => f.type.startsWith('image/') || f.type.startsWith('video/') || f.type.startsWith('audio/')
        );
        if (filesArray.length > 0) {
          setDragUploadFiles(filesArray);
          setIsUploadOpen(true);
        }
      }
    };

    window.addEventListener('dragenter', handleWindowDragEnter);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);

    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter);
      window.removeEventListener('dragleave', handleWindowDragLeave);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, [user, isPending]);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-page)] text-amber-500">
        <RefreshCw className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  if (isPending) {
    return (
      <div className="min-h-screen bg-[var(--bg-page)] flex flex-col">
        <Header />
        <PendingApprovalScreen />
        <OfflineIndicator />
      </div>
    );
  }

  // Handle direct sharing from timeline card dropdown
  const handleDirectShare = async (itemId: string, itemType: 'post' | 'album', targetGroupId: string) => {
    try {
      const res = await apiFetch('/api/placements/bunch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemIds: [itemId],
          itemType,
          groupIds: [targetGroupId],
        }),
      });
      if (res.ok) {
        await fetchFeed(true);
      }
    } catch (e) {
      console.error('Share to group failed', e);
    }
  };

  const handleDeletePost = async (postId: string, permanent: boolean = false) => {
    try {
      await apiFetch(`/api/posts/${postId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permanent }),
      });
      fetchFeed(true);
    } catch (e) {}
  };

  const handleDeleteSinglePhoto = async (postId: string, fileId: string) => {
    try {
      const res = await apiFetch(`/api/posts/${postId}/files/${fileId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.postDeleted) {
          setFeedItems((prev) => prev.filter((item) => item.id !== postId));
          setViewerItem(null);
        } else {
          // Update feed item's files in-place
          setFeedItems((prev) =>
            prev.map((item) => {
              if (item.id === postId && item.type === 'single_post') {
                return {
                  ...item,
                  files: item.files.filter((f) => f.id !== fileId),
                };
              }
              return item;
            })
          );
          // If the viewer is currently open on this post, update viewerItem
          setViewerItem((prev) => {
            if (!prev || prev.id !== postId || prev.type !== 'single_post') return prev;
            const updatedFiles = prev.files.filter((f) => f.id !== fileId);
            return {
              ...prev,
              files: updatedFiles,
            };
          });
        }
        // Background refresh feed to ensure server state is completely in sync
        fetchFeed(false);
      }
    } catch (e) {
      console.error('Failed to delete single photo', e);
    }
  };

  const handlePhotoUpdated = (postId: string, updatedFile: any) => {
    setFeedItems((prev) =>
      prev.map((item) => {
        if (item.id === postId && item.type === 'single_post') {
          return {
            ...item,
            files: item.files.map((f) => (f.id === updatedFile.id ? updatedFile : f)),
          };
        }
        return item;
      })
    );
    setViewerItem((prev) => {
      if (!prev || prev.id !== postId || prev.type !== 'single_post') return prev;
      return {
        ...prev,
        files: prev.files.map((f) => (f.id === updatedFile.id ? updatedFile : f)),
      };
    });
    fetchFeed(false);
  };

  const handleDeleteAlbum = async (albumId: string, permanent: boolean = false) => {
    try {
      await apiFetch(`/api/albums/${albumId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permanent }),
      });
      fetchFeed(true);
    } catch (e) {}
  };

  const handleAdminOverride = async (postId: string, override: string | null) => {
    try {
      await apiFetch(`/api/posts/${postId}/override-visibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ override }),
      });
      fetchFeed(true);
    } catch (e) {}
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    const link = notif.link || '';
    if (!link) return;

    const [pathPart, queryPart] = link.split('?');
    const params = new URLSearchParams(queryPart || '');
    const groupId = params.get('group') || undefined;
    const commentId = params.get('comment') || undefined;

    // 1. Post target: /post/:id
    const postMatch = pathPart.match(/^\/post\/([a-zA-Z0-9_-]+)/);
    if (postMatch) {
      const postId = postMatch[1];
      setCurrentTab('feed');
      if (groupId) {
        setSelectedGroupId(groupId);
      }

      let targetPost = feedItems.find((f) => f.id === postId);
      if (!targetPost) {
        try {
          const res = await apiFetch(`/api/posts/${postId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.post) {
              targetPost = {
                type: 'single_post',
                ...data.post,
              };
            }
          }
        } catch (e) {
          console.error('Failed to load notification post', e);
        }
      }

      if (targetPost) {
        setCommentsGroupId(groupId);
        setHighlightCommentId(commentId);
        setCommentsItem(targetPost);
      }
      return;
    }

    // 2. Album target: /album/:id or /collection/:id
    const albumMatch = pathPart.match(/^\/(?:album|collection)\/([a-zA-Z0-9_-]+)/);
    if (albumMatch) {
      const albumId = albumMatch[1];
      if (commentId) {
        let targetAlbum = feedItems.find((f) => f.id === albumId && f.type === 'collection_card');
        if (!targetAlbum) {
          try {
            const res = await apiFetch(`/api/albums/${albumId}`);
            if (res.ok) {
              const data = await res.json();
              if (data.album) {
                targetAlbum = {
                  type: 'collection_card',
                  ...data.album,
                };
              }
            }
          } catch (e) {}
        }
        if (targetAlbum) {
          setCommentsGroupId(groupId);
          setHighlightCommentId(commentId);
          setCommentsItem(targetAlbum);
          return;
        }
      }
      setActiveCollectionId(albumId);
      return;
    }

    // 3. Admin: /admin
    if (pathPart === '/admin') {
      if (isAdmin) setCurrentTab('admin');
      return;
    }

    // 4. Groups / circles: /groups or /circles
    if (pathPart === '/groups' || pathPart === '/circles') {
      setIsGroupsModalOpen(true);
      return;
    }

    // 5. Trash: /trash
    if (pathPart === '/trash') {
      setCurrentTab('trash');
      return;
    }

    // Default fallback:
    setCurrentTab('feed');
  };

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] flex flex-col transition-colors pb-16">
      {/* Top Header */}
      <Header
        selectedGroupName={selectedGroup?.name}
        onSelectGroup={(gid) => setSelectedGroupId(gid)}
        onNotificationClick={handleNotificationClick}
        onOpenDuplicates={() => setIsDuplicatesModalOpen(true)}
        onUserSwitched={() => {
          setSelectedGroupId(undefined);
          fetchGroups();
          fetchFeed(true);
        }}
      />

      <div className="flex-1 flex max-w-5xl w-full mx-auto items-start relative">
        {/* Left Circle Rail (All, E, AR, RK, +) matching user screenshot */}
        <CircleRail
          groups={groups}
          selectedGroupId={selectedGroupId}
          onSelectGroup={(gid) => setSelectedGroupId(gid)}
          onOpenCreateGroup={() => {
            setIsCreateGroupMode(true);
            setIsGroupsModalOpen(true);
          }}
        />

        {/* Center Main Stream & Timeline */}
        <main className="flex-1 p-4 sm:p-6 min-w-0">
          {/* TAB: STREAM / TIMELINE */}
          {currentTab === 'feed' && (
            <div className="space-y-4 max-w-2xl">
              {/* Owner Pending Reference Requests Approval Banner */}
              <PendingReferencesBanner onUpdated={() => fetchFeed(true)} />

              {/* Feed Search & Filter Bar */}
              <FeedSearchBar
                filters={feedFilters}
                onFilterChange={setFeedFilters}
                onResetFilters={() => setFeedFilters(initialFeedFilters)}
                items={feedItems}
                filteredCount={filteredFeedItems.length}
                totalCount={feedItems.length}
              />

              {/* Continuous Vertical Timeline Feed */}
              <TimelineFeed
                items={filteredFeedItems}
                groups={groups}
                selectedGroupId={selectedGroupId}
                onOpenViewer={handleOpenViewer}
                onOpenComments={(item) => setCommentsItem(item)}
                onOpenCollection={(colId) => setActiveCollectionId(colId)}
                onShareToGroup={handleDirectShare}
                onOpenUpload={() => setIsUploadOpen(true)}
                onDeletePost={handleDeletePost}
                onDeleteAlbum={handleDeleteAlbum}
                onMemoryUpdated={() => fetchFeed(true)}
                isFiltered={isFiltersActive}
                onResetFilters={() => setFeedFilters(initialFeedFilters)}
              />

              {/* Load More Button */}
              {hasMoreFeed && (
                <div className="text-center pt-4">
                  <button
                    onClick={() => fetchFeed(false)}
                    disabled={feedLoading}
                    className="px-5 py-2.5 rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] text-xs font-semibold text-[var(--text-primary)] transition"
                  >
                    {feedLoading ? 'Loading earlier memories...' : 'Load Earlier Memories'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB: EVENTS */}
          {currentTab === 'collections' && (
            <div className="space-y-4 max-w-2xl">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border-color)]">
                <div>
                  <h2 className="font-display font-bold text-lg text-[var(--text-primary)]">Events</h2>
                  <span className="text-xs text-[var(--text-muted)]">Trips, gatherings, and celebrations</span>
                </div>
                <button
                  onClick={() => setIsProposeModalOpen(true)}
                  className="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-amber-500 to-rose-500 text-white text-xs font-semibold hover:opacity-95 shadow-sm transition"
                >
                  + New Event
                </button>
              </div>

              <TimelineFeed
                items={feedItems.filter((i) => i.type === 'collection_card')}
                groups={groups}
                selectedGroupId={selectedGroupId}
                onOpenViewer={() => {}}
                onOpenComments={(item) => setCommentsItem(item)}
                onOpenCollection={(colId) => setActiveCollectionId(colId)}
                onShareToGroup={handleDirectShare}
                onOpenUpload={() => setIsUploadOpen(true)}
                onDeletePost={handleDeletePost}
                onDeleteAlbum={handleDeleteAlbum}
                onMemoryUpdated={() => fetchFeed(true)}
              />
            </div>
          )}

          {/* TAB: CIRCLES */}
          {currentTab === 'groups' && (
            <div className="space-y-4 max-w-2xl">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border-color)]">
                <div>
                  <h2 className="font-display font-bold text-lg text-[var(--text-primary)]">Friend Circles</h2>
                  <span className="text-xs text-[var(--text-muted)]">Private sharing groups</span>
                </div>
                <button
                  onClick={() => setIsGroupsModalOpen(true)}
                  className="px-3 py-1.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition"
                >
                  Manage Circles
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {groups.map((g) => (
                  <div
                    key={g.id}
                    onClick={() => {
                      setSelectedGroupId(g.id);
                      setCurrentTab('feed');
                    }}
                    className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] cursor-pointer hover:border-amber-500 transition"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-display font-bold text-sm text-[var(--text-primary)]">{g.name}</h3>
                      {g.isEveryone && (
                        <span className="text-[9px] bg-emerald-500/20 text-emerald-400 font-mono px-1 rounded">ALL</span>
                      )}
                    </div>
                    {g.description && (
                      <p className="text-xs text-[var(--text-muted)] line-clamp-1 mb-2">{g.description}</p>
                    )}
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {g.members?.length || g.memberCount} approved members
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: ADMIN PORTAL - strictly restricted to admin role */}
          {currentTab === 'admin' && isAdmin && <AdminPanel />}

          {/* TAB: TRASH BIN */}
          {currentTab === 'trash' && <TrashView />}
        </main>
      </div>

      {/* Bottom Navigation */}
      <BottomNav
        currentTab={currentTab}
        onSelectTab={(tab) => {
          if (tab === 'groups') {
            setIsGroupsModalOpen(true);
          } else if (tab === 'admin' && !isAdmin) {
            setCurrentTab('feed');
          } else {
            setCurrentTab(tab);
          }
        }}
        onOpenUpload={() => setIsUploadOpen(true)}
      />

      {/* Modals */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => {
          setIsUploadOpen(false);
          setDragUploadFiles([]);
        }}
        groups={groups}
        selectedGroupId={selectedGroupId}
        initialFiles={dragUploadFiles}
        onUploadSuccess={() => fetchFeed(true)}
      />

      {/* App-Wide Drag-and-Drop Overlay */}
      {isWindowDragging && !isUploadOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 border-4 border-dashed border-amber-400 pointer-events-none animate-in fade-in duration-150">
          <div className="w-20 h-20 rounded-3xl bg-amber-500/20 border-2 border-amber-400/60 flex items-center justify-center text-amber-400 mb-4 animate-bounce shadow-2xl shadow-amber-500/30">
            <Upload className="w-10 h-10" />
          </div>
          <h2 className="font-display font-bold text-2xl text-white mb-2 tracking-tight">
            Drop photos anywhere to share
          </h2>
          <p className="text-xs text-neutral-300 max-w-sm text-center">
            Release your files to start creating a new memory in Ultra-HD 4K quality
          </p>
        </div>
      )}

      <MediaViewerModal
        item={viewerItem}
        initialIndex={viewerIndex}
        initialMode={viewerMode}
        isOpen={Boolean(viewerItem)}
        onClose={() => setViewerItem(null)}
        onOpenComments={(item) => setCommentsItem(item)}
        onOpenShareModal={(item) => setShareItem(item)}
        onDeletePost={handleDeletePost}
        onDeleteFile={handleDeleteSinglePhoto}
        onPhotoUpdated={handlePhotoUpdated}
        onOverrideVisibility={handleAdminOverride}
        groups={groups}
        onPermissionsUpdated={() => fetchFeed(true)}
      />

      <CommentsDrawer
        isOpen={Boolean(commentsItem)}
        onClose={() => {
          setCommentsItem(null);
          setCommentsGroupId(undefined);
          setHighlightCommentId(undefined);
        }}
        item={commentsItem}
        groupId={commentsGroupId}
        highlightCommentId={highlightCommentId}
        onReactionToggle={async (targetId, groupId, emoji) => {
          try {
            await apiFetch('/api/reactions/toggle', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ targetType: 'post', targetId, groupId, emoji }),
            });
            fetchFeed(true);
          } catch (e) {}
        }}
      />

      <CollectionDetailModal
        collectionId={activeCollectionId}
        isOpen={Boolean(activeCollectionId)}
        onClose={() => setActiveCollectionId(null)}
        onUpdated={() => fetchFeed(true)}
        onSelectPhoto={(postId) => {
          const found = feedItems.find((i) => i.id === postId);
          if (found) {
            handleOpenViewer(found, 0, 'expanded');
          } else {
            apiFetch(`/api/posts/${postId}`)
              .then((r) => r.json())
              .then((data) => {
                if (data.post) {
                  handleOpenViewer({ type: 'single_post', ...data.post }, 0, 'expanded');
                }
              });
          }
        }}
      />

      <GroupManagementModal
        isOpen={isGroupsModalOpen}
        onClose={() => {
          setIsGroupsModalOpen(false);
          setIsCreateGroupMode(false);
        }}
        groups={groups}
        onRefreshGroups={() => {
          fetchGroups();
          fetchFeed(true);
        }}
        initialCreateMode={isCreateGroupMode}
        onSelectGroupFeed={(gid) => {
          setSelectedGroupId(gid);
          setCurrentTab('feed');
        }}
        onGroupDeleted={(deletedGid) => {
          if (selectedGroupId === deletedGid) {
            setSelectedGroupId(undefined);
          }
          fetchGroups();
          fetchFeed(true);
        }}
      />

      <SharePlacementModal
        item={shareItem}
        isOpen={Boolean(shareItem)}
        onClose={() => setShareItem(null)}
        groups={groups}
        onShareComplete={() => fetchFeed(true)}
      />

      <ProposeCollectionModal
        isOpen={isProposeModalOpen}
        onClose={() => setIsProposeModalOpen(false)}
        groups={groups}
        onCreated={() => fetchFeed(true)}
      />

      <DuplicateCleanerModal
        isOpen={isDuplicatesModalOpen}
        onClose={() => setIsDuplicatesModalOpen(false)}
        onDuplicatesResolved={() => fetchFeed(true)}
      />

      <OfflineIndicator />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <MainContent />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
