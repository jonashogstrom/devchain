import type { ReviewsService } from '../../reviews/services/reviews.service';
import type { ReviewSuggestionApplier } from '../../reviews/services/review-suggestion-applier.service';
import type { ReviewToolContext } from '../services/handlers/review-context';
import {
  handleListReviews,
  handleGetReview,
  handleGetReviewComments,
  handleReplyComment,
  handleResolveComment,
  handleApplySuggestion,
} from '../services/handlers/review-tools';
import { createNullAdapter } from '../services/handlers/null-adapter';
import { defineToolGroup, type McpBindingRuntime } from './binding-types';

function createReviewContext(runtime: McpBindingRuntime): ReviewToolContext {
  return {
    storage: runtime.storage,
    reviewsService: runtime.reviewsService ?? createNullAdapter<ReviewsService>('ReviewsService'),
    reviewSuggestionApplier:
      runtime.reviewSuggestionApplier ??
      createNullAdapter<ReviewSuggestionApplier>('ReviewSuggestionApplier'),
    resolveSessionContext: runtime.resolveSessionContext,
  };
}

export const reviewBindings = defineToolGroup<ReviewToolContext>(createReviewContext, [
  ['devchain_list_reviews', handleListReviews],
  ['devchain_get_review', handleGetReview],
  ['devchain_get_review_comments', handleGetReviewComments],
  ['devchain_reply_comment', handleReplyComment],
  ['devchain_resolve_comment', handleResolveComment],
  ['devchain_apply_suggestion', handleApplySuggestion],
]);
