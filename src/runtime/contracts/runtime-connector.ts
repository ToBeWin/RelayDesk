import type { ChannelEvent, RuntimeCapabilities, RuntimeHealth, RuntimeInfo, RuntimeProfile, RuntimeSession, RuntimeSessionSummary, RuntimeType, SendMessageInput } from "@/runtime/contracts/types";

export interface RuntimeConnector {
  readonly type: RuntimeType;
  getInfo(): Promise<RuntimeInfo>;
  healthCheck(): Promise<RuntimeHealth>;
  getCapabilities(): Promise<RuntimeCapabilities>;
  listProfiles(): Promise<RuntimeProfile[]>;
  listSessions(): Promise<RuntimeSessionSummary[]>;
  getSession(externalSessionId: string): Promise<RuntimeSession>;
  createSession(input: { title?: string }): Promise<RuntimeSessionSummary>;
  sendMessage(input: SendMessageInput): AsyncIterable<ChannelEvent>;
  cancelRun?(externalRunId: string): Promise<void>;
}
