/** @type {import('./_venera_.js')} */

/**
 * GoDa漫画 (G站漫画) —— Venera 漫画源（完全重写版 v2）
 *
 * ============================ 原站分析 ============================
 * 站点程序: Astro 静态站点 + 独立 v2 JSON API
 * 主域名:   https://godamh.com            （设置项 domains，可换域名）
 * API 域名:  https://{api}/api/v2          （设置项 api，默认 v2.apikk.top）
 * 图片 CDN:  https://{image}               （设置项 image，默认 c-nd3-1.6wm.top）
 * 分析依据:  _analysis/fixtures/goda/ 下 2026-09-11 的真实抓取夹具
 *            （home.html / manga_list.html / search_ship.html / detail.html /
 *              manga_get.json / chapter_getinfo.json；逐条见 manifest.jsonl）
 *
 * 1) 首页 /                Astro 输出；区块标题为 <h2>，其后跟一个
 *                           div.cardlist（grid）:
 *                            div.cardlist > div.pb-2 > a[href=/manga/<slug>]
 *                              > div.text-center > div.aspect-3-4 > img.card[src]
 *                              + h3.cardtitle（标题）
 *                           “近期更新”横滑: .slicarddiv > a.slicarda[href]
 *                              > img.slicardimg[src] + .slicardtitle
 *                           （同一部漫画可能重复出现，按 href 去重）
 * 2) 列表 /manga[/page/N]   结构同 cardlist 的 .pb-2；翻页控件:
 *                           button.abutton.text-small（数字按钮，最后一个为最大页；
 *                           省略号为 “...” 非数字，解析时过滤）
 *                           /manga-genre/{kr,cn,jp,hots,qita,ou-mei}、
 *                           /manga-tag/<token> 同样分页
 * 3) 搜索 /s/<kw>?page=N    结构同 .pb-2；关键词需 URL 编码
 * 4) 详情 /manga/<slug>     #mangachapters[data-mid]（漫画数字 id）
 *                           h1.text-xl（标题，含 <span> 状态: 連載中/已完結…）
 *                           div.text-small.py-1 > a[href^=/manga-author] > span（作者）
 *                           div.text-sm.py-1  > a[href^=/manga-genre]  > span（类型）
 *                           a[href^=/manga-tag] > span（标签，文本形如 “#冒险 ”）
 *                           封面: img.object-cover（回退: 正文首张 /manga/ 图）
 * 5) 章节接口 /api/v2/manga/get?mid={mid}&mode=all&t={ts}
 *                           返回 { data: { chapters: [ { id, attributes:{ title } } ] } }
 *                           章节 key = `${mid}@${id}`
 * 6) 阅读接口 /api/v2/chapter/getinfo?m={mid}&c={cid}
 *                           返回 { data: { info: { images: { images: "<混淆串>" } } } }
 *                           混淆串解码见 decodeChapterImages（移植自 keiyoushi）。
 *                           解码后为 [{ url }]，原站返回相对路径，需前缀 imageUrl。
 * ================================================================
 */

// ---------------------------------------------------------------------------
// 章节图片解码器 — 移植自 keiyoushi/extensions-source (PR #16898)
//
// /api/v2/chapter/getinfo 返回的 images 是混淆字符串而非普通数组:
//   去除 "J7r" 前缀 / "nQ" 后缀 → 按 "kD" 与 "W4s" 标记拆 3 段
//   → 重排为 段3+段1+段2 → 每隔一个 7 字符块反转
//   → 自定义字母表映射回标准 base64url → base64 解码 → UTF-8 JSON。
// ---------------------------------------------------------------------------
const STD = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const CUSTOM = "_-9876543210abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DECODE_PREFIX = "J7r";
const DECODE_MARKER1 = "kD";
const DECODE_MARKER2 = "W4s";
const DECODE_SUFFIX = "nQ";
const DECODE_GROUP = 7;

const DECODE_TABLE = new Array(128).fill(-1);
for (let i = 0; i < CUSTOM.length; i++) {
  DECODE_TABLE[CUSTOM.charCodeAt(i)] = STD.charCodeAt(i);
}

/** 纯 JS base64 解码（venera 运行时无 atob），返回字节字符串供 JSON.parse */
function decodeBase64(str) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  str = str.replace(/=+$/, "");
  let result = "";
  let i = 0;
  while (i < str.length) {
    const enc1 = chars.indexOf(str.charAt(i));
    const enc2 = chars.indexOf(str.charAt(i + 1));
    const enc3 = str.charAt(i + 2) ? chars.indexOf(str.charAt(i + 2)) : -1;
    const enc4 = str.charAt(i + 3) ? chars.indexOf(str.charAt(i + 3)) : -1;
    if (enc1 < 0 || enc2 < 0) throw "Invalid base64 character";
    result += String.fromCharCode((enc1 << 2) | (enc2 >> 4));
    if (enc3 >= 0) result += String.fromCharCode(((enc2 & 15) << 4) | (enc3 >> 2));
    if (enc4 >= 0) result += String.fromCharCode(((enc3 & 3) << 6) | enc4);
    i += 4;
  }
  return result;
}

function decodeChapterImages(input) {
  if (typeof input !== "string" || !input.startsWith(DECODE_PREFIX) || !input.endsWith(DECODE_SUFFIX)) {
    throw "未知的章节数据格式";
  }
  const body = input.substring(DECODE_PREFIX.length, input.length - DECODE_SUFFIX.length);
  const payloadLen = body.length - DECODE_MARKER1.length - DECODE_MARKER2.length;
  if (payloadLen <= 0) throw "未知的章节数据格式";

  const aLen = Math.floor(payloadLen / 3);
  const bLen = Math.floor((payloadLen - aLen) / 2);
  const cLen = payloadLen - aLen - bLen;

  const part1 = body.substring(0, bLen);
  const marker1 = body.substring(bLen, bLen + DECODE_MARKER1.length);
  const part2 = body.substring(bLen + DECODE_MARKER1.length, bLen + DECODE_MARKER1.length + cLen);
  const marker2 = body.substring(bLen + DECODE_MARKER1.length + cLen, bLen + DECODE_MARKER1.length + cLen + DECODE_MARKER2.length);
  const part3 = body.substring(bLen + DECODE_MARKER1.length + cLen + DECODE_MARKER2.length);

  if (marker1 !== DECODE_MARKER1 || marker2 !== DECODE_MARKER2 || part3.length !== aLen) {
    throw "未知的章节数据格式";
  }
  const reordered = part3 + part1 + part2;
  let unzigzagged = "";
  for (let i = 0, block = 0; i < reordered.length; i += DECODE_GROUP, block++) {
    const chunk = reordered.substring(i, Math.min(i + DECODE_GROUP, reordered.length));
    unzigzagged += (block % 2 === 1) ? chunk.split('').reverse().join('') : chunk;
  }
  let standard = "";
  for (let i = 0; i < unzigzagged.length; i++) {
    const code = unzigzagged.charCodeAt(i);
    const mapped = code < DECODE_TABLE.length ? DECODE_TABLE[code] : -1;
    if (mapped < 0) throw "无效的章节数据字符";
    standard += String.fromCharCode(mapped);
  }
  const standardBase64 = standard.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(decodeBase64(standardBase64));
}

const STATUS_WORDS = ["連載中", "已完結", "已完结", "完結", "連載", "连载", "休載"];

class Goda extends ComicSource {
  name = "GoDa漫画"
  key = "goda"
  version = "2.0.0"
  minAppVersion = "1.4.0"
  url = "https://cdn.jsdelivr.net/gh/senran-N/venera-configs@main/goda.js"

  settings = {
    domains: { title: "域名", type: "input", default: "godamh.com" },
    api: { title: "API域名", type: "input", default: "v2.apikk.top" },
    image: { title: "图片域名", type: "input", default: "c-nd3-1.6wm.top" },
  }

  get baseUrl() { return `https://${this.loadSetting("domains")}`; }
  get apiUrl() { return `https://${this.loadSetting("api")}/api/v2`; }
  get imageUrl() { return `https://${this.loadSetting("image")}`; }
  get headers() {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0",
      "Referer": this.baseUrl + "/",
    };
  }

  /** 相对地址补全为绝对地址（已是 http(s) 的保持不变） */
  _abs(u) {
    if (!u) return "";
    if (/^https?:\/\//i.test(u)) return u;
    return this.baseUrl + (u.startsWith("/") ? u : "/" + u);
  }

  /** 首页/列表/搜索统一的卡片解析: div.pb-2 > a > (img + h3.cardtitle) */
  parseComics(doc) {
    const seen = new Set();
    const result = [];
    for (let item of doc.querySelectorAll(".pb-2")) {
      const link = item.querySelector("a");
      const titleEl = item.querySelector("h3");
      const img = item.querySelector("img");
      if (!link || !titleEl || !img) continue;
      const href = link.attributes["href"];
      const src = img.attributes["src"] || img.attributes["data-src"];
      if (!href || !src) continue;
      if (seen.has(href)) continue;
      seen.add(href);
      result.push(new Comic({
        id: href,
        title: (titleEl.text || "").trim(),
        cover: this._abs(src),
      }));
    }
    return result;
  }

  /** “近期更新”横滑卡片: a.slicarda[href] > img + .slicardtitle */
  parseSlicards(doc) {
    const seen = new Set();
    const result = [];
    for (let item of doc.querySelectorAll(".slicarda")) {
      const href = item.attributes["href"] || (item.querySelector("a") || {}).attributes?.href;
      const img = item.querySelector("img");
      const titleEl = item.querySelector(".slicardtitle") || item.querySelector("h3");
      if (!href || !img || !titleEl) continue;
      const src = img.attributes["src"] || img.attributes["data-src"];
      if (!src || seen.has(href)) continue;
      seen.add(href);
      result.push(new Comic({ id: href, title: (titleEl.text || "").trim(), cover: this._abs(src) }));
    }
    return result;
  }

  /** 解析数字翻页按钮的最大页（过滤 “...” 等非数字按钮） */
  maxPageOf(doc) {
    let max = 1;
    for (let b of doc.querySelectorAll("button")) {
      const cls = (b.classNames || []).join(" ");
      if (!/text-small/.test(cls)) continue;
      const n = parseInt((b.text || "").replace(/[^0-9]/g, ""));
      if (!isNaN(n) && n > max) max = n;
    }
    return max;
  }

  /** 向上回溯若干兄弟节点寻找所属区块的 <h2> 标题 */
  _sectionTitle(cardlist) {
    let el = cardlist.previousElementSibling;
    let hops = 0;
    while (el && hops < 8) {
      const h2 = el.querySelector("h2");
      if (h2 && h2.text) return h2.text.trim();
      el = el.previousElementSibling;
      hops++;
    }
    const p = cardlist.parent;
    if (p) { const h2 = p.querySelector("h2"); if (h2 && h2.text) return h2.text.trim(); }
    return "";
  }

  explore = [
    {
      title: this.name,
      type: "multiPartPage",
      load: async () => {
        const res = await Network.get(this.baseUrl + "/", this.headers);
        if (res.status !== 200) throw `Invalid status code: ${res.status}`;
        const document = new HtmlDocument(res.body);
        const result = [];

        // 1) 近期更新（横滑）
        const recent = this.parseSlicards(document);
        if (recent.length) result.push({ title: "近期更新", comics: recent, viewMore: null });

        // 2) 各 cardlist 区块，标题取区块前最近的 h2
        for (let cardlist of document.querySelectorAll(".cardlist")) {
          const comics = this.parseComics(cardlist);
          if (!comics.length) continue;
          const title = this._sectionTitle(cardlist) || "更多";
          result.push({
            title,
            comics,
            viewMore: { page: "category", attributes: { category: title, param: "/manga" } },
          });
        }
        document.dispose();
        return result;
      },
    },
  ]

  category = {
    title: this.name,
    parts: [
      {
        name: "类型",
        type: "fixed",
        categories: ["全部", "韩漫", "热门漫画", "国漫", "其他", "日漫", "欧美"],
        itemType: "category",
        categoryParams: [
          "/manga", "/manga-genre/kr", "/manga-genre/hots", "/manga-genre/cn",
          "/manga-genre/qita", "/manga-genre/jp", "/manga-genre/ou-mei",
        ],
      },
      {
        name: "标签",
        type: "fixed",
        categories: [
          "复仇", "古风", "奇幻", "逆袭", "异能", "宅向", "穿越", "热血", "纯爱",
          "系统", "重生", "冒险", "灵异", "大女主", "剧情", "恋爱", "玄幻", "女神",
          "科幻", "魔幻", "推理", "猎奇", "治愈", "都市", "异形", "青春", "末日",
          "悬疑", "修仙", "战斗",
        ],
        itemType: "category",
        categoryParams: [
          "/manga-tag/fuchou", "/manga-tag/gufeng", "/manga-tag/qihuan", "/manga-tag/nixi",
          "/manga-tag/yineng", "/manga-tag/zhaixiang", "/manga-tag/chuanyue", "/manga-tag/rexue",
          "/manga-tag/chunai", "/manga-tag/xitong", "/manga-tag/zhongsheng", "/manga-tag/maoxian",
          "/manga-tag/lingyi", "/manga-tag/danvzhu", "/manga-tag/juqing", "/manga-tag/lianai",
          "/manga-tag/xuanhuan", "/manga-tag/nvshen", "/manga-tag/kehuan", "/manga-tag/mohuan",
          "/manga-tag/tuili", "/manga-tag/lieqi", "/manga-tag/zhiyu", "/manga-tag/doushi",
          "/manga-tag/yixing", "/manga-tag/qingchun", "/manga-tag/mori", "/manga-tag/xuanyi",
          "/manga-tag/xiuxian", "/manga-tag/zhandou",
        ],
      },
    ],
    enableRankingPage: false,
  }

  categoryComics = {
    load: async (category, params, options, page) => {
      const url = page <= 1 ? `${this.baseUrl}${params}` : `${this.baseUrl}${params}/page/${page}`;
      const res = await Network.get(url, this.headers);
      if (res.status !== 200) throw `Invalid status code: ${res.status}`;
      const document = new HtmlDocument(res.body);
      const comics = this.parseComics(document);
      const maxPage = this.maxPageOf(document);
      document.dispose();
      return { comics, maxPage };
    },
  }

  search = {
    load: async (keyword, options, page) => {
      const url = `${this.baseUrl}/s/${encodeURIComponent(keyword)}?page=${page}`;
      const res = await Network.get(url, this.headers);
      if (res.status !== 200) throw `Invalid status code: ${res.status}`;
      const document = new HtmlDocument(res.body);
      const comics = this.parseComics(document);
      const maxPage = this.maxPageOf(document);
      document.dispose();
      return { comics, maxPage };
    },
    enableTagsSuggestions: false,
  }

  comic = {
    onThumbnailLoad: (url) => ({ headers: this.headers }),

    loadInfo: async (id) => {
      const res = await Network.get(this._abs(id), this.headers);
      if (res.status !== 200) throw `Invalid status code: ${res.status}`;
      const document = new HtmlDocument(res.body);

      const titleEl = document.querySelector("h1.text-xl") || document.querySelector("h1");
      let title = titleEl ? (titleEl.text || "").replace(/\s+/g, " ").trim() : "";
      for (const w of STATUS_WORDS) {
        if (title.endsWith(w)) { title = title.slice(0, -w.length).trim(); break; }
      }

      let coverEl = document.querySelector("img.object-cover");
      if (!coverEl) {
        for (const img of document.querySelectorAll("img")) {
          const s = img.attributes["src"] || "";
          if (/6wm\.top|\/manga\//.test(s)) { coverEl = img; break; }
        }
      }
      const cover = coverEl ? this._abs(coverEl.attributes["src"] || "") : "";

      const descEl = document.querySelector("p.text-medium") || document.querySelector(".text-medium");
      let description = descEl ? (descEl.text || "").trim() : "";

      const tags = { "作者": [], "类型": [], "标签": [] };
      for (let a of document.querySelectorAll('a[href^="/manga-author"]')) {
        const t = (a.querySelector("span") ? a.querySelector("span").text : a.text || "").replace(/[,，]\s*$/, "").trim();
        if (t) tags["作者"].push(t);
      }
      for (let a of document.querySelectorAll('a[href^="/manga-genre"]')) {
        const t = (a.querySelector("span") ? a.querySelector("span").text : a.text || "").replace(/[,，]\s*$/, "").trim();
        if (t) tags["类型"].push(t);
      }
      for (let a of document.querySelectorAll('a[href^="/manga-tag"]')) {
        const t = (a.querySelector("span") ? a.querySelector("span").text : a.text || "")
          .replace(/\s+/g, "").replace(/^#/, "").trim();
        if (t) tags["标签"].push(t);
      }

      const mangaEl = document.querySelector("#mangachapters");
      const mangaId = mangaEl && mangaEl.attributes ? mangaEl.attributes["data-mid"] : null;
      if (!mangaId) throw "无法获取漫画ID";

      const chapters = new Map();
      const jsonRes = await Network.get(`${this.apiUrl}/manga/get?mid=${mangaId}&mode=all&t=${Date.now()}`, this.headers);
      if (jsonRes.status !== 200) throw `Invalid status code: ${jsonRes.status}`;
      let jsonData;
      try { jsonData = JSON.parse(jsonRes.body); } catch (e) { throw "章节数据解析失败"; }
      const chList = (jsonData && jsonData.data && jsonData.data.chapters) || [];
      for (let ch of chList) {
        if (ch && ch.id != null && ch.attributes && ch.attributes.title != null) {
          chapters.set(`${mangaId}@${ch.id}`, ch.attributes.title);
        }
      }
      if (!description && jsonData && jsonData.data && jsonData.data.desc) description = jsonData.data.desc;

      const recommend = [];
      for (let cardlist of document.querySelectorAll(".cardlist")) {
        for (const c of this.parseComics(cardlist)) {
          if (c.id && String(c.id) !== String(id)) recommend.push(c);
        }
      }

      document.dispose();
      return new ComicDetails({
        title,
        cover,
        description,
        tags,
        chapters,
        recommend,
        url: this._abs(id),
      });
    },

    loadEp: async (comicId, epId) => {
      if (!epId || !String(epId).includes("@")) throw "无效的章节ID";
      const ids = String(epId).split("@");
      const res = await Network.get(`${this.apiUrl}/chapter/getinfo?m=${ids[0]}&c=${ids[1]}`, this.headers);
      if (res.status !== 200) throw `Invalid status code: ${res.status}`;
      let jsonData;
      try { jsonData = JSON.parse(res.body); } catch (e) { throw "章节数据解析失败"; }
      if (!jsonData || !jsonData.data || !jsonData.data.info
        || !jsonData.data.info.images || jsonData.data.info.images.images == null) {
        throw "章节图片数据为空";
      }
      const imagesRaw = jsonData.data.info.images.images;
      let imagesList;
      if (typeof imagesRaw === "string") imagesList = decodeChapterImages(imagesRaw);
      else if (Array.isArray(imagesRaw)) imagesList = imagesRaw;
      else throw "未知的图片数据格式";

      const images = [];
      for (let i of imagesList) {
        if (i && i["url"]) {
          images.push(/^https?:\/\//i.test(i["url"]) ? i["url"] : this.imageUrl + i["url"]);
        }
      }
      if (!images.length) throw "章节图片为空";
      return { images };
    },

    enableTagsTranslate: false,
  }
}
