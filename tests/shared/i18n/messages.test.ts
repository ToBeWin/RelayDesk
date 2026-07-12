import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatSystemError, memberMessages, systemMessages } from "@/shared/i18n/messages";

describe("system messages", () => {
  it("keeps every system message key available in both locales", () => {
    expect(Object.keys(systemMessages.en).sort()).toEqual(Object.keys(systemMessages["zh-CN"]).sort());
    expect(Object.keys(memberMessages.en).sort()).toEqual(Object.keys(memberMessages["zh-CN"]).sort());
  });

  it("keeps system-owned English copy free of Chinese characters", () => {
    expect(Object.values(systemMessages.en).join(" ")).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it("keeps core client pages free of inline Chinese system copy", () => {
    for (const source of ["src/app/(workspace)/members/page.tsx"]) {
      expect(readFileSync(path.join(process.cwd(), source), "utf8")).not.toMatch(/[\u4e00-\u9fff]/);
    }
  });

  it("formats known runtime failures without leaking Chinese into English UI", () => {
    expect(formatSystemError("en", "SESSION_NOT_FOUND")).toBe("Hermes could not find this chat. Your RelayDesk history has been kept.");
    expect(formatSystemError("zh-CN", "SESSION_NOT_FOUND")).toBe("Hermes 中未找到这个会话；RelayDesk 本地历史已保留。");
  });
});
