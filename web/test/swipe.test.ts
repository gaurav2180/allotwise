import { describe, expect, it } from "vitest";
import { swipeDirection } from "@/hooks/use-swipe";

const W = 390; // an iPhone's width in CSS pixels
const swipe = (dx: number, dy = 0, dt = 200) => swipeDirection({ dx, dy, dt, width: W });

describe("swipeDirection", () => {
  it("reads a quick sideways flick as a swipe, either way", () => {
    expect(swipe(-120)).toBe("left");
    expect(swipe(120)).toBe("right");
    expect(swipe(-56)).toBe("left");
  });

  it("ignores a nudge too short to be meant", () => {
    expect(swipe(-55)).toBeNull();
    expect(swipe(30)).toBeNull();
    expect(swipe(0)).toBeNull();
  });

  it("never mistakes a vertical scroll for a swipe, drift and all", () => {
    expect(swipe(0, -400)).toBeNull();
    expect(swipe(-60, -300)).toBeNull(); // thumb drifting sideways while scrolling
    expect(swipe(-100, 60)).toBeNull(); // diagonal: not twice as wide as tall
    expect(swipe(-130, 60)).toBe("left"); // clearly sideways
  });

  it("takes a slow drag only when it crosses a third of the screen", () => {
    expect(swipe(-100, 0, 1200)).toBeNull(); // finger resting while reading
    expect(swipe(-140, 0, 1200)).toBe("left");
  });
});
