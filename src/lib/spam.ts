/**
 * 评论反垃圾：纯本地规则，不依赖外部服务。
 * 层级：词表 → 链接垃圾 → 重复刷屏（IP/内容维度的滑动窗口）。
 * 命中任一规则的评论会被静默标记为 SPAM（对外仍返回成功，不给攻击者反馈）。
 */

/** 默认词表：广告引流 / 色情 / 赌博 / 诈骗为主。按需增删即可。 */
const SPAM_WORDS: string[] = [
  // 广告引流
  "加微信", "加vx", "加v信", "加qq", "qq群", "私聊", "联系我", "免费领取", "点击链接", "优惠券",
  "兼职", "日结", "工资日结", "在家创业", "引流", "推广", "代刷", "刷单", "刷粉", "招代理",
  "一手资源", "货源", "代理加盟", "私我", "滴滴我", "威信", "vx号",
  // 赌博博彩
  "博彩", "赌博", "彩票计划", "六合彩", "时时彩", "押注", "下注返水", "稳赚", "包赢", "带赚",
  // 色情
  "约炮", "一夜情", "嫖", "援交", "裸聊", "裸体", "成人电影", "黄片", "肉棒", "自慰",
  // 诈骗及其他
  "发票代开", "代开发票", "办证", "刻章", "贷款包下", "无抵押贷款", "黑客接单", "追回资金",
  "网赚", "宝妈创业", "e邮宝", "流水单", "洗钱",
];

let wordRegex: RegExp | null = null;
function getWordRegex(): RegExp {
  if (!wordRegex) {
    const escaped = SPAM_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    wordRegex = new RegExp(escaped.join("|"), "i");
  }
  return wordRegex;
}

/** \u5e26 /g\uff1a\u7528\u4e8e match \u53d6\u51fa\u5168\u90e8\u94fe\u63a5 */
const URL_RE = /(https?:\/\/|www\.)[^\s]{2,}/gi;
/**
 * \u540c\u6a21\u5f0f\u7684\u65e0\u72b6\u6001\u526f\u672c\uff1a\u5e26 /g \u7684\u6b63\u5219 .test() \u4f1a\u63a8\u8fdb lastIndex\uff0c
 * \u590d\u7528\u540c\u4e00\u4e2a\u5bf9\u8c61\u505a\u5224\u5b9a\u4f1a\u51fa\u73b0\u300c\u9694\u4e00\u6b21\u624d\u547d\u4e2d\u300d\u7684\u6f0f\u5224\u3002
 */
const URL_TEST_RE = /(https?:\/\/|www\.)[^\s]{2,}/i;
/** \u7eaf\u8868\u60c5\u5224\u5b9a\u4e0d\u542b\u6c49\u5b57\u7c7b\uff1a\u628a\u4e2d\u6587\u7b97\u8fdb\u6765\u4f1a\u8ba9\u6b63\u5e38\u4e2d\u6587\u8bc4\u8bba\u88ab\u8bef\u5224\u4e3a\u300c\u7eaf\u8868\u60c5\u300d */
const EMOJI_ONLY_RE = /^[\p{Extended_Pictographic}\s\u200d\ufe0f]+$/u;

export interface SpamInput {
  nickname: string;
  content: string;
  ip: string;
}

export interface SpamVerdict {
  spam: boolean;
  reason?: string;
}

/** 滑动窗口的重复内容检测：同 IP 或同昵称在窗口期内发过相同（归一化）内容。 */
const recentContents = new Map<string, number[]>();
const DUP_WINDOW_MS = 10 * 60 * 1000;

function normalizeContent(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase().slice(0, 500);
}

function sawRecently(key: string): boolean {
  const now = Date.now();
  const list = (recentContents.get(key) ?? []).filter((t) => now - t < DUP_WINDOW_MS);
  recentContents.set(key, list);
  return list.length > 0;
}

function remember(key: string) {
  const list = recentContents.get(key) ?? [];
  list.push(Date.now());
  recentContents.set(key, list);
  if (recentContents.size > 5000) {
    for (const [k, v] of recentContents) {
      if (v.every((t) => Date.now() - t >= DUP_WINDOW_MS)) recentContents.delete(k);
    }
  }
}

export function checkSpam(input: SpamInput): SpamVerdict {
  const { nickname, content, ip } = input;
  const text = `${nickname} ${content}`;

  // 1) 词表
  if (getWordRegex().test(text)) return { spam: true, reason: "wordlist" };

  // 2) 链接垃圾：2 条以上链接，或正文里链接占比过高
  const urls = content.match(URL_RE) ?? [];
  if (urls.length >= 2) return { spam: true, reason: "links" };
  const urlChars = urls.reduce((n, u) => n + u.length, 0);
  if (urls.length >= 1 && content.length > 0 && urlChars / content.length > 0.3) {
    return { spam: true, reason: "links" };
  }
  // 昵称里塞链接/联系方式
  if (URL_TEST_RE.test(nickname) || /(?:微信|vx|v信|qq|tg|telegram)[:：\s]*[a-z0-9_-]{5,}/i.test(nickname)) {
    return { spam: true, reason: "nickname" };
  }

  // 3) 纯表情/无意义刷屏
  // EMOJI_ONLY_RE 已排除汉字与字母，无需再叠加反向判断
  if (content.length >= 6 && EMOJI_ONLY_RE.test(content)) {
    return { spam: true, reason: "emoji-only" };
  }

  // 4) 重复刷屏（同 IP 或同昵称，10 分钟内相同内容）
  const normalized = normalizeContent(content);
  if (normalized.length >= 2) {
    if (sawRecently(`ip:${ip}:${normalized}`) || sawRecently(`nick:${nickname}:${normalized}`)) {
      return { spam: true, reason: "duplicate" };
    }
    remember(`ip:${ip}:${normalized}`);
    remember(`nick:${nickname}:${normalized}`);
  }

  return { spam: false };
}
