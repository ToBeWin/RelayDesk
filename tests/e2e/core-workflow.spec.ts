import { expect, test } from "@playwright/test";

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
  const [historyRail, chatCanvas, inspector] = await Promise.all([
    page.locator(".conversation-rail").boundingBox(),
    page.locator(".chat-canvas").boundingBox(),
    page.locator(".utility-pane").boundingBox(),
  ]);
  expect(historyRail).toBeTruthy();
  expect(chatCanvas).toBeTruthy();
  expect(inspector).toBeTruthy();
  expect(historyRail!.x).toBeLessThan(chatCanvas!.x);
  expect(chatCanvas!.x).toBeLessThan(inspector!.x);
  expect(Math.abs(historyRail!.y - inspector!.y)).toBeLessThan(2);
  await page.getByRole("button", { name: "折叠侧边栏" }).click();
  await expect(page.locator(".sidebar")).toHaveClass(/collapsed/);
  await page.getByRole("button", { name: "展开侧边栏" }).click();
  await expect(page.locator(".sidebar")).not.toHaveClass(/collapsed/);

  const startButton = page.getByRole("button", { name: "开始新会话" });
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

  await page.reload();
  await expect(page.getByText("Mock Runtime 已收到：生成一条 RelayDesk E2E 验收内容")).toBeVisible();
  const assistantMessage = page.locator(".message.assistant").filter({ hasText: "Mock Runtime 已收到：生成一条 RelayDesk E2E 验收内容" });
  await assistantMessage.getByRole("button", { name: "保存为内容" }).click();
  await expect(assistantMessage.getByRole("button", { name: "已保存为内容" })).toBeDisabled();
  await page.getByLabel("会话操作").getByRole("button", { name: "归档会话" }).click();
  await page.getByRole("button", { name: "确认归档" }).click();
  await page.getByRole("button", { name: "恢复并继续" }).click();
  await expect(page.getByRole("textbox", { name: "消息内容" })).toBeEnabled();
  await page.getByRole("button", { name: "置顶", exact: true }).click();
  await expect(page.getByRole("button", { name: "取消置顶", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.locator(".conversation-empty")).toContainText("创建第一个会话");
  await page.goto("/contents");
  await page.getByRole("textbox", { name: "搜索内容" }).fill("E2E 验收内容");
  await expect(page.locator(".content-row").filter({ hasText: "Mock Runtime 已收到：生成一条 RelayDesk E2E 验收内容" })).toBeVisible();

  await page.goto("/schedule");
  const contentOption = page.getByLabel("选择内容").locator("option").filter({ hasText: "E2E 验收内容" });
  await page.getByLabel("选择内容").selectOption(await contentOption.getAttribute("value") ?? "");
  await page.getByLabel("备注").fill("E2E 排期验收");
  await page.getByRole("button", { name: "加入发布计划" }).click();
  const schedule = page.locator(".schedule-row").filter({ hasText: "E2E 排期验收" });
  await expect(schedule).toContainText("计划中");
  await schedule.getByRole("link", { name: "打开内容" }).click();
  await expect(page).toHaveURL(/\/contents\?content=/);
  await expect(page.locator(".content-inspector")).toContainText("E2E 验收内容");

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
  await page.getByRole("button", { name: "创建第一个会话" }).click();
  await expect(page.getByRole("textbox", { name: "消息内容" })).toBeEnabled();
  expect(pageErrors).toEqual([]);
});
