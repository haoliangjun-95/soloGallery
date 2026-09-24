import { describe, expect, it } from "vitest";
import {
  buildCommentNotifyMessage,
  buildNotifyRequest,
  NOTIFY_TEXT_MAX,
  parseNotifyProvider,
  truncateNotifyText,
} from "./notify";

const serverchanConfig = {
  provider: "serverchan",
  webhookUrl: "https://sctapi.ftqq.com/SCT123.send",
  chatId: "",
};
const telegramConfig = {
  provider: "telegram",
  webhookUrl: "https://api.telegram.org/bot123:ABC/sendMessage",
  chatId: "-100123456",
};
const message = { title: "新评论：日落", text: "小明：好看！\nhttps://example.com/photo/abc" };

function bodyOf(init: RequestInit): Record<string, unknown> {
  return JSON.parse(init.body as string);
}

describe("parseNotifyProvider", () => {
  it("识别受支持的提供方", () => {
    expect(parseNotifyProvider("serverchan")).toBe("serverchan");
    expect(parseNotifyProvider("telegram")).toBe("telegram");
  });

  it("空串（默认关闭）与未知值返回 null", () => {
    expect(parseNotifyProvider("")).toBeNull();
    expect(parseNotifyProvider("slack")).toBeNull();
    expect(parseNotifyProvider("SERVERCHAN")).toBeNull();
  });
});

describe("truncateNotifyText", () => {
  it("不超长原样返回（同一引用，避免无谓拷贝）", () => {
    const text = "短内容";
    expect(truncateNotifyText(text)).toBe(text);
  });

  it("恰好等于上限不截断", () => {
    const text = "a".repeat(NOTIFY_TEXT_MAX);
    expect(truncateNotifyText(text)).toBe(text);
  });

  it("超出上限截断并补省略号", () => {
    const out = truncateNotifyText("a".repeat(NOTIFY_TEXT_MAX + 1));
    expect(out).toBe(`${"a".repeat(NOTIFY_TEXT_MAX)}…`);
  });

  it("按码点计数：emoji（代理对）算 1 个字符不被劈开", () => {
    const out = truncateNotifyText(`${"😀".repeat(NOTIFY_TEXT_MAX)}尾`, 3);
    expect(out).toBe("😀😀😀…");
  });
});

describe("buildCommentNotifyMessage", () => {
  const input = {
    nickname: "小明",
    content: "拍得真好看",
    photoTitle: "日落",
    moderated: false,
    photoUrl: "https://example.com/photo/abc",
  };

  it("标题含「新评论」与照片标题，正文含昵称/内容/链接", () => {
    const msg = buildCommentNotifyMessage(input);
    expect(msg.title).toContain("新评论");
    expect(msg.title).toContain("日落");
    expect(msg.text).toContain("小明：拍得真好看");
    expect(msg.text.split("\n").at(-1)).toBe("https://example.com/photo/abc");
  });

  it("先审后显时标题带（待审核）标记", () => {
    expect(buildCommentNotifyMessage({ ...input, moderated: true }).title).toContain("（待审核）");
    expect(buildCommentNotifyMessage(input).title).not.toContain("（待审核）");
  });

  it("超长内容截断进省略号，标题长度受控", () => {
    const msg = buildCommentNotifyMessage({ ...input, content: "x".repeat(NOTIFY_TEXT_MAX + 50) });
    expect(msg.text).toContain("…");
    expect(msg.text.length).toBeLessThan(NOTIFY_TEXT_MAX + 100);
    const longTitle = buildCommentNotifyMessage({ ...input, photoTitle: "T".repeat(200) });
    expect(longTitle.title.length).toBeLessThanOrEqual(40);
  });

  it("photoUrl 缺省时正文不含链接行", () => {
    const msg = buildCommentNotifyMessage({
      nickname: input.nickname,
      content: input.content,
      photoTitle: input.photoTitle,
      moderated: input.moderated,
    });
    expect(msg.text).not.toContain("http");
  });
});

describe("buildNotifyRequest", () => {
  it("未配置（provider 空 / url 空 / 未知 provider）返回 null 不发送", () => {
    expect(buildNotifyRequest({ ...serverchanConfig, provider: "" }, message)).toBeNull();
    expect(buildNotifyRequest({ ...serverchanConfig, webhookUrl: "" }, message)).toBeNull();
    expect(buildNotifyRequest({ ...serverchanConfig, webhookUrl: "   " }, message)).toBeNull();
    expect(buildNotifyRequest({ ...serverchanConfig, provider: "slack" }, message)).toBeNull();
  });

  it("telegram 缺 chatId 返回 null（配置不完整视为关闭）", () => {
    expect(buildNotifyRequest({ ...telegramConfig, chatId: "" }, message)).toBeNull();
    expect(buildNotifyRequest({ ...telegramConfig, chatId: "  " }, message)).toBeNull();
  });

  it("serverchan：POST JSON {title, desp}", () => {
    const req = buildNotifyRequest(serverchanConfig, message);
    expect(req).not.toBeNull();
    expect(req?.url).toBe(serverchanConfig.webhookUrl);
    expect(req?.init.method).toBe("POST");
    expect(bodyOf(req!.init)).toEqual({ title: message.title, desp: message.text });
  });

  it("telegram：POST JSON {chat_id, text=标题+正文, 关预览}", () => {
    const req = buildNotifyRequest(telegramConfig, message);
    expect(req?.url).toBe(telegramConfig.webhookUrl);
    expect(bodyOf(req!.init)).toEqual({
      chat_id: telegramConfig.chatId,
      text: `${message.title}\n${message.text}`,
      disable_web_page_preview: true,
    });
  });

  it("URL 两端空白被裁剪", () => {
    const req = buildNotifyRequest({ ...serverchanConfig, webhookUrl: "  https://x.test/send  " }, message);
    expect(req?.url).toBe("https://x.test/send");
  });

  it("不修改入参 config 与 message", () => {
    const config = { ...telegramConfig };
    const msg = { ...message };
    buildNotifyRequest(config, msg);
    expect(config).toEqual(telegramConfig);
    expect(msg).toEqual(message);
  });
});
