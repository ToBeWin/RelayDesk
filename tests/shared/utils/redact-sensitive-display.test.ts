import { describe, expect, it } from "vitest";
import { redactSensitiveDisplayText } from "@/shared/utils/redact-sensitive-display";

describe("redactSensitiveDisplayText", () => {
  it("hides apparent secret file names without changing regular output", () => {
    const text = "1. report.pdf - 周报\n2. studio-deploy-key - 部署凭据\n3. notes.txt - 备注";

    expect(redactSensitiveDisplayText(text)).toBe(
      "1. report.pdf - 周报\n[疑似敏感文件名已在界面隐藏]\n3. notes.txt - 备注",
    );
  });
});
