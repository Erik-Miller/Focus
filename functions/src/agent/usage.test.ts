import { describe, expect, it } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { emptyUsage, messageText, sumUsage } from "./usage.js";

describe("agent usage helpers", () => {
  it("aggregates provider usage metadata including thinking tokens", () => {
    const first = new HumanMessage("one") as HumanMessage & { usage_metadata: unknown };
    first.usage_metadata = {
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 20,
      output_token_details: { reasoning: 3 },
    };
    const second = new HumanMessage("two") as HumanMessage & { usage_metadata: unknown };
    second.usage_metadata = {
      input_tokens: 2,
      output_tokens: 4,
      total_tokens: 6,
      output_token_details: { reasoning: 1 },
    };

    expect(sumUsage([first, second])).toEqual({
      inputTokens: 12,
      outputTokens: 9,
      thinkingTokens: 4,
      totalTokens: 26,
    });
  });

  it("falls back to input + output tokens when total is omitted", () => {
    const message = new HumanMessage("one") as HumanMessage & { usage_metadata: unknown };
    message.usage_metadata = { input_tokens: 10, output_tokens: 5 };

    expect(sumUsage([message])).toMatchObject({ totalTokens: 15 });
    expect(emptyUsage()).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      totalTokens: 0,
    });
  });

  it("ignores messages without usage metadata and missing reasoning details", () => {
    const message = new HumanMessage("one") as HumanMessage & { usage_metadata: unknown };
    message.usage_metadata = {
      input_tokens: 1,
      output_tokens: 2,
      total_tokens: 3,
    };

    expect(sumUsage([new HumanMessage("no metadata"), message])).toEqual({
      inputTokens: 1,
      outputTokens: 2,
      thinkingTokens: 0,
      totalTokens: 3,
    });
  });

  it("extracts text from string and content-part messages", () => {
    expect(messageText("hello")).toBe("hello");
    expect(messageText([{ text: "hello" }, { type: "image_url" }, " world"])).toBe("hello world");
    expect(messageText({ nope: true })).toBe("");
  });
});
