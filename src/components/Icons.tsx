import React from 'react';
import { Heart, Flame, Laugh, HandMetal, PartyPopper, Smile, Sparkles, Lock, Users, Globe, Clock, MapPin } from 'lucide-react';

/** Reaction keys are stored in the database as emoji strings, so we keep them as keys and only change how they are drawn. */
const MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  '\u2764\uFE0F': Heart,
  '\u2764': Heart,
  '\uD83D\uDD25': Flame,
  '\uD83D\uDE02': Laugh,
  '\uD83D\uDC4F': HandMetal,
  '\uD83C\uDF89': PartyPopper,
  '\uD83D\uDE2E': Smile,
};

export const ReactionIcon: React.FC<{ reaction: string; className?: string }> = ({ reaction, className = 'w-4 h-4' }) => {
  const Icon = MAP[reaction];
  if (!Icon) return <span className={className}>{reaction}</span>;
  return <Icon className={className} />;
};

export const SparkIcon = Sparkles;
export const LockIcon = Lock;
export const PeopleIcon = Users;
export const GlobeIcon = Globe;
export const ClockIcon = Clock;
export const PinIcon = MapPin;
