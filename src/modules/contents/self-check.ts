export function buildSelfCheckPrompt(input: { accountContext: string; contentMarkdown: string }): string {
  return `请对以下待发布内容进行发布前自检。\n\n【账号信息】\n${input.accountContext || "未提供账号信息"}\n\n【待检查内容】\n${input.contentMarkdown}\n\n请检查：\n1. 是否符合账号定位；\n2. 标题、正文、旁白是否一致；\n3. 是否有明显事实、逻辑或表达问题；\n4. 是否重复、啰嗦、机械化；\n5. 是否适合口播；\n6. 是否存在敏感、违规或容易误解的表达；\n7. 是否遗漏关键信息；\n8. 给出修改建议和 0-100 分评分。\n\n请使用清晰 Markdown 输出。`;
}
