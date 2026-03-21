import { describe, expect, it } from "vitest";
import { evaluateFallbackCommentRisk, evaluateModerationResponse } from "@/lib/comment-moderation";

describe("comment moderation helpers", () => {
  it("approves a clean fallback comment", () => {
    expect(evaluateFallbackCommentRisk("This page helped me find the item fast.")).toEqual({
      approved: true,
      ruleHits: []
    });
  });

  it("blocks obvious spam links in fallback moderation", () => {
    expect(evaluateFallbackCommentRisk("join my server https://discord.gg/test now")).toEqual({
      approved: false,
      ruleHits: ["external_link"]
    });
  });

  it("approves a safe OpenAI moderation response", () => {
    expect(
      evaluateModerationResponse({
        results: [
          {
            flagged: false,
            categories: { harassment: false },
            category_scores: { harassment: 0.01 }
          }
        ]
      })
    ).toBe(true);
  });

  it("blocks a flagged OpenAI moderation response", () => {
    expect(
      evaluateModerationResponse({
        results: [
          {
            flagged: true,
            categories: { harassment: true },
            category_scores: { harassment: 0.99 }
          }
        ]
      })
    ).toBe(false);
  });
});
