import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth, apiFetch } from './context/AuthContext.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { Header } from './components/Header.tsx';
import { BottomNav } from './components/BottomNav.tsx';
import { CircleRail } from './components/CircleRail.tsx';
import { TimelineFeed } from './components/TimelineFeed.tsx';
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
import { FeedItem, Group } from './types/index.ts';
import { RefreshCw } from 'lucide-react';

const MainContent: React.FC = () => {
  const { user, loading, isPending } = useAuth();

  // Navigation tab
  const [currentTab, setCurrentTab] = useState<'feed' | 'collections' | 'groups' | 'admin' | 'trash'>('feed');

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
  const [isGroupsModalOpen, setIsGroupsModalOpen] = useState(false);
  const [isProposeModalOpen, setIsProposeModalOpen] = useState(false);
  const [viewerItem, setViewerItem] = useState<FeedItem | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [commentsItem, setCommentsItem] = useState<FeedItem | null>(null);
  const [shareItem, setShareItem] = useState<FeedItem | null>(null);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);

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

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

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

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] flex flex-col transition-colors pb-16">
      {/* Top Header */}
      <Header
        selectedGroupName={selectedGroup?.name}
        onSelectGroup={(gid) => setSelectedGroupId(gid)}
        onUserSwitched={() => {
          setSelectedGroupId(undefined);
          fetchGroups();
          fetchFeed(true);
        }}
      />

      <div className="flex-1 flex max-w-5xl w-full mx-auto">
        {/* Left Circle Rail (All, E, AR, RK, +) matching user screenshot */}
        <CircleRail
          groups={groups}
          selectedGroupId={selectedGroupId}
          onSelectGroup={(gid) => setSelectedGroupId(gid)}
          onOpenCreateGroup={() => setIsGroupsModalOpen(true)}
        />

        {/* Center Main Stream & Timeline */}
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
          {/* TAB: STREAM / TIMELINE */}
          {currentTab === 'feed' && (
            <div className="space-y-4 max-w-2xl">
              {/* Interactive Demo Hint Banner from screenshot */}
              <div className="p-3.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-xs text-[var(--text-secondary)] leading-relaxed font-sans shadow-md">
                <span className="text-amber-500 font-semibold">Try this:</span> as{' '}
                <strong className="text-[var(--text-primary)]">Riya</strong>, share Kabir's "Cricket nets" to{' '}
                <strong className="text-[var(--accent-cyan)]">Aarav & Riya</strong>. Switch to{' '}
                <strong className="text-[var(--text-primary)]">Aarav</strong> to see a locked placeholder, then to{' '}
                <strong className="text-[var(--text-primary)]">Kabir</strong> to allow it.
              </div>

              {/* Owner Pending Reference Requests Approval Banner */}
              <PendingReferencesBanner onUpdated={() => fetchFeed(true)} />

              {/* Continuous Vertical Timeline Feed */}
              <TimelineFeed
                items={feedItems}
                groups={groups}
                selectedGroupId={selectedGroupId}
                onOpenViewer={(item, initialIndex) => {
                  setViewerItem(item);
                  setViewerIndex(initialIndex || 0);
                }}
                onOpenComments={(item) => setCommentsItem(item)}
                onOpenCollection={(colId) => setActiveCollectionId(colId)}
                onShareToGroup={handleDirectShare}
                onOpenUpload={() => setIsUploadOpen(true)}
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

          {/* TAB: COLLECTIONS & EVENTS */}
          {currentTab === 'collections' && (
            <div className="space-y-4 max-w-2xl">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border-color)]">
                <div>
                  <h2 className="font-display font-bold text-lg text-[var(--text-primary)]">Collections & Events</h2>
                  <span className="text-xs text-[var(--text-muted)]">Trips, albums, and gatherings</span>
                </div>
                <button
                  onClick={() => setIsProposeModalOpen(true)}
                  className="px-3 py-1.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition"
                >
                  + Propose Album
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

          {/* TAB: ADMIN PORTAL */}
          {currentTab === 'admin' && <AdminPanel />}

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
          } else {
            setCurrentTab(tab);
          }
        }}
        onOpenUpload={() => setIsUploadOpen(true)}
      />

      {/* Modals */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        groups={groups}
        onUploadSuccess={() => fetchFeed(true)}
      />

      <MediaViewerModal
        item={viewerItem}
        initialIndex={viewerIndex}
        isOpen={Boolean(viewerItem)}
        onClose={() => setViewerItem(null)}
        onOpenComments={(item) => setCommentsItem(item)}
        onOpenShareModal={(item) => setShareItem(item)}
        onDeletePost={handleDeletePost}
        onOverrideVisibility={handleAdminOverride}
      />

      <CommentsDrawer
        isOpen={Boolean(commentsItem)}
        onClose={() => setCommentsItem(null)}
        item={commentsItem}
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
        onSelectPhoto={(postId) => {
          const found = feedItems.find((i) => i.id === postId);
          if (found) {
            setViewerItem(found);
            setViewerIndex(0);
          } else {
            apiFetch(`/api/posts/${postId}`)
              .then((r) => r.json())
              .then((data) => {
                if (data.post) {
                  setViewerItem({ type: 'single_post', ...data.post });
                  setViewerIndex(0);
                }
              });
          }
        }}
      />

      <GroupManagementModal
        isOpen={isGroupsModalOpen}
        onClose={() => setIsGroupsModalOpen(false)}
        groups={groups}
        onRefreshGroups={fetchGroups}
        onSelectGroupFeed={(gid) => {
          setSelectedGroupId(gid);
          setCurrentTab('feed');
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

      <OfflineIndicator />
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <MainContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
