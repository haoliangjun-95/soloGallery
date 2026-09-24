import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCommentNotifyMessage,
  buildNotifyRequest,
  NOTIFY_TEXT_MAX,
  parseNotifyProvider,
  sendNotify,
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
// 收编 M-1：用户可控文本（昵称：正文摘要）与站点侧链接分离——serverchan
// 分支把 text 包进围栏代码块（markdown 不渲染），url 在块外单独成行
const message = {
  title: "新评论：日落",
  text: "小明：好看！",
  url: "https://example.com/photo/abc",
};

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

  it("标题含「新评论」与照片标题，正文含昵称/内容，链接单独走 url 字段", () => {
    const msg = buildCommentNotifyMessage(input);
    expect(msg.title).toContain("新评论");
    expect(msg.title).toContain("日落");
    expect(msg.text).toBe("小明：拍得真好看");
    expect(msg.url).toBe("https://example.com/photo/abc");
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

  it("photoUrl 缺省时 url 为 undefined 且正文不含链接", () => {
    const msg = buildCommentNotifyMessage({
      nickname: input.nickname,
      content: input.content,
      photoTitle: input.photoTitle,
      moderated: input.moderated,
    });
    expect(msg.url).toBeUndefined();
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

  it("serverchan：POST JSON {title, desp=围栏代码块包裹用户文本 + 块外链接}", () => {
    const req = buildNotifyRequest(serverchanConfig, message);
    expect(req).not.toBeNull();
    expect(req?.url).toBe(serverchanConfig.webhookUrl);
    expect(req?.init.method).toBe("POST");
    expect(bodyOf(req!.init)).toEqual({
      title: message.title,
      desp: "```\n小明：好看！\n```\n\nhttps://example.com/photo/abc",
    });
  });

  it("serverchan：url 缺省时 desp 仅围栏块（无尾随空行）", () => {
    const req = buildNotifyRequest(serverchanConfig, { title: message.title, text: message.text });
    expect(bodyOf(req!.init)).toEqual({ title: message.title, desp: "```\n小明：好看！\n```" });
  });

  it("M-1 反例：用户文本的反引号被剥离——围栏不可被提前闭合，markdown 链接进不了可点击渲染", () => {
    const evil = { title: "t", text: "a```[点我](https://evil.com)```b" };
    const req = buildNotifyRequest(serverchanConfig, evil);
    const { desp } = bodyOf(req!.init) as { desp: string };
    expect(desp).toBe("```\na[点我](https://evil.com)b\n```");
    // 全文恰 2 个围栏（split 3 段）：用户自带 ``` 已剥离，无法逃逸代码块
    expect(desp.split("```").length).toBe(3);
  });

  it("telegram：POST JSON {chat_id, text=标题+正文+链接, 关预览}（无 parse_mode 即纯文本，无注入面）", () => {
    const req = buildNotifyRequest(telegramConfig, message);
    expect(req?.url).toBe(telegramConfig.webhookUrl);
    expect(bodyOf(req!.init)).toEqual({
      chat_id: telegramConfig.chatId,
      text: `${message.title}\n${message.text}\n${message.url}`,
      disable_web_page_preview: true,
    });
  });

  it("telegram：url 缺省时正文不含链接行", () => {
    const req = buildNotifyRequest(telegramConfig, { title: message.title, text: message.text });
    const { text } = bodyOf(req!.init) as { text: string };
    expect(text).toBe(`${message.title}\n${message.text}`);
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

/**
 * 收编 L-2：sendNotify 三条核心承诺直测——永不抛出（非 2xx / fetch reject /
 * buildNotifyRequest 自身抛错都 resolve）、配置残缺不触网、请求带超时 signal。
 */
describe("sendNotify", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("非 2xx 只 warn 不抛出", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendNotify(serverchanConfig, message)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("fetch reject（网络错误/超时）不抛出", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));
    await expect(sendNotify(serverchanConfig, message)).resolves.toBeUndefined();
  });

  it("配置残缺时不调用 fetch（静默关闭）", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await sendNotify({ ...serverchanConfig, webhookUrl: "" }, message);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("L-1 反例：buildNotifyRequest 抛 TypeError 也被吞下（永不抛出是结构保证）", async () => {
    vi.stubGlobal("fetch", vi.fn());
    // 非字符串 chatId 会让 .trim() 抛 TypeError——挪进 try 前会沿 async
    // reject 上抛，void 调用点即 unhandled rejection（Node 24 默认崩进程）
    const badConfig = {
      provider: "telegram",
      webhookUrl: "https://x.test/send",
      chatId: 42 as unknown as string,
    };
    await expect(sendNotify(badConfig, message)).resolves.toBeUndefined();
  });

  it("请求带 AbortSignal 超时（5s 旁路推送不拖住进程）", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    await sendNotify(serverchanConfig, message);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
