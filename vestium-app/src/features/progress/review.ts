import { AdaptiveItem, ProgressState } from '../../types/progress';
import { DEFAULT_THEME_ID } from '../../lib/training-core/registry';

const adaptiveItemsMap = (state: ProgressState) => state.adaptiveItems ?? state.reviewItems ?? {};
const itemThemeId = (item: AdaptiveItem) => item.themeId ?? DEFAULT_THEME_ID;

export const getAllReviewItems = (state: ProgressState): AdaptiveItem[] =>
  Object.values(adaptiveItemsMap(state));

export const getAllReviewItemsForTheme = (
  state: ProgressState,
  themeId: string
): AdaptiveItem[] => getAllReviewItems(state).filter((item) => itemThemeId(item) === themeId);

export const getDueReviewItems = (state: ProgressState, now = new Date()): AdaptiveItem[] =>
  getAllReviewItems(state)
    .filter((item) => new Date(item.dueAt).getTime() <= now.getTime())
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());

export const getDueReviewItemsForTheme = (
  state: ProgressState,
  themeId: string,
  now = new Date()
): AdaptiveItem[] =>
  getAllReviewItemsForTheme(state, themeId)
    .filter((item) => new Date(item.dueAt).getTime() <= now.getTime())
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());

export const getUpcomingReviewItems = (
  state: ProgressState,
  now = new Date()
): AdaptiveItem[] =>
  getAllReviewItems(state)
    .filter((item) => new Date(item.dueAt).getTime() > now.getTime())
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());

export const getUpcomingReviewItemsForTheme = (
  state: ProgressState,
  themeId: string,
  now = new Date()
): AdaptiveItem[] =>
  getAllReviewItemsForTheme(state, themeId)
    .filter((item) => new Date(item.dueAt).getTime() > now.getTime())
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());

// Compatibility aliases for naming transition.
export const getAllAdaptiveItems = getAllReviewItems;
export const getDueAdaptiveItems = getDueReviewItems;
export const getUpcomingAdaptiveItems = getUpcomingReviewItems;
