export interface User {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'member' | 'pending';
  status: 'active' | 'suspended';
  avatarColor: string;
  /** Uploaded profile photo; falls back to the colour avatar when absent */
  avatarUrl?: string;
  /** Appearance saved on the account, so new devices open in the same theme */
  themePreference?: 'dark' | 'light';
}

export interface GroupMember {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  /** Uploaded profile photo, when the member has one */
  avatarUrl?: string;
  role: string;
  joinedAt?: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  creatorId: string;
  isEveryone: boolean;
  createdAt: string;
  memberCount: number;
  isMember: boolean;
  canManage: boolean;
  members: GroupMember[];
}

export interface PostFile {
  id: string;
  fileType: 'photo' | 'video' | 'audio';
  position: number;
  storageKey?: string;
  thumbKey?: string;
  thumbUrl: string;
  viewUrl: string;
  fileSize?: number;
  mimeType?: string;
  width?: number;
  height?: number;
  /** True when the backing Telegram message was deleted from the channel */
  tgDeleted?: boolean;
  tgDeletedAt?: string | null;
}

export interface PostPlacement {
  id: string;
  groupId: string;
  groupName: string;
  isReference: boolean;
  referenceStatus: string;
}

export interface ReactionSummary {
  emoji: string;
  count: number;
  userReacted: boolean;
  users?: string[];
}

export interface SinglePostFeedItem {
  type: 'single_post';
  id: string;
  caption: string;
  takenAt: string;
  uploadedAt: string;
  dateBasis: 'taken_at' | 'uploaded_at';
  sortDate: string;
  isOwner: boolean;
  owner: {
    id: string;
    username: string;
    displayName: string;
    avatarColor: string;
    avatarUrl?: string;
  };
  files: PostFile[];
  placements: PostPlacement[];
  activeGroupId?: string;
  commentsCount: number;
  reactions: ReactionSummary[];
  isLockedPlaceholder?: boolean;
  lockedReason?: string;
}

export interface CollectionCardFeedItem {
  type: 'collection_card';
  id: string;
  title: string;
  description?: string;
  isEvent: boolean;
  eventDate?: string;
  eventPlace?: string;
  sortDate: string;
  itemCount: number;
  mosaicUrls: string[];
  creator: {
    id: string;
    username: string;
    displayName: string;
    avatarColor: string;
    avatarUrl?: string;
  };
  attendeesCount: number;
  userAttended: boolean;
  placements: { id?: string; groupId: string; groupName: string }[];
  commentsCount?: number;
  activeGroupId?: string;
}

export type FeedItem = SinglePostFeedItem | CollectionCardFeedItem;

export interface CommentItem {
  id: string;
  targetType: string;
  targetId: string;
  groupId: string;
  parentId: string | null;
  text: string;
  isDeleted: boolean;
  editedAt: string | null;
  createdAt: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarColor: string;
    avatarUrl?: string;
  };
  canDelete: boolean;
  canEdit: boolean;
}

export interface EventAttendee {
  userId: string;
  username: string;
  displayName: string;
  avatarColor: string;
  avatarUrl?: string;
  taggedBy: { id: string; username: string } | null;
  isSelf: boolean;
}

export interface EventNote {
  id: string;
  eventId: string;
  text: string;
  visibility: string;
  isAnonymous: boolean;
  createdAt: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarColor: string;
    avatarUrl?: string;
  };
  canDelete: boolean;
}

export interface NotificationItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  read: number;
  created_at: string;
}

export interface AuditLogItem {
  id: string;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string;
  details: string;
  created_at: string;
  actor_username: string;
  actor_display_name: string;
}