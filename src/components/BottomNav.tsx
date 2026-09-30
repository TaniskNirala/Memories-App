import React from 'react';
import { Home, Layers, PlusCircle, Users, Shield, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';

interface BottomNavProps {
  currentTab: 'feed' | 'collections' | 'groups' | 'admin' | 'trash';
  onSelectTab: (tab: 'feed' | 'collections' | 'groups' | 'admin' | 'trash') => void;
  onOpenUpload: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentTab, onSelectTab, onOpenUpload }) => {
  const { user, isAdmin, isPending } = useAuth();

  if (!user || isPending) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border-color)] bg-[var(--bg-card)]/95 backdrop-blur-lg pb-safe">
      <div className="max-w-md mx-auto grid grid-cols-5 items-center h-14 px-2">
        {/* Tab 1: Feed */}
        <button
          onClick={() => onSelectTab('feed')}
          className={`flex flex-col items-center justify-center w-full h-full transition ${
            currentTab === 'feed'
              ? 'text-[var(--accent-coral)] font-semibold'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] tracking-tight mt-0.5">Stream</span>
        </button>

        {/* Tab 2: Collections */}
        <button
          onClick={() => onSelectTab('collections')}
          className={`flex flex-col items-center justify-center w-full h-full transition ${
            currentTab === 'collections'
              ? 'text-[var(--accent-coral)] font-semibold'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Layers className="w-5 h-5" />
          <span className="text-[10px] tracking-tight mt-0.5">Albums</span>
        </button>

        {/* Center: Upload Button */}
        <div className="flex items-center justify-center">
          <button
            onClick={onOpenUpload}
            aria-label="Upload Memory"
            className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 text-white flex items-center justify-center shadow-md active:scale-95 transition transform playful-btn"
          >
            <PlusCircle className="w-6 h-6" />
          </button>
        </div>

        {/* Tab 4: Circles */}
        <button
          onClick={() => onSelectTab('groups')}
          className={`flex flex-col items-center justify-center w-full h-full transition ${
            currentTab === 'groups'
              ? 'text-[var(--accent-coral)] font-semibold'
              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Users className="w-5 h-5" />
          <span className="text-[10px] tracking-tight mt-0.5">Circles</span>
        </button>

        {/* Tab 5: Admin or Trash */}
        {isAdmin ? (
          <button
            onClick={() => onSelectTab('admin')}
            className={`flex flex-col items-center justify-center w-full h-full transition ${
              currentTab === 'admin'
                ? 'text-[var(--accent-coral)] font-semibold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Shield className="w-5 h-5" />
            <span className="text-[10px] tracking-tight mt-0.5">Admin</span>
          </button>
        ) : (
          <button
            onClick={() => onSelectTab('trash')}
            className={`flex flex-col items-center justify-center w-full h-full transition ${
              currentTab === 'trash'
                ? 'text-[var(--accent-coral)] font-semibold'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Trash2 className="w-5 h-5" />
            <span className="text-[10px] tracking-tight mt-0.5">Trash</span>
          </button>
        )}
      </div>
    </nav>
  );
};
