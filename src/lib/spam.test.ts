import { describe, expect, it } from "vitest";
import { checkSpam } from "./spam";

/**
 * 注意：重复内容检测用的是模块级 Map，跨用例共享。
 * 每个用例用独立的 ip / content，避免互相触发 duplicate 规则。
 */
let seq = 0;
function uniqueIp(): string {
  seq += 1;
  return `203.0.113.${seq}`;
}

describe("checkSpam 词表", () => {
  it("命中广告词判为 spam", () => {
    const v = checkSpam({ nickname: "访客", content: "加微信 领资料", ip: uniqueIp() });
    expect(v.spam).toBe(true);
    expect(v.reason).toBe("wordlist");
  });

  it("正常中文评论放行", () => {
    const v = checkSpam({ nickname: "小明", content: "这张光线很好，构图也舒服", ip: uniqueIp() });
    expect(v.spam).toBe(false);
  });
});

describe("checkSpam 链接规则", () => {
  it("两条以上链接判为 spam", () => {
    const v = checkSpam({
      nickname: "访客",
      content: "看看 https://a.example.com 还有 https://b.example.com",
      ip: uniqueIp(),
    });
    expect(v.spam).toBe(true);
    expect(v.reason).toBe("links");
  });

  it("单条链接但占比过高判为 spam", () => {
    const v = checkSpam({ nickname: "访客", content: "https://spam.example.com/very/long/path", ip: uniqueIp() });
    expect(v.spam).toBe(true);
    expect(v.reason).toBe("links");
  });

  it("昵称里塞链接判为 nickname（连续调用不受正则 lastIndex 影响）", () => {
    const first = checkSpam({ nickname: "https://ad.example.com", content: "内容甲", ip: uniqueIp() });
    const second = checkSpam({ nickname: "https://ad.example.com", content: "内容乙", ip: uniqueIp() });
    expect(first.reason).toBe("nickname");
    expect(second.reason).toBe("nickname");
  });

  it("昵称里塞联系方式判为 nickname", () => {
    const v = checkSpam({ nickname: "微信：abc12345", content: "内容丙", ip: uniqueIp() });
    expect(v.reason).toBe("nickname");
  });
});

describe("checkSpam 纯表情", () => {
  it("长串纯 emoji 判为 emoji-only", () => {
    const v = checkSpam({ nickname: "访客", content: "😀😀😀😀😀😀😀", ip: uniqueIp() });
    expect(v.spam).toBe(true);
    expect(v.reason).toBe("emoji-only");
  });

  it("纯中文不应被判为 emoji-only", () => {
    const v = checkSpam({ nickname: "小李", content: "山川湖海森林田野", ip: uniqueIp() });
    expect(v.spam).toBe(false);
  });

  it("短表情放行", () => {
    const v = checkSpam({ nickname: "访客", content: "😀😀", ip: uniqueIp() });
    expect(v.spam).toBe(false);
  });
});

describe("checkSpam 重复刷屏", () => {
  it("同 IP 同内容第二次判为 duplicate", () => {
    const ip = uniqueIp();
    const content = "重复测试内容甲乙丙";
    expect(checkSpam({ nickname: "访客A", content, ip }).spam).toBe(false);
    const again = checkSpam({ nickname: "访客A", content, ip });
    expect(again.spam).toBe(true);
    expect(again.reason).toBe("duplicate");
  });

  it("同昵称换 IP 发相同内容也算 duplicate", () => {
    const content = "跨 IP 重复内容丁戊己";
    expect(checkSpam({ nickname: "同名访客", content, ip: uniqueIp() }).spam).toBe(false);
    expect(checkSpam({ nickname: "同名访客", content, ip: uniqueIp() }).reason).toBe("duplicate");
  });
});
