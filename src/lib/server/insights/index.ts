/**
 * One import for the page: building the numbers and writing about them are
 * separate modules because only the second one costs money, but a caller that
 * wants an analysis always wants both.
 */
export { buildInsightInput, fingerprintInput } from './input';
export type { CategoryChange, InsightInput } from './input';
export { generateInsight, insightSchema } from './generate';
export type { Insight, SavingIdea } from './generate';
