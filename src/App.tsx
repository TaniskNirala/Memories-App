import React, { useState, useEffect, useMemo } from 'react';
import { AuthProvider, useAuth, apiFetch } from './context/AuthContext.tsx';
import { ThemeProvider, useTheme } from './context/ThemeContext.tsx';
import { Header } from './components/Header.tsx';
import { BottomNav } from './components/BottomNav.tsx';
import { SideNav } from './components/SideNav.tsx';
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
import { EventsPage } from './components/EventsPage.tsx';
import { CirclesPage } from './components/CirclesPage.tsx';
import { CommandPalette, PaletteAction } from './components/CommandPalette.tsx';
import { AdminPanel } from './components/AdminPanel.tsx';
import { OfflineIndicator } from './components/OfflineIndicator.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { DuplicateCleanerModal } from './components/DuplicateCleanerModal.tsx';
import { FeedItem, Group, NotificationItem } from './types/index.ts';
import { RefreshCw, Upload, AlertTriangle } from 'lucide-react';
import { Avatar, Modal, PageHero } from './components/ui/kit.tsx';
import { FeedbackProvider } from './components/ui/Feedback.tsx';
import { accentFromName, greeting } from './lib/format.ts';

/* ---------------------------------------------------------------------------
   Hero band: the "where am I" moment at the top of the timeline
   --------------------------------------------------------------------------- */

const HeroBand: React.FC<{
  user: any;
  groupsCount: number;
  memories: number;
  contributors: number;
  selectedGroupName?: string;
  selectedGroupDescription?: string;
  selectedGroupMembers?: number;
  onOpenUpload: () => void;
  onOpenGroupsManager: () => void;
}> = ({
  user,
  groupsCount,
  memories,
  contributors,
  selectedGroupName,
  selectedGroupDescription,
  selectedGroupMembers,
  onOpenUpload,
  onOpenGroupsManager,
}) => (
  <PageHero
    eyebrow={`${greeting()} · ${new Date().toLocaleDateString([], { weekday: 'long' })}`}
    title={
      selectedGroupName ? (
        <>
          Inside <span className="glow-text">{selectedGroupName}</span>
        </>
      ) : (
        <>
          Hello, <span className="glow-text">{user?.displayName?.split(' ')[0] || 'friend'}</span>
        </>
      )
    }
    subtitle={
      selectedGroupName
        ? selectedGroupDescription ||
          `${selectedGroupMembers || 0} people in this circle — everything below is only visible to them.`
        : 'Your memories, stacked by the day they happened. Pick a circle on the left to narrow the view.'
    }
    rail
    aside={
      <div className="flex items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-page)]/45 px-2.5 py-1.5">
        <Avatar name={user?.displayName || user?.username} color={user?.avatarColor} size={30} ring />
        <div className="leading-tight">
          <p className="text-[10.5px] font-bold">@{user?.username}</p>
          <p className="text-[8.5px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            {user?.role}
          </p>
        </div>
      </div>
    }
    actions={
      <>
        <div className="flex items-center gap-2.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-page)]/45 px-2.5 py-1.5">
          {[
            { label: 'memories', value: memories },
            { label: 'circles', value: groupsCount },
            { label: 'people', value: contributors },
          ].map((s, i) => (
            <div key={s.label} className={i > 0 ? 'border-l border-[var(--border-subtle)] pl-2.5' : ''}>
              <p className="font-display text-[14px] leading-none tabular-nums">{s.value}</p>
              <p className="mt-0.5 text-[7.5px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                {s.label}
              </p>
            </div>
          ))}
        </div>
        <button type="button" onClick={onOpenUpload} className="btn btn-primary !px-3.5 !py-2">
          Add memory
        </button>
        <button type="button" onClick={onOpenGroupsManager} className="btn btn-soft hidden !px-3.5 !py-2 sm:inline-flex">
          Circles
        </button>
      </>
    }
  />
);


const MainContent: React.FC = () => {
  const { user, loading, isPending, isAdmin } = useAuth();
  const { toggleTheme } = useTheme();

  // Navigation tab
  const [currentTab, setCurrentTab] = useState<'feed' | 'collections' | 'groups' | 'admin' | 'trash'>('feed');

  // Circle deletion modal state
  const [circleToDelete, setCircleToDelete] = useState<Group | null>(null);
  const [deleteCircleLoading, setDeleteCircleLoading] = useState(false);

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
  const [paletteOpen, setPaletteOpen] = useState(false);

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

  const handleDeleteCircle = async () => {
    if (!circleToDelete) return;
    setDeleteCircleLoading(true);
    try {
      const res = await apiFetch(`/api/groups/${circleToDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedGroupId === circleToDelete.id) {
          setSelectedGroupId(undefined);
        }
        setCircleToDelete(null);
        fetchGroups();
        fetchFeed(true);
      }
    } catch (e) {
      console.error('Failed to delete circle', e);
    } finally {
      setDeleteCircleLoading(false);
    }
  };

  // ⌘K / Ctrl-K opens the command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  if (loading) {
    return (
      <div className="app-shell items-center justify-center gap-3">
        <span className="relative flex h-12 w-12 items-center justify-center">
          <span className="absolute inset-0 rounded-2xl opacity-80" style={{ background: 'var(--gradient-ember)' }} />
          <img src="/icon.svg" alt="" className="relative z-10 h-6 w-6" />
        </span>
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" /> opening nest
        </span>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  if (isPending) {
    return (
      <div className="app-shell">
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
    <div className="app-shell bg-[var(--bg-page)] text-[var(--text-primary)] pb-24 transition-colors lg:pb-8">
      <Header
        selectedGroupName={selectedGroup?.name}
        onSelectGroup={(gid) => setSelectedGroupId(gid)}
        onNotificationClick={handleNotificationClick}
        onOpenDuplicates={() => setIsDuplicatesModalOpen(true)}
        onOpenPalette={() => setPaletteOpen(true)}
        onUserSwitched={() => {
          setSelectedGroupId(undefined);
          fetchGroups();
          fetchFeed(true);
        }}
      />

      <div className="page-wrap flex flex-1 items-start gap-6 pt-4">
        <SideNav
          currentTab={currentTab}
          onSelectTab={(tab) => {
            if (tab === 'admin' && !isAdmin) {
              setCurrentTab('feed');
              return;
            }
            setCurrentTab(tab);
          }}
          onOpenUpload={() => setIsUploadOpen(true)}
          groups={groups}
          selectedGroupId={selectedGroupId}
          onSelectGroup={(gid) => {
            setSelectedGroupId(gid);
            setCurrentTab('feed');
          }}
          onOpenCreateGroup={() => {
            setIsCreateGroupMode(true);
            setIsGroupsModalOpen(true);
          }}
          onOpenGroupsManager={() => {
            setIsCreateGroupMode(false);
            setIsGroupsModalOpen(true);
          }}
          feedCount={feedItems.length}
          eventCount={feedItems.filter((i) => i.type === 'collection_card').length}
        />

        <main className="min-w-0 flex-1">
          {/* Feed pages ride a centred column beside the nav; other tabs stay full width */}
          <div className={currentTab === 'feed' ? 'mx-auto w-full max-w-[820px]' : ''}>
          {currentTab === 'feed' && (
            <div className="mb-4">
              <HeroBand
                user={user}
                groupsCount={groups.length}
                memories={feedItems.length}
                contributors={
                  new Set(feedItems.map((i) => (i.type === 'single_post' ? i.owner.id : i.creator.id))).size
                }
                selectedGroupName={selectedGroup?.name}
                selectedGroupDescription={selectedGroup?.description}
                selectedGroupMembers={selectedGroup?.members?.length || selectedGroup?.memberCount}
                onOpenUpload={() => setIsUploadOpen(true)}
                onOpenGroupsManager={() => {
                  setIsCreateGroupMode(false);
                  setIsGroupsModalOpen(true);
                }}
              />
            </div>
          )}

          {/* TAB: STREAM / TIMELINE */}
          {currentTab === 'feed' && (
            <div className="space-y-4">
              <PendingReferencesBanner onUpdated={() => fetchFeed(true)} />

              <FeedSearchBar
                filters={feedFilters}
                onFilterChange={setFeedFilters}
                onResetFilters={() => setFeedFilters(initialFeedFilters)}
                items={feedItems}
                filteredCount={filteredFeedItems.length}
                totalCount={feedItems.length}
              />

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

              {hasMoreFeed && (
                <div className="relative pt-2 text-center">
                  <span aria-hidden className="absolute inset-x-10 top-0 h-px bg-[var(--border-subtle)]" />
                  <button onClick={() => fetchFeed(false)} disabled={feedLoading} className="btn btn-soft relative">
                    {feedLoading ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading earlier memories…
                      </>
                    ) : (
                      'Load earlier memories'
                    )}
                  </button>
                  <p className="mt-2 text-[10px] text-[var(--text-muted)]">Scroll further back into the archive</p>
                  {feedItems.length <= 3 && (
                    <p className="mx-auto mt-1 max-w-xs text-[9.5px] leading-relaxed text-[var(--text-muted)]/70">
                      Tip: drop photos anywhere on the window to add them instantly · press ⌘K for the palette
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          </div>

          {/* TAB: EVENTS */}
          {currentTab === 'collections' && (
            <EventsPage
              items={feedItems}
              groups={groups}
              onOpenCollection={(id) => setActiveCollectionId(id)}
              onOpenComments={(item) => setCommentsItem(item)}
              onPropose={() => setIsProposeModalOpen(true)}
              onOpenUpload={() => setIsUploadOpen(true)}
            />
          )}

          {/* TAB: CIRCLES */}
          {currentTab === 'groups' && (
            <CirclesPage
              groups={groups}
              selectedGroupId={selectedGroupId}
              onSelectGroup={(gid) => {
                setSelectedGroupId(gid);
                setCurrentTab('feed');
              }}
              onManage={() => {
                setIsCreateGroupMode(false);
                setIsGroupsModalOpen(true);
              }}
              onCreate={() => {
                setIsCreateGroupMode(true);
                setIsGroupsModalOpen(true);
              }}
              onRequestDelete={(g) => setCircleToDelete(g)}
            />
          )}

          {/* TAB: ADMIN STUDIO */}
          {currentTab === 'admin' && isAdmin && <AdminPanel />}

          {/* TAB: TRASH BIN */}
          {currentTab === 'trash' && <TrashView />}
        </main>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        groups={groups}
        isAdmin={isAdmin}
        onSearch={(q) => {
          setFeedFilters({ ...initialFeedFilters, searchQuery: q });
          setCurrentTab('feed');
        }}
        run={(action: PaletteAction) => {
          switch (action.kind) {
            case 'tab':
              if (action.tab === 'admin' && !isAdmin) return;
              setCurrentTab(action.tab);
              break;
            case 'group':
              setSelectedGroupId(action.groupId);
              setCurrentTab('feed');
              break;
            case 'upload':
              setIsUploadOpen(true);
              break;
            case 'duplicates':
              setIsDuplicatesModalOpen(true);
              break;
            case 'newEvent':
              setIsProposeModalOpen(true);
              break;
            case 'theme':
              toggleTheme();
              break;
          }
        }}
      />

      <BottomNav
        currentTab={currentTab}
        onSelectTab={(tab) => {
          if (tab === 'admin' && !isAdmin) {
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

      {viewerItem && (
        <MediaViewerModal
          item={viewerItem}
          initialIndex={viewerIndex}
          initialMode={viewerMode}
          isOpen={true}
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
      )}

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
        groups={groups}
        onDeleteAlbum={handleDeleteAlbum}
        onSelectPhoto={(postId, fileIndex = 0) => {
          const found = feedItems.find((i) => i.id === postId);
          if (found) {
            handleOpenViewer(found, fileIndex, 'expanded');
          } else {
            apiFetch(`/api/posts/${postId}`)
              .then((r) => r.json())
              .then((data) => {
                if (data.post) {
                  handleOpenViewer({ type: 'single_post', ...data.post }, fileIndex, 'expanded');
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

      {/* Circle Deletion Modal */}
      {circleToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-100"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleteCircleLoading) setCircleToDelete(null);
          }}
        >
          <div className="w-full max-w-sm p-5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-3xl shadow-2xl space-y-4 playful-card">
            <div className="flex items-center gap-2 text-rose-500 font-bold text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>Delete Circle</span>
            </div>

            <div className="space-y-2 text-xs text-[var(--text-secondary)] leading-relaxed">
              <p>
                Are you sure you want to permanently delete circle <strong>"{circleToDelete.name}"</strong>?
              </p>
              <p className="text-[11px] text-[var(--text-muted)] bg-[var(--bg-surface)] p-2.5 rounded-xl border border-[var(--border-subtle)]">
                Shared photos and memories will remain safely with their respective owners. Only this circle and its membership channel will be removed.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={deleteCircleLoading}
                onClick={() => setCircleToDelete(null)}
                className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteCircleLoading}
                onClick={handleDeleteCircle}
                className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition flex items-center gap-1.5 shadow-md disabled:opacity-50"
              >
                {deleteCircleLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{deleteCircleLoading ? 'Deleting...' : 'Yes, Delete Circle'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <OfflineIndicator />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <FeedbackProvider>
          <AuthProvider>
            <MainContent />
          </AuthProvider>
        </FeedbackProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
