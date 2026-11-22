/**
 * Row types for the SQLite/Neon schema (see server/db.ts).
 * Generated from the CREATE TABLE statements, so column typos are caught at compile time.
 */

export interface UsersRow {
  id: string;
  username: string;
  password_hash: string;
  display_name: string;
  role: string;
  status: string;
  avatar_color: string | null;
  created_at: string;
  avatar_url: string | null;
  theme_preference: string | null;
}

export interface SessionsRow {
  token: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

export interface PasswordResetsRow {
  token: string;
  user_id: string;
  expires_at: string;
  used_at: string | null;
  created_by: string;
  created_at: string;
}

export interface LoginAttemptsRow {
  id: string;
  ip: string;
  username: string;
  success: number;
  attempted_at: string;
}

export interface GroupsRow {
  id: string;
  name: string;
  description: string | null;
  creator_id: string;
  is_everyone: number;
  created_at: string;
}

export interface GroupMembersRow {
  group_id: string;
  user_id: string;
  joined_at: string;
}

export interface PostsRow {
  id: string;
  owner_id: string;
  caption: string | null;
  taken_at: string;
  uploaded_at: string;
  date_basis: string;
  is_standalone: number;
  deleted_at: string | null;
  visibility_override: string | null;
  created_at: string;
}

export interface PostFilesRow {
  id: string;
  post_id: string;
  storage_key: string;
  file_type: string;
  position: number;
  thumb_key: string;
  file_size: number;
  mime_type: string;
  width: number | null;
  height: number | null;
  checksum: string | null;
  tg_deleted_at: string | null;
}

export interface AlbumsRow {
  id: string;
  title: string;
  description: string | null;
  creator_id: string;
  is_event: number;
  event_date: string | null;
  event_place: string | null;
  status: string;
  proposal_notes: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface AlbumItemsRow {
  album_id: string;
  post_id: string;
  position: number;
  added_at: string;
}

export interface ItemGroupsRow {
  id: string;
  item_type: string;
  item_id: string;
  group_id: string;
  added_by: string;
  is_reference: number;
  reference_status: string;
  added_at: string;
}

export interface EventAttendanceRow {
  event_id: string;
  user_id: string;
  tagged_by: string | null;
  created_at: string;
}

export interface EventNotesRow {
  id: string;
  event_id: string;
  author_id: string;
  text: string;
  visibility: string;
  is_anonymous: number;
  created_at: string;
}

export interface CommentsRow {
  id: string;
  target_type: string;
  target_id: string;
  group_id: string;
  author_id: string;
  text: string;
  parent_id: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface ReactionsRow {
  id: string;
  target_type: string;
  target_id: string;
  group_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface MentionsRow {
  id: string;
  comment_id: string;
  mentioned_user_id: string;
  created_at: string;
}

export interface NotificationsRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: number;
  created_at: string;
}

export interface ReportsRow {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string;
  reason: string;
  status: string;
  created_at: string;
}

export interface AuditLogRow {
  id: string;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string;
  details: string | null;
  created_at: string;
}

export interface IgnoredDuplicatesRow {
  id: string;
  user_id: string;
  match_key: string;
  created_at: string;
}

/**
 * Shape of a row returned by a query that joins tables or selects computed columns.
 * Table columns use the type the schema declares; SQL aliases / computed columns are optional.
 */
export interface Row {
  action: string;
  actor_id: string;
  added_at: string;
  added_by: string;
  album_id: string;
  attempted_at: string;
  author_id: string;
  avatar_color: string | null;
  avatar_url: string | null;
  body: string;
  caption: string | null;
  checksum: string | null;
  comment_id: string;
  created_at: string;
  created_by: string;
  creator_id: string;
  date_basis: string;
  deleted_at: string | null;
  description: string | null;
  details: string | null;
  display_name: string;
  edited_at: string | null;
  emoji: string;
  event_date: string | null;
  event_id: string;
  event_place: string | null;
  expires_at: string;
  file_size: number;
  file_type: string;
  group_id: string;
  height: number | null;
  id: string;
  ip: string;
  is_anonymous: number;
  is_event: number;
  is_everyone: number;
  is_reference: number;
  is_standalone: number;
  item_id: string;
  item_type: string;
  joined_at: string;
  link: string | null;
  match_key: string;
  mentioned_user_id: string;
  mime_type: string;
  name: string;
  owner_id: string;
  parent_id: string | null;
  password_hash: string;
  position: number;
  post_id: string;
  proposal_notes: string | null;
  read: number;
  reason: string;
  reference_status: string;
  reporter_id: string;
  role: string;
  status: string;
  storage_key: string;
  success: number;
  tagged_by: string | null;
  taken_at: string;
  target_id: string;
  target_type: string;
  text: string;
  tg_deleted_at: string | null;
  theme_preference: string | null;
  thumb_key: string;
  title: string;
  token: string;
  type: string;
  uploaded_at: string;
  used_at: string | null;
  user_id: string;
  username: string;
  visibility: string;
  visibility_override: string | null;
  width: number | null;
  a?: string | number | null;
  actor_display_name?: string | number | null;
  actor_username?: string | number | null;
  an?: string | number | null;
  any?: string | number | null;
  attending?: string | number | null;
  c?: string | number | null;
  count?: string | number | null;
  creator_avatar_color?: string | number | null;
  creator_avatar_url?: string | number | null;
  creator_display_name?: string | number | null;
  creator_username?: string | number | null;
  deleted?: string | number | null;
  expected?: string | number | null;
  file_id?: string | number | null;
  file_position?: string | number | null;
  group_name?: string | number | null;
  is?: string | number | null;
  is_member?: string | number | null;
  item_count?: string | number | null;
  its?: string | number | null;
  main?: string | number | null;
  member?: string | number | null;
  member_count?: string | number | null;
  owner_avatar_color?: string | number | null;
  owner_avatar_url?: string | number | null;
  owner_display_name?: string | number | null;
  owner_name?: string | number | null;
  owner_username?: string | number | null;
  placement_id?: string | number | null;
  post_count?: string | number | null;
  present?: string | number | null;
  reporter_display_name?: string | number | null;
  reporter_username?: string | number | null;
  requester_display_name?: string | number | null;
  requester_username?: string | number | null;
  sort_date?: string | number | null;
  string?: string | number | null;
  tagger_username?: string | number | null;
  though?: string | number | null;
  total?: string | number | null;
  user_reacted?: string | number | null;
  groupId?: string | number | null;
  groupName?: string | number | null;
  maxPos?: string | number | null;
}
