import { describe, expect, it } from "vitest";
import { forSpeech } from "@/lib/analytics/pronunciation";

describe("forSpeech", () => {
  it("respells Dončić with or without diacritics", () => {
    expect(forSpeech("Dončić hits the step-back three.")).toBe("Don-chich hits the step-back three.");
    expect(forSpeech("Luka Doncic misses the jumper.")).toBe("Luka Don-chich misses the jumper.");
  });

  it("handles possessives and repeats", () => {
    expect(forSpeech("That's 20 for Dončić. Dončić's fourth three.")).toBe("That's 20 for Don-chich. Don-chich's fourth three.");
  });

  it("leaves other text alone", () => {
    expect(forSpeech("Thybulle buries the three! All tied at 6.")).toBe("Thybulle buries the three! All tied at 6.");
  });
});
