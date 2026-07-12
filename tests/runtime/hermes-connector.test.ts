import { afterEach, describe, expect, it, vi } from "vitest";
import { createHermesConnector } from "@/runtime/hermes/connector";

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("HermesConnector", () => {
  it("discovers official API-server capabilities with bearer authentication", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ features: { run_events_sse: true, session_resources: true, run_stop: true, tool_progress_events: true, chat_completions: true } }));
    global.fetch = fetchMock as typeof fetch;
    const connector = createHermesConnector({ baseUrl: "http://hermes.internal:8642/", apiKey: "secret" });

    await expect(connector.getCapabilities()).resolves.toMatchObject({ streaming: true, sessions: true, cancellation: true, toolEvents: true, attachments: true });
    expect(fetchMock).toHaveBeenCalledWith("http://hermes.internal:8642/v1/capabilities", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer secret" }) }));
  });

  it("maps the structured runs SSE protocol into RelayDesk events", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"event":"message.delta","delta":"你好"}\n\ndata: {"event":"tool.started","tool":"image_generate","preview":"生成封面"}\n\ndata: {"event":"future.event","value":42}\n\ndata: {"event":"run.completed","output":"你好","usage":{"total_tokens":12}}\n\n'));
        controller.close();
      },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ run_id: "run_123", status: "started" }, 202))
      .mockResolvedValueOnce(new Response(stream, { headers: { "Content-Type": "text/event-stream" } }));
    global.fetch = fetchMock as typeof fetch;
    const connector = createHermesConnector({ baseUrl: "http://hermes.internal:8642" });
    const events = [];
    for await (const event of connector.sendMessage({ sessionId: "session_123", text: "生成封面" })) events.push(event);

    expect(events.map((event) => event.type)).toEqual(["run.started", "message.started", "message.delta", "tool.started", "runtime.unknown", "message.completed", "context.updated", "run.completed"]);
    expect(events.find((event) => event.type === "runtime.unknown")).toMatchObject({ name: "future.event", payload: { event: "future.event", value: 42 } });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://hermes.internal:8642/v1/runs");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://hermes.internal:8642/v1/runs/run_123/events");
  });

  it("forwards a stable private-memory scope to Hermes runs", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(encoder.encode('data: {"event":"run.completed","output":"ok"}\n\n')); controller.close(); } });
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ run_id: "run_scope" }, 202)).mockResolvedValueOnce(new Response(stream));
    global.fetch = fetchMock as typeof fetch;
    const connector = createHermesConnector({ baseUrl: "http://127.0.0.1:8642", apiKey: "secret" });
    for await (const _event of connector.sendMessage({ sessionId: "session_scope", memoryScope: "relaydesk:agent-a:member-a", text: "hello" })) void _event;
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({ Authorization: "Bearer secret", "X-Hermes-Session-Key": "relaydesk:agent-a:member-a" });
  });

  it("uses the official stop endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    global.fetch = fetchMock as typeof fetch;
    await createHermesConnector({ baseUrl: "http://hermes.internal:8642" }).cancelRun?.("run_123");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://hermes.internal:8642/v1/runs/run_123/stop");
  });

  it("loads session metadata and message history from the official separate endpoints", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ session: { id: "session-1", title: "真实会话", started_at: 100 } }))
      .mockResolvedValueOnce(jsonResponse({ data: [
        { id: 1, role: "user", content: "问题\n\n[RelayDesk 受控附件]\n- a.txt: /tmp/a.txt", timestamp: 101 },
        { id: 5, role: "user", content: "新问题\n\n[RelayDesk Channel Contract]\ninternal protocol", timestamp: 105 },
        { id: 2, role: "assistant", content: "", timestamp: 102, tool_calls: [{}] },
        { id: 3, role: "tool", content: "工具原始输出", timestamp: 103 },
        { id: 4, role: "assistant", content: "最终回答", timestamp: 104 },
      ] }));
    global.fetch = fetchMock as typeof fetch;
    const session = await createHermesConnector({ baseUrl: "http://127.0.0.1:8642" }).getSession("session-1");
    expect(session).toMatchObject({ id: "session-1", title: "真实会话", createdAt: 100_000 });
    expect(session.messages).toEqual([
      { id: "1", role: "user", text: "问题", createdAt: 101_000 },
      { id: "5", role: "user", text: "新问题", createdAt: 105_000 },
      { id: "4", role: "assistant", text: "最终回答", createdAt: 104_000 },
    ]);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "http://127.0.0.1:8642/api/sessions/session-1",
      "http://127.0.0.1:8642/api/sessions/session-1/messages",
    ]);
  });

  it("retries a duplicate runtime session title without changing the RelayDesk title", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: "Title '新建内容会话' is already in use" } }, 409))
      .mockResolvedValueOnce(jsonResponse({ id: "session-2", title: "new-runtime-title", created_at: 100 }));
    global.fetch = fetchMock as typeof fetch;
    const session = await createHermesConnector({ baseUrl: "http://127.0.0.1:8642" }).createSession({ title: "新建内容会话" });
    expect(session).toMatchObject({ id: "session-2", title: "新建内容会话" });
    const retriedBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    expect(retriedBody.title).toMatch(/^新建内容会话 · /);
  });

  it("uses the nested session object returned by current Hermes API Server versions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ object: "session", session: { id: "session-nested", title: "Hermes 标题", started_at: 123 } }, 201));
    global.fetch = fetchMock as typeof fetch;
    await expect(createHermesConnector({ baseUrl: "http://127.0.0.1:8642" }).createSession({ title: "RelayDesk 新会话" }))
      .resolves.toEqual({ id: "session-nested", title: "RelayDesk 新会话", createdAt: 123_000 });
  });

  it("sends images through the official chat completions content format", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "我看到了图片" } }] })); global.fetch = fetchMock as typeof fetch;
    const connector = createHermesConnector({ baseUrl: "https://hermes.example.com" }); const events = [];
    for await (const event of connector.sendMessage({ sessionId: "session-image", text: "描述图片", attachments: [{ name: "image.png", mimeType: "image/png", dataUrl: "data:image/png;base64,aW1hZ2U=" }] })) events.push(event);
    expect(events.map((event) => event.type)).toEqual(["run.started", "message.started", "message.delta", "message.completed", "run.completed"]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://hermes.example.com/v1/chat/completions");
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit; expect(request.headers).toMatchObject({ "X-Hermes-Session-Id": "session-image" });
    expect(JSON.parse(String(request.body)).messages[0].content[1]).toEqual({ type: "image_url", image_url: { url: "data:image/png;base64,aW1hZ2U=" } });
  });

  it("bridges local images through runs so Hermes can use vision tools", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(encoder.encode('data: {"event":"run.completed","output":"已读取图片"}\n\n')); controller.close(); } });
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ run_id: "run_image" }, 202)).mockResolvedValueOnce(new Response(stream));
    global.fetch = fetchMock as typeof fetch;
    const connector = createHermesConnector({ baseUrl: "http://127.0.0.1:8642" });
    for await (const event of connector.sendMessage({ sessionId: "session-image", text: "描述图片", attachments: [{ name: "image.png", mimeType: "image/png", localPath: "/data/image.png", dataUrl: "data:image/png;base64,aW1hZ2U=" }] })) void event;
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:8642/v1/runs");
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.input).toContain("/data/image.png");
    expect(body.input).toContain("vision_analyze");
  });

  it("rejects local document paths for a remote Hermes server", async () => {
    const connector = createHermesConnector({ baseUrl: "https://hermes.example.com" });
    const consume = async () => { for await (const event of connector.sendMessage({ sessionId: "session", text: "读取", attachments: [{ name: "report.pdf", mimeType: "application/pdf", localPath: "/data/report.pdf" }] })) void event; };
    await expect(consume()).rejects.toMatchObject({ code: "ATTACHMENT_REJECTED" });
  });
});
