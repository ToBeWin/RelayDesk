export function buildCoverPrompt(input: { title: string; aspectRatio: string; requirements?: string; mode?: "generate" | "regenerate" }): string {
  if (input.mode === "regenerate") return `保持上一版封面的主题、标题、比例和约束，再生成一个明显不同的方案。\n封面标题：${input.title}\n比例：${input.aspectRatio}\n补充要求：${input.requirements || "沿用上一版"}\n请调用你已有的图片生成能力，并返回新的最终图片文件。`;
  return `请基于当前内容和本次上传的参考图片生成一张封面。\n封面标题：${input.title}\n比例：${input.aspectRatio}\n补充要求：${input.requirements || "无"}\n请调用你已有的图片生成能力，并返回最终图片文件。`;
}
