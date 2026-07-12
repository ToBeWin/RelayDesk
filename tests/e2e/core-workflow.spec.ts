import { expect, test } from "@playwright/test";

test("login page localizes the product story and form together", async ({ page }) => {
  await page.setViewportSize({ width: 2048, height: 1119 });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Enter your workspace" })).toBeVisible();
  await expect(page.getByText("Product review notes.md")).toBeVisible();
  if (process.env.RELAYDESK_CAPTURE_README === "1") await page.screenshot({ path: "docs/images/login-en.png", fullPage: true });
  await page.getByRole("button", { name: "Switch to Chinese" }).click();
  await expect(page.getByRole("heading", { name: "进入工作台" })).toBeVisible();
  await expect(page.getByText("需求评审会议纪要.md")).toBeVisible();
  await expect(page.getByLabel("成员姓名")).toBeVisible();
  if (process.env.RELAYDESK_CAPTURE_README === "1") await page.screenshot({ path: "docs/images/login-zh.png", fullPage: true });
});

test("operator can chat, persist history, save content, and search it", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    window.localStorage.setItem("relaydesk:locale", "zh-CN");
  });
  await page.goto("/login");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  await page.getByLabel("成员姓名").fill("E2E 管理员");
  await page.getByLabel("个人密码").fill("relaydesk-e2e-password");
  await page.getByRole("button", { name: "进入 RelayDesk" }).click();
  await expect(page).toHaveURL(/\/chat/);
  await page.waitForLoadState("networkidle");
  await page.setViewportSize({ width: 2048, height: 1119 });
  const [historyRail, chatCanvas] = await Promise.all([
    page.locator(".conversation-rail").boundingBox(),
    page.locator(".chat-canvas").boundingBox(),
  ]);
  expect(historyRail).toBeTruthy();
  expect(chatCanvas).toBeTruthy();
  expect(historyRail!.x).toBeLessThan(chatCanvas!.x);
  expect(chatCanvas!.width).toBeGreaterThan(1_000);
  await page.getByRole("button", { name: "折叠对话列表" }).click();
  await expect(page.locator(".conversation-rail")).toBeHidden();
  const collapsedCanvas = await page.locator(".chat-canvas").boundingBox();
  expect(collapsedCanvas?.width).toBeGreaterThan(1_200);
  await page.reload();
  await expect(page.locator(".conversation-rail")).toBeHidden();
  const restoredCollapsedCanvas = await page.locator(".chat-canvas").boundingBox();
  expect(restoredCollapsedCanvas?.width).toBeGreaterThan(1_200);
  await page.getByRole("button", { name: "展开对话列表" }).click();
  await expect(page.locator(".conversation-rail")).toBeVisible();
  await page.getByRole("button", { name: "折叠侧边栏" }).click();
  await expect(page.locator(".sidebar")).toHaveClass(/collapsed/);
  await page.getByRole("button", { name: "展开侧边栏" }).click();
  await expect(page.locator(".sidebar")).not.toHaveClass(/collapsed/);

  const startButton = page.locator(".empty-chat").getByRole("button", { name: "新建会话" });
  await expect(startButton).toBeEnabled();
  await startButton.click();
  const composer = page.getByRole("textbox", { name: "消息内容" });
  await expect(composer).toBeEnabled();
  await composer.fill("刷新后仍应保留的草稿");
  await page.waitForTimeout(200);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "消息内容" })).toHaveValue("刷新后仍应保留的草稿");
  await composer.fill("生成一条 RelayDesk E2E 验收内容");
  await composer.press("Enter");
  await expect(page.getByText("Mock Runtime 已收到：生成一条 RelayDesk E2E 验收内容")).toBeVisible();
  if (process.env.RELAYDESK_CAPTURE_README === "1") {
    await page.screenshot({ path: "docs/images/chat-zh.png", fullPage: true });
    await page.getByRole("button", { name: "Switch to English" }).click();
    await page.screenshot({ path: "docs/images/chat-en.png", fullPage: true });
    await page.getByRole("button", { name: "Switch to Chinese" }).click();
  }

  await page.reload();
  await expect(page.getByText("Mock Runtime 已收到：生成一条 RelayDesk E2E 验收内容")).toBeVisible();
  await page.getByLabel("会话操作").getByRole("button", { name: "归档会话" }).click();
  await page.getByRole("button", { name: "确认归档" }).click();
  await page.getByRole("button", { name: "恢复并继续" }).click();
  await expect(page.getByRole("textbox", { name: "消息内容" })).toBeEnabled();
  await page.getByRole("button", { name: "置顶", exact: true }).click();
  await expect(page.getByRole("button", { name: "取消置顶", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.locator("button.conversation-empty")).toBeVisible();
  await page.goto("/settings");
  await page.getByPlaceholder("电脑名称，例如：内容工作站 01").fill("E2E Hermes 主机");
  await page.getByPlaceholder("内网 IP，例如：192.168.1.20").fill("192.168.50.20");
  await page.getByPlaceholder("位置或用途（可选）").fill("浏览器自动化验收");
  await page.getByRole("button", { name: "登记主机" }).click();
  await expect(page.locator(".host-grid")).toContainText("E2E Hermes 主机");
  await expect(page.locator(".audit-list")).toContainText("agent_host.created");
  await page.getByRole("button", { name: "立即备份" }).click();
  await expect(page.getByLabel("系统通知").getByText(/备份完成：\d+ 个文件已归档。/)).toBeVisible();

  await page.goto("/members");
  await page.getByPlaceholder("员工姓名").fill("E2E 成员");
  await page.getByPlaceholder("初始密码（至少 8 位）").fill("relaydesk-e2e-member-password");
  await page.getByRole("button", { name: "新增成员" }).click();
  const memberCard = page.locator(".member-list > article").filter({ hasText: "E2E 成员" });
  await expect(memberCard).toBeVisible();
  await memberCard.locator('input[type="checkbox"]').first().check();
  await memberCard.getByRole("button", { name: "保存 Agent 授权" }).click();
  await expect(page.getByLabel("系统通知").getByText("Agent 授权已保存。")).toBeVisible();

  await page.getByRole("button", { name: "退出登录" }).click();
  await page.getByLabel("成员姓名").fill("E2E 成员");
  await page.getByLabel("个人密码").fill("relaydesk-e2e-member-password");
  await page.getByRole("button", { name: "进入 RelayDesk" }).click();
  await expect(page).toHaveURL(/\/chat/);
  await expect(page.locator(".conversation-empty")).toContainText("创建第一个会话");
  await expect(page.getByText("Mock Runtime 已收到：生成一条 RelayDesk E2E 验收内容")).toHaveCount(0);
  await page.locator("button.conversation-empty").click();
  await expect(page.getByRole("textbox", { name: "消息内容" })).toBeEnabled();
  expect(pageErrors).toEqual([]);
});
