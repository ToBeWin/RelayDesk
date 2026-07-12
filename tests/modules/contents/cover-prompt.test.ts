import { describe, expect, it } from "vitest";
import { buildCoverPrompt } from "@/modules/contents/cover";

describe("buildCoverPrompt", () => {
  it("requests generation through the runtime with title and aspect ratio", () => {
    const prompt = buildCoverPrompt({ title: "AI 工作流", aspectRatio: "16:9", requirements: "科技感" });
    expect(prompt).toContain("AI 工作流"); expect(prompt).toContain("16:9"); expect(prompt).toContain("图片生成能力");
  });
  it("requests a visibly different variant while preserving constraints", () => {
    const prompt = buildCoverPrompt({ title: "AI 工作流", aspectRatio: "3:4", mode: "regenerate" });
    expect(prompt).toContain("保持上一版"); expect(prompt).toContain("明显不同"); expect(prompt).toContain("AI 工作流");
  });
});
