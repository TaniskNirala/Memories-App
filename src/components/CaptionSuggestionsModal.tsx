import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Check,
  RefreshCw,
  Edit2,
  Copy,
  Quote,
  MessageSquare,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { FeedItem } from '../types/index.ts';
import { apiFetch } from '../context/AuthContext.tsx';

interface CaptionSuggestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: FeedItem | null;
  onCaptionUpdated: (newCaption: string) => void;
}

export const CaptionSuggestionsModal: React.FC<CaptionSuggestionsModalProps> = ({
  isOpen,
  onClose,
  item,
  onCaptionUpdated,
}) => {
  const [loading, setLoading] = useState(false);
  const [currentCaption, setCurrentCaption] = useState('');
  const [suggestions, setSuggestions] = useState<Array<{ tone: string; text: string }>>([]);
  const [selectedText, setSelectedText] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [temporalSummary, setTemporalSummary] = useState<string | null>(null);
  const [activeTone, setActiveTone] = useState<string>('nostalgic');

  const fetchSuggestions = async (requestedTone?: string) => {
    if (!item) return;
    const toneToUse = requestedTone || activeTone;
    setLoading(true);
    setToastMessage(null);
    try {
      const res = await apiFetch(`/api/ai/caption-post/${item.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tone: toneToUse, updateDatabase: false }),
      });

      if (res.ok) {
        const data = await res.json();
        const itemCaption = item.type === 'single_post' ? item.caption : (item as any).caption;
        setCurrentCaption(itemCaption || data.currentCaption || '');
        setSuggestions(data.suggestions || []);
        if (data.temporalSummary) {
          setTemporalSummary(data.temporalSummary);
        }
        if (data.suggestions && data.suggestions.length > 0) {
          setSelectedText(data.suggestions[0].text);
        } else if (data.caption) {
          setSelectedText(data.caption);
        }
      }
    } catch (err) {
      console.error('Failed to fetch caption suggestions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && item) {
      const itemCaption = item.type === 'single_post' ? item.caption : (item as any).caption;
      setCurrentCaption(itemCaption || '');
      setIsEditing(false);
      fetchSuggestions();
    }
  }, [isOpen, item?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isApplying) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isApplying, onClose]);

  if (!isOpen || !item) return null;

  const handleApplyCaption = async (captionToSave: string) => {
    setIsApplying(true);
    try {
      const res = await apiFetch(`/api/posts/${item.id}/caption`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption: captionToSave }),
      });

      if (res.ok) {
        if (item.type === 'single_post') {
          item.caption = captionToSave;
        } else {
          (item as any).caption = captionToSave;
        }
        onCaptionUpdated(captionToSave);
        setToastMessage('Caption updated successfully!');
        setTimeout(() => {
          onClose();
        }, 600);
      }
    } catch (err) {
      console.error('Failed to apply caption:', err);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div
      className="scrim z-60"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isApplying) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[26px] shadow-[0_24px_60px_-28px_rgba(0,0,0,0.85)] p-5 text-[var(--text-primary)] relative flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center shadow-xs">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-[var(--text-primary)] flex items-center gap-2">
                Caption Suggestions
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                Review AI suggestions and choose whether to apply one
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => fetchSuggestions()}
              disabled={loading}
              className="p-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
              title="Regenerate suggestions"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[var(--accent-amber)]' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Time Context Banner */}
        {temporalSummary && (
          <div className="tone-amber mt-3 p-2.5 rounded-2xl border flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-[var(--tone-amber-fg)] flex items-center justify-center shrink-0">
                <Calendar className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-[10px] text-[var(--tone-amber-fg)] uppercase tracking-wider font-bold block">
                  Detected Memory Timeline
                </span>
                <span className="text-[var(--text-primary)] font-medium text-xs">
                  {temporalSummary}
                </span>
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-[var(--bg-card)]/70 text-[var(--text-secondary)] font-mono">
              Time-Aware
            </span>
          </div>
        )}

        {/* Tone Selector */}
        <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <span className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider shrink-0 mr-1">
            Tone:
          </span>
          {[
            { id: 'nostalgic', label: '⏳ Throwback / Nostalgic' },
            { id: 'warm', label: 'Warm & Heartfelt' },
            { id: 'witty', label: 'Fun & Witty' },
            { id: 'short', label: 'Minimal' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setActiveTone(t.id);
                fetchSuggestions(t.id);
              }}
              className={`px-2.5 py-1 rounded-xl text-[11px] font-medium transition shrink-0 cursor-pointer ${
                activeTone === t.id
                  ? 'bg-amber-500 text-neutral-950 font-bold shadow-xs'
                  : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Current Caption (Preserved) */}
        <div className="mt-3.5 p-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs space-y-1">
          <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider flex items-center gap-1">
            <Quote className="w-3 h-3 text-[var(--accent-amber)]" /> Current Caption
          </span>
          <p className="text-[var(--text-secondary)] italic font-serif text-sm">
            {currentCaption ? `“${currentCaption}”` : '(No caption set for this photo)'}
          </p>
        </div>

        {/* Feedback message */}
        {toastMessage && (
          <div className="tone-emerald mt-2.5 p-2 rounded-xl border text-xs flex items-center gap-1.5 animate-in fade-in duration-100">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Suggestions List */}
        <div className="flex-1 overflow-y-auto my-3.5 space-y-2.5 pr-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">
              Suggested by Gemini (Click to select)
            </span>
            <span className="text-[10px] text-[var(--tone-amber-fg)] font-mono">
              Never overrides without your click
            </span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-[var(--text-muted)] space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[var(--accent-amber)]" />
              <p className="text-xs">Analyzing photo and generating authentic suggestions...</p>
            </div>
          ) : suggestions.length === 0 ? (
            <div className="py-10 text-center text-[var(--text-muted)] space-y-2">
              <Sparkles className="w-6 h-6 mx-auto text-[var(--text-muted)]" />
              <p className="text-xs">No suggestions generated yet.</p>
              <button
                onClick={() => fetchSuggestions()}
                className="tone-amber px-3 py-1 rounded-xl border text-xs font-semibold hover:opacity-90 transition"
              >
                Generate Suggestions
              </button>
            </div>
          ) : (
            suggestions.map((suggestion, idx) => {
              const isSelected = selectedText === suggestion.text;

              return (
                <div
                  key={idx}
                  onClick={() => {
                    setSelectedText(suggestion.text);
                    setIsEditing(false);
                  }}
                  className={`p-3 rounded-2xl border text-left cursor-pointer transition flex flex-col justify-between gap-2.5 ${
                    isSelected
                      ? 'bg-amber-500/15 border-amber-500/50 shadow-md ring-1 ring-amber-500/20'
                      : 'bg-[var(--bg-surface)] border-[var(--border-color)] hover:border-[var(--accent-amber)]/35'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="tone-amber text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border">
                      {suggestion.tone}
                    </span>
                    {isSelected && (
                      <span className="text-[11px] font-semibold text-[var(--tone-amber-fg)] flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Selected
                      </span>
                    )}
                  </div>

                  <p className="text-xs sm:text-sm text-[var(--text-primary)] font-sans leading-relaxed">
                    “{suggestion.text}”
                  </p>

                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-[var(--border-subtle)]">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApplyCaption(suggestion.text);
                      }}
                      disabled={isApplying}
                      className="px-3 py-1 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:opacity-95 text-white font-semibold text-xs shadow-xs transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Check className="w-3 h-3" />
                      <span>Apply this</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Selected / Edit Custom Caption */}
        {selectedText && (
          <div className="p-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[var(--text-secondary)] flex items-center gap-1">
                <Edit2 className="w-3 h-3 text-[var(--accent-amber)]" /> Fine-tune caption before applying:
              </span>
            </div>
            <textarea
              rows={2}
              value={selectedText}
              onChange={(e) => setSelectedText(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden focus:ring-1 focus:ring-amber-400"
            />
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-3 border-t border-[var(--border-color)] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-elevated)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
          >
            Keep Current & Close
          </button>

          {selectedText && (
            <button
              onClick={() => handleApplyCaption(selectedText)}
              disabled={isApplying}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:opacity-95 text-white font-semibold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isApplying ? 'Applying...' : 'Apply Selected Caption'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
