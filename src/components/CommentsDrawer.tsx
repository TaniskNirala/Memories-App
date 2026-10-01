import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Trash2, Edit2, CornerDownRight, Check, Smile } from 'lucide-react';
import { FeedItem, CommentItem, GroupMember } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';

interface CommentsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  item: FeedItem | null;
  groupId?: string;
  onReactionToggle?: (targetId: string, groupId: string, emoji: string) => void;
}

const EMOJIS = ['❤️', '🔥', '😂', '👏', '🎉', '😮'];

export const CommentsDrawer: React.FC<CommentsDrawerProps> = ({
  isOpen,
  onClose,
  item,
  groupId,
  onReactionToggle,
}) => {
  const { user, isAdmin } = useAuth();
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [replyingTo, setReplyingTo] = useState<CommentItem | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);

  const activeGroupId = groupId || item?.activeGroupId || item?.placements?.[0]?.groupId || (item?.placements?.[0] as any)?.group_id;

  const fetchComments = async () => {
    if (!item || !activeGroupId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/comments?targetType=${item.type === 'single_post' ? 'post' : 'album'}&targetId=${item.id}&groupId=${activeGroupId}`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments || []);
      }
    } catch (e) {
      console.error('Failed to load comments', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchGroupMembers = async () => {
    if (!activeGroupId) return;
    try {
      const res = await fetch(`/api/comments/group-members/${activeGroupId}`);
      if (res.ok) {
        const data = await res.json();
        setGroupMembers(data.members || []);
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (isOpen && item && activeGroupId) {
      fetchComments();
      fetchGroupMembers();
      setText('');
      setReplyingTo(null);
    }
  }, [isOpen, item, activeGroupId]);

  if (!isOpen || !item) return null;

  // Handle typing & @mentions
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setText(val);

    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAt = textBeforeCursor.lastIndexOf('@');

    if (lastAt !== -1 && !textBeforeCursor.slice(lastAt).includes(' ')) {
      const query = textBeforeCursor.slice(lastAt + 1).toLowerCase();
      setMentionFilter(query);
      setShowMentionSuggestions(true);
    } else {
      setShowMentionSuggestions(false);
    }
  };

  const insertMention = (username: string) => {
    const cursorPos = inputRef.current?.selectionStart || 0;
    const textBefore = text.slice(0, cursorPos);
    const lastAt = textBefore.lastIndexOf('@');
    const newText = textBefore.slice(0, lastAt) + `@${username} ` + text.slice(cursorPos);
    setText(newText);
    setShowMentionSuggestions(false);
    inputRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: item.type === 'single_post' ? 'post' : 'album',
          targetId: item.id,
          groupId: activeGroupId,
          text: text.trim(),
          parentId: replyingTo ? replyingTo.id : null,
        }),
      });

      if (res.ok) {
        setText('');
        setReplyingTo(null);
        fetchComments();
      }
    } catch (err) {
      console.error('Failed to post comment', err);
    }
  };

  const handleEditSubmit = async (commentId: string) => {
    if (!editText.trim()) return;
    try {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editText.trim() }),
      });
      if (res.ok) {
        setEditingCommentId(null);
        fetchComments();
      }
    } catch (e) {}
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      const res = await fetch(`/api/comments/${commentId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchComments();
      }
    } catch (e) {}
  };

  // Group comments into root threads
  const rootComments = comments.filter((c) => !c.parentId);
  const repliesByParent: Record<string, CommentItem[]> = {};
  for (const c of comments) {
    if (c.parentId) {
      if (!repliesByParent[c.parentId]) repliesByParent[c.parentId] = [];
      repliesByParent[c.parentId].push(c);
    }
  }

  const filteredMembers = groupMembers.filter((m) => {
    const dName = m.displayName || (m as any).display_name || m.username || '';
    const uName = m.username || '';
    return uName.toLowerCase().includes(mentionFilter) || dName.toLowerCase().includes(mentionFilter);
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-lg bg-[var(--bg-card)] border-t sm:border border-[var(--border-color)] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85vh] h-[75vh] playful-card overflow-hidden">
        {/* Grab bar affordance for mobile */}
        <div className="w-10 h-1 bg-[var(--border-color)] rounded-full mx-auto my-2 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)]">
          <div>
            <h3 className="font-display font-bold text-sm text-[var(--text-primary)]">
              Circle Conversation
            </h3>
            <span className="text-[11px] text-[var(--accent-coral)]">
              {activeGroupId ? 'Private to this circle placement' : 'No circle selected'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!activeGroupId ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <p className="text-xs text-[var(--text-secondary)] max-w-xs leading-relaxed">
              This memory hasn't been placed in a circle yet. Use <strong>"Share to a group"</strong> on the memory card to share it into a circle first.
            </p>
          </div>
        ) : (
          <>
            {/* Reaction quick bar */}
            <div className="flex items-center justify-center gap-2 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/50">
          <span className="text-[11px] text-[var(--text-muted)] mr-1">React:</span>
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onReactionToggle && onReactionToggle(item.id, activeGroupId, emoji)}
              className="w-8 h-8 flex items-center justify-center hover:scale-125 transition text-base"
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Scrollable Comments List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="text-center py-8 text-xs text-[var(--text-muted)]">Loading comments...</div>
          ) : rootComments.length === 0 ? (
            <div className="text-center py-12 text-xs text-[var(--text-muted)]">
              No comments in this circle yet. Start the conversation!
            </div>
          ) : (
            rootComments.map((comment) => (
              <div key={comment.id} className="space-y-2">
                {/* Root Comment */}
                <div className={`p-2.5 rounded-xl bg-[var(--bg-surface)] text-xs border border-[var(--border-subtle)] ${comment.isDeleted ? 'opacity-50 italic' : ''}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-2xs"
                        style={{ backgroundColor: comment.author.avatarColor }}
                      >
                        {comment.author.displayName.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-bold text-[var(--text-primary)]">
                        {comment.author.displayName}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        @{comment.author.username}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {comment.canEdit && !comment.isDeleted && (
                        <button
                          onClick={() => {
                            setEditingCommentId(comment.id);
                            setEditText(comment.text);
                          }}
                          className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      )}
                      {comment.canDelete && !comment.isDeleted && (
                        <button
                          onClick={() => handleDeleteComment(comment.id)}
                          className="p-1 text-[var(--text-muted)] hover:text-rose-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {editingCommentId === comment.id ? (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="flex-1 px-2.5 py-1 text-xs rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)]"
                      />
                      <button
                        onClick={() => handleEditSubmit(comment.id)}
                        className="px-2 py-1 bg-emerald-600 text-white rounded text-xs"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setEditingCommentId(null)}
                        className="px-2 py-1 bg-neutral-700 text-white rounded text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <p className="text-[var(--text-primary)] leading-relaxed">{comment.text}</p>
                  )}

                  {!comment.isDeleted && (
                    <button
                      onClick={() => {
                        setReplyingTo(comment);
                        inputRef.current?.focus();
                      }}
                      className="mt-1 text-[11px] font-medium text-[var(--accent-coral)] hover:underline flex items-center gap-1"
                    >
                      <CornerDownRight className="w-3 h-3" /> Reply
                    </button>
                  )}
                </div>

                {/* Threaded Replies */}
                {repliesByParent[comment.id]?.map((reply) => (
                  <div key={reply.id} className="ml-5 pl-2.5 border-l-2 border-[var(--border-color)] space-y-1">
                    <div className={`p-2 rounded-xl bg-[var(--bg-surface-elevated)] text-xs ${reply.isDeleted ? 'opacity-50 italic' : ''}`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-[var(--text-primary)]">
                            {reply.author.displayName}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)]">
                            @{reply.author.username}
                          </span>
                        </div>
                        {reply.canDelete && !reply.isDeleted && (
                          <button
                            onClick={() => handleDeleteComment(reply.id)}
                            className="p-1 text-[var(--text-muted)] hover:text-rose-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <p className="text-[var(--text-primary)] leading-relaxed">{reply.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Input Bar & Mentions Suggestions */}
        <div className="relative p-3 border-t border-[var(--border-color)] bg-[var(--bg-card)]">
          {/* @mention autocomplete popup */}
          {showMentionSuggestions && filteredMembers.length > 0 && (
            <div className="absolute bottom-full left-3 right-3 mb-2 max-h-36 overflow-y-auto bg-[var(--bg-surface-elevated)] border border-[var(--border-color)] rounded-xl shadow-xl p-1 z-30">
              <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] px-2 py-0.5 block">
                Members in this circle
              </span>
              {filteredMembers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => insertMention(m.username)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left hover:bg-[var(--bg-card)] text-xs text-[var(--text-primary)]"
                >
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                    style={{ backgroundColor: m.avatarColor }}
                  >
                    {m.displayName.charAt(0)}
                  </div>
                  <span className="font-semibold">{m.displayName}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">@{m.username}</span>
                </button>
              ))}
            </div>
          )}

          {replyingTo && (
            <div className="flex items-center justify-between mb-1.5 px-2 py-1 rounded bg-[var(--bg-surface)] text-[11px] text-[var(--text-secondary)]">
              <span>Replying to <strong>@{replyingTo.author.username}</strong></span>
              <button onClick={() => setReplyingTo(null)} className="text-neutral-400 hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={handleInputChange}
              placeholder="Add a comment... (use @ to mention circle friends)"
              className="flex-1 px-3 py-2 text-xs rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden"
            />
            <button
              type="submit"
              disabled={!text.trim()}
              className="p-2 rounded-xl bg-[var(--accent-coral)] hover:opacity-90 disabled:opacity-40 text-white transition playful-btn shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
        </>
      )}
      </div>
    </div>
  );
};
