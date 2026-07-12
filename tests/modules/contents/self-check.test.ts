import { describe, expect, it } from "vitest";
import { buildSelfCheckPrompt } from "@/modules/contents/self-check";

describe("buildSelfCheckPrompt", () => {
  it("includes both account context and the full markdown body", () => {
    const prompt = buildSelfCheckPrompt({ accountContext: "科技账号", contentMarkdown: "# 标题\n\n完整正文" });
    expect(prompt).toContain("科技账号");
    expect(prompt).toContain("完整正文");
    expect(prompt).toContain("0-100");
  });
});
