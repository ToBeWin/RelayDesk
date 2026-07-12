const SENSITIVE_FILE_NAME = /\b[\w.-]*(?:deploy|private|secret|credential|token)[\w.-]*(?:key|token|secret)\b|\bid_rsa(?:\.pub)?\b|\S+\.(?:pem|key)\b/iu;

/**
 * Prevents a Runtime tool response from exposing an apparent local secret name
 * in the shared UI. The original event stays available in the server audit data.
 */
export function redactSensitiveDisplayText(text: string): string {
  return text
    .split("\n")
    .map((line) => SENSITIVE_FILE_NAME.test(line) ? "[疑似敏感文件名已在界面隐藏]" : line)
    .join("\n");
}
