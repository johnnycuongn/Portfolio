/**
 * The weekly review, in one import.
 *
 *   import WeeklyReview from '@/app/career/_components/WeeklyReview';
 *
 * The component is a client component; `digest.ts` is pure and safe to call from
 * a server component (the dashboard can decide whether there is anything worth
 * showing before it renders anything at all).
 */

export { default } from './WeeklyReview';
export { default as WeeklyReview, WEEKLY_REVIEW_STORAGE_KEY } from './WeeklyReview';
export type { WeeklyReviewProps } from './WeeklyReview';

export {
  buildWeeklyDigest,
  dayLabel,
  movedSummary,
  shouldOpenWeeklyReview,
  startOfWeek,
  weekKey,
  STALLED_DAYS,
  WINDOW_DAYS,
} from './digest';
export type {
  MovedEntry,
  ReviewGoal,
  ReviewMilestone,
  ReviewTask,
  ReviewWin,
  StalledTask,
  WeeklyDigest,
} from './digest';
