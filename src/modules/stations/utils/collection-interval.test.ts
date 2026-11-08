import { describe, expect, it } from "vitest";

import {
  DEFAULT_COLLECTION_INTERVAL_SECONDS,
  isValidCollectionInterval,
  maxCollectionIntervalSeconds,
  MIN_COLLECTION_INTERVAL_SECONDS,
} from "@/modules/stations/utils/collection-interval.js";

describe("collection interval rules", () => {
  it("should_allow_at_most_half_of_the_offline_threshold", () => {
    expect(maxCollectionIntervalSeconds(10)).toBe(300);
    expect(maxCollectionIntervalSeconds(1)).toBe(30);
    expect(maxCollectionIntervalSeconds(60)).toBe(1800);
  });

  it("should_round_the_maximum_down_when_the_threshold_is_odd_in_seconds", () => {
    expect(maxCollectionIntervalSeconds(0.25)).toBe(7);
  });

  it("should_accept_the_default_with_the_default_threshold", () => {
    expect(
      isValidCollectionInterval(DEFAULT_COLLECTION_INTERVAL_SECONDS, 10),
    ).toBe(true);
  });

  it("should_accept_both_limits", () => {
    expect(isValidCollectionInterval(MIN_COLLECTION_INTERVAL_SECONDS, 10)).toBe(
      true,
    );
    expect(isValidCollectionInterval(300, 10)).toBe(true);
  });

  it.each([
    ["below the minimum", 9],
    ["zero", 0],
    ["negative", -60],
    ["above half the offline threshold", 301],
    ["fractional", 60.5],
    ["not a number", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
  ])("should_reject_an_interval_%s", (_case, seconds) => {
    expect(isValidCollectionInterval(seconds, 10)).toBe(false);
  });

  it("should_reject_everything_when_the_threshold_leaves_no_room_above_the_minimum", () => {
    expect(isValidCollectionInterval(10, 0.25)).toBe(false);
  });
});
