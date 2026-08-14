class MH1234 extends ComicSource {
    // 统一请求头 (防封: 模拟真实浏览器, Referer 跟随域名设置)
    get webHeaders() {
      return {
        "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Referer": this.baseUrl + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      };
    }

    // name of the source
    name = "漫画1234"

    // unique id of the source
    key = "mh1234"

    version = "1.1.0"

    minAppVersion = "1.4.0"

    // update url
    url = "https://cdn.jsdelivr.net/gh/senran-N/venera-configs@main/mh1234.js"

    settings = {
        domains: {
            title: "域名",
            type: "input",
            default: "wmh1234.com"
        }
    }

    // 新版站点使用移动端域名 m.xxx.com (b.xxx.com 已失效)
    get baseUrl() {
        let domain = this.loadSetting('domains') || this.settings.domains.default;
        domain = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
        if (domain.indexOf("://") < 0 && domain.indexOf("m.") !== 0 && domain.indexOf("www.") !== 0 && !domain.startsWith("reader.")) {
            domain = "m." + domain;
        }
        return `https://${domain}`;
    }

    // 通用的卡片解析 (首页/搜索/分类通用)
    parseComicCard(elm) {
        const link = elm.querySelector("a.comic-card__link");
        if (!link) return null;
        const href = link.attributes["href"] || "";
        const m = href.match(/\/(\d+)\.html/);
        if (!m) return null;
        const img = elm.querySelector("img.comic-card__image");
        let cover = "";
        if (img) cover = (img.attributes["data-src"] || img.attributes["src"] || "").trim();
        // 标题优先取 img alt
        let title = "";
        if (img && img.attributes["alt"]) title = img.attributes["alt"].trim();
        if (!title) {
            const t = elm.querySelector(".comic-card__title");
            if (t) title = t.text.trim();
        }
        let subTitle = "";
        const ch = elm.querySelector(".comic-card__chapter");
        if (ch) subTitle = ch.text.trim();
        return new Comic({
            id: m[1],
            title,
            cover,
            subTitle,
            description: subTitle,
        });
    }

    // 解析漫画网格 (.comic-grid > article.comic-card)
    parseComicGrid(doc) {
        const comics = [];
        const cards = doc.querySelectorAll("article.comic-card");
        for (const card of cards) {
            const c = this.parseComicCard(card);
            if (c) comics.push(c);
        }
        return comics;
    }

    // explore page list
    explore = [{
        title: "漫画1234",
        type: "singlePageWithMultiPart",
        load: async () => {
            const result = {};
            const res = await Network.get(this.baseUrl, this.webHeaders);
            if (res.status !== 200) {
                throw `Invalid status code: ${res.status}`;
            }
            const doc = new HtmlDocument(res.body);
            // 每个板块: section.comic-section > h2.section-title + .comic-grid
            const sections = doc.querySelectorAll("section.comic-section");
            if (sections.length > 0) {
                for (const sec of sections) {
                    const titleEl = sec.querySelector("h2.section-title");
                    const title = titleEl ? titleEl.text.trim() : "";
                    const comics = [];
                    const cards = sec.querySelectorAll("article.comic-card");
                    for (const card of cards) {
                        const c = this.parseComicCard(card);
                        if (c) comics.push(c);
                    }
                    if (comics.length > 0 && title) {
                        result[title] = comics;
                    }
                }
                return result;
            }
            // 兜底: 整页卡片归为一个板块
            const all = doc.querySelectorAll("article.comic-card");
            const comics = [];
            for (const card of all) {
                const c = this.parseComicCard(card);
                if (c) comics.push(c);
            }
            if (comics.length > 0) result["漫画1234"] = comics;
            return result;
        }
    }];

    // categories
    category = {
        /// title of the category page, used to identify the page, it should be unique
        title: "漫画1234",
        parts: [
            {
                name: "题材",
                type: "fixed",
                categories: [
                    "全部", "少年热血", "武侠格斗", "科幻魔幻", "竞技体育", "爆笑喜剧", "侦探推理", "恐怖灵异", "耽美人生",
                    "少女爱情", "恋爱生活", "生活漫画", "战争漫画", "故事漫画", "其他漫画", "爱情", "唯美", "武侠", "玄幻",
                    "后宫", "治愈", "励志", "古风", "校园", "虐心", "魔幻", "冒险", "欢乐向", "节操", "悬疑", "历史", "职场",
                    "神鬼", "明星", "穿越", "百合", "西方魔幻", "纯爱", "音乐舞蹈", "轻小说", "侦探", "伪娘", "仙侠", "四格",
                    "剧情", "萌系", "东方", "性转换", "宅系", "美食", "脑洞", "惊险", "爆笑", "都市", "蔷薇", "恋爱", "格斗",
                    "科幻", "魔法", "奇幻", "热血", "其他", "搞笑", "生活", "恐怖", "架空", "竞技", "战争", "搞笑喜剧", "青春",
                    "浪漫", "爽流", "神话", "轻松", "日常", "家庭", "婚姻", "动作", "战斗", "异能", "内涵", "同人", "惊奇",
                    "正剧", "推理", "宠物", "温馨", "异世界", "颜艺", "惊悚", "舰娘","机战", "彩虹", "耽美", "轻松搞笑",
                    "修真恋爱架空", "复仇", "霸总", "段子", "逆袭", "烧脑", "娱乐圈", "纠结", "感动", "豪门", "体育", "机甲",
                    "末世", "灵异", "僵尸", "宫廷", "权谋", "未来", "科技", "商战", "乡村", "震撼", "游戏", "重口味", "血腥",
                    "逗比", "丧尸", "神魔", "修真", "社会", "召唤兽", "装逼", "新作", "漫改", "真人", "运动", "高智商", "悬疑推理",
                    "机智", "史诗", "萝莉", "宫斗", "御姐", "恶搞", "精品", "日更", "小说改编", "防疫", "吸血", "暗黑", "总裁",
                    "重生", "大女主", "系统", "神仙", "末日", "怪物", "妖怪", "修仙", "宅斗", "神豪", "高甜", "电竞", "豪快",
                    "猎奇", "多世界", "性转", "少女", "改编", "女生", "乙女", "男生", "兄弟情", "智斗", "少男", "连载", "奇幻冒险",
                    "古风穿越", "浪漫爱情", "古装", "幽默搞笑", "偶像", "小僵尸", "BL", "少年", "橘味", "情感", "经典",
                    "腹黑", "都市大女主", "致郁", "美少女", "少儿", "暖萌", "长条", "限制级", "知音漫客", "氪金", "独家",
                    "亲情", "现代", "武侠仙侠", "西幻", "超级英雄", "女神", "幻想", "欧风", "养成", "动作冒险", "GL", "橘调",
                    "悬疑灵异", "古代宫廷", "欧式宫廷", "游戏竞技", "橘系", "奇幻爱情", "架空世界", "ゆり", "福瑞", "秀吉", "现代言情",
                    "古代言情", "豪门总裁", "现言萌宝", "玄幻言情", "虐渣", "团宠", "古言萌宝", "现言甜宠", "古言脑洞", "AA", "金手指",
                    "玄幻脑洞", "都市脑洞", "甜宠", "伦理", "生存", "TL", "悬疑脑洞", "黑暗", "独特", "成长", "幻想言情", "直播",
                    "游戏体育", "现言脑洞", "音乐", "双男主", "迪化", "LGBTQ+", "正能量", "军事", "ABO", "悬疑恐怖",
                    "玄幻科幻", "投稿", "种田", "经营", "反套路", "无节操", "强强", "克苏鲁", "无敌流", "冒险热血", "畅销",
                    "大人系", "宅向", "萌娃", "宠兽", "异形", "撒糖", "诡异", "言情", "西方", "滑稽搞笑", "同居", "人外",
                    "白切黑", "并肩作战", "救赎", "戏精", "美强惨", "非人类", "原创", "黑白漫", "无限流",
                    "升级", "爽", "轻橘", "女帝", "偏执", "自由", "星际", "可盐可甜", "反差萌", "聪颖", "智商在线",
                    "倔强", "狼人", "欢喜冤家", "吸血鬼", "萌宠", "学校", "台湾作品", "彩色", "武术", "短篇", "契约", "魔王",
                    "无敌", "美女", "暧昧", "网游", "宅男", "追逐梦想", "冒险奇幻", "疯批", "中二", "召唤", "法宝", "钓系", "鬼怪",
                    "占有欲", "阳光", "元气", "强制爱", "黑道", "马甲", "阴郁", "忧郁", "哲理", "病娇", "喜剧", "江湖恩怨",
                    "相爱相杀", "萌", "SM", "精选", "生子", "年下", "18+限制", "日久生情", "梦想", "多攻", "竹马", "骨科", "gnbq"
                  ],
                itemType: "category",
                categoryParams: [
                    "", "shaonianrexue", "wuxiagedou", "kehuanmohuan", "jingjitiyu", "baoxiaoxiju", "zhentantuili", "kongbulingyi",
                    "danmeirensheng", "shaonvaiqing", "lianaishenghuo", "shenghuomanhua", "zhanzhengmanhua", "gushimanhua",
                    "qitamanhua", "aiqing", "weimei", "wuxia", "xuanhuan", "hougong", "zhiyu", "lizhi", "gufeng", "xiaoyuan", "nuexin",
                    "mohuan", "maoxian", "huanlexiang", "jiecao", "xuanyi", "lishi", "zhichang", "shengui", "mingxing", "chuanyue",
                    "baihe", "xifangmohuan", "chunai", "yinyuewudao", "qingxiaoshuo", "zhentan", "weiniang", "xianxia", "sige", "juqing",
                    "mengxi", "dongfang", "xingzhuanhuan", "zhaixi", "meishi", "naodong", "jingxian", "baoxiao", "dushi", "qiangwei",
                    "lianai", "gedou", "kehuan", "mofa", "qihuan", "rexue", "qita", "gaoxiao", "shenghuo", "kongbu", "jiakong", "jingji",
                    "zhanzheng", "gaoxiaoxiju", "qingchun", "langman", "shuangliu", "shenhua", "qingsong", "richang", "jiating", "hunyin",
                    "dongzuo", "zhandou", "yineng", "neihan", "tongren", "jingqi", "zhengju", "tuili", "chongwu", "wenxin", "yishijie",
                    "yanyi", "jingsong", "jianniang", "jizhan", "caihong", "danmei", "qingsonggaoxiao", "xiuzhenlianaijiakong", "fuchou",
                    "bazong", "duanzi", "nixi", "shaonao", "yulequan", "jiujie", "gandong", "haomen", "tiyu", "jijia", "moshi", "lingyi",
                    "jiangshi", "gongting", "quanmou", "weilai", "keji", "shangzhan", "xiangcun", "zhenhan", "youxi",
                    "zhongkouwei", "xuexing", "doubi", "sangshi", "shenmo", "xiuzhen", "shehui", "zhaohuanshou", "zhuangbi",
                    "xinzuo", "mangai", "zhenren", "yundong", "gaozhishang", "xuanyituili", "jizhi", "shishi", "luoli","gongdou",
                    "yujie", "egao", "jingpin", "rigeng", "xiaoshuogaibian", "fangyi", "xixie", "anhei", "zongcai", "zhongsheng",
                    "danvzhu", "xitong", "shenxian", "mori", "guaiwu", "yaoguai", "xiuxian", "zhaidou", "shenhao", "gaotian",
                    "dianjing", "haokuai", "lieqi", "duoshijie", "xingzhuan", "shaonv", "gaibian", "nvsheng", "yinv", "nansheng",
                    "xiongdiqing", "zhidou", "shaonan", "lianzai", "qihuanmaoxian", "gufengchuanyue", "langmanaiqing", "guzhuang",
                    "youmogaoxiao", "ouxiang", "xiaojiangshi", "BL", "shaonian", "juwei", "qinggan", "jingdian",
                    "fuhei", "dushidanvzhu", "zhiyu2", "meishaonv", "shaoer", "nuanmeng", "changtiao", "xianzhiji", "zhiyinmanke",
                    "kejin", "dujia", "qinqing", "xiandai", "wuxiaxianxia", "xihuan", "chaojiyingxiong", "nvshen", "huanxiang",
                    "oufeng", "yangcheng", "dongzuomaoxian", "GL", "judiao", "xuanyilingyi", "gudaigongting", "oushigongting",
                    "youxijingji", "juxi", "qihuanaiqing", "jiakongshijie", "unknown", "furui", "xiuji", "xiandaiyanqing", "gudaiyanqing",
                    "haomenzongcai", "xianyanmengbao", "xuanhuanyanqing", "nuezha", "tuanchong", "guyanmengbao", "xianyantianchong",
                    "guyannaodong", "AA", "jinshouzhi", "xuanhuannaodong", "dushinaodong", "tianchong", "lunli", "shengcun", "TL",
                    "xuanyinaodong", "heian", "dute", "chengzhang", "huanxiangyanqing", "zhibo", "youxitiyu", "xianyannaodong",
                    "yinyue", "shuangnanzhu", "dihua", "LGBTQ", "zhengnengliang", "junshi", "ABO", "xuanyikongbu", "xuanhuankehuan", "tougao",
                    "zhongtian", "jingying", "fantaolu", "wujiecao", "qiangqiang", "kesulu", "wudiliu", "maoxianrexue", "changxiao",
                    "darenxi", "zhaixiang", "mengwa", "chongshou", "yixing", "satang", "guiyi", "yanqing", "xifang", "huajigaoxiao", "tongju",
                    "renwai", "baiqiehei", "bingjianzuozhan", "jiushu", "xijing", "meiqiangcan", "feirenlei", "yuanchuang", "heibaiman",
                    "wuxianliu", "shengji", "shuang", "qingju", "nvdi", "pianzhi", "ziyou", "xingji", "keyanketian", "fanchameng", "congying",
                    "zhishangzaixian", "juejiang", "langren", "huanxiyuanjia", "xixiegui", "mengchong", "xuexiao", "taiwanzuopin", "caise",
                    "wushu", "duanpian", "qiyue", "mowang", "wudi", "meinv", "aimei", "wangyou", "zhainan", "zhuizhumengxiang", "maoxianqihuan",
                    "fengpi", "zhonger", "zhaohuan", "fabao", "diaoxi", "guiguai", "zhanyouyu", "yangguang", "yuanqi", "qiangzhiai", "heidao",
                    "majia", "yinyu", "youyu", "zheli", "bingjiao", "xiju", "jianghuenyuan", "xiangaixiangsha", "meng", "SM", "jingxuan", "shengzi",
                    "nianxia", "18xianzhi", "rijiushengqing", "mengxiang", "duogong", "zhuma", "guke", "gnbq"
                ],
            }
        ],
        // enable ranking page
        enableRankingPage: false,
    }

    // 分类漫画加载: 站点分类改为 /category/ 与 /category/tags/{id},
    // 为兼容旧参数列表, 统一使用站内分类列表(全部漫画)并按页加载
    categoryComics = {
        load: async (category, params, options, page) => {
            let url;
            if (params && params !== "") {
                url = `${this.baseUrl}/category/tags/${encodeURIComponent(params)}`;
            } else {
                url = page <= 1 ? `${this.baseUrl}/category/` : `${this.baseUrl}/category/page/${page}`;
            }
            const res = await Network.get(url, this.webHeaders);
            if (res.status !== 200) {
                throw `Invalid status code: ${res.status}`;
            }
            const doc = new HtmlDocument(res.body);
            const comics = this.parseComicGrid(doc);
            // 尝试解析最大页数
            let maxPage = page;
            const pageLinks = doc.querySelectorAll("a");
            for (const a of pageLinks) {
                const href = (a.attributes["href"] || "").match(/page\/(\d+)/);
                if (href) {
                    const n = parseInt(href[1], 10);
                    if (n > maxPage) maxPage = n;
                }
            }
            return { comics, maxPage };
        },
        optionLoader: async (category, params) => {
            return [];
        }
    }

    /// search related
    search = {
        load: async (keyword, options, page) => {
            const res = await Network.get(`${this.baseUrl}/search/?keywords=${encodeURIComponent(keyword)}&page=${page}`, this.webHeaders);
            if (res.status !== 200) {
                throw `Invalid status code: ${res.status}`;
            }
            const doc = new HtmlDocument(res.body);
            const comics = this.parseComicGrid(doc);
            return {
                comics,
                maxPage: 1
            };
        },

        // provide options for search
        optionList: [],

        // enable tags suggestions
        enableTagsSuggestions: false,
    }

    /// single comic related
    comic = {
        loadInfo: async (id) => {
            const res = await Network.get(`${this.baseUrl}/comic/${id}.html`, this.webHeaders);
            if (res.status !== 200) {
                throw `Invalid status code: ${res.status}`;
            }
            const doc = new HtmlDocument(res.body);

            // 标题
            let title = "";
            const h1 = doc.querySelector("h1.comic-hero__title");
            if (h1) {
                title = h1.text.trim().replace(/漫画$/, "");
            }
            if (!title) {
                const coverImg = doc.querySelector(".comic-hero__cover img");
                if (coverImg && coverImg.attributes["alt"]) title = coverImg.attributes["alt"].trim();
            }

            // 封面
            let cover = "";
            const coverEl = doc.querySelector(".comic-hero__cover img");
            if (coverEl) cover = (coverEl.attributes["src"] || coverEl.attributes["data-src"] || "").trim();

            // 简介
            let description = "";
            const descEl = doc.querySelector("#comicDesc");
            if (descEl) description = descEl.text.trim();

            // 作者 & 标签
            let author = "";
            const tags = [];
            const metaItems = doc.querySelectorAll(".comic-hero__meta .meta-item");
            if (metaItems.length > 0) {
                author = metaItems[0] ? metaItems[0].text.trim() : "";
                for (let i = 1; i < metaItems.length; i++) {
                    const t = metaItems[i].text.trim();
                    if (t) tags.push(t);
                }
            }

            // 状态
            let status = "";
            const statItems = doc.querySelectorAll(".comic-hero__stats .stat-item");
            for (const s of statItems) {
                const label = s.querySelector(".stat-label");
                if (label && label.text.includes("状态")) {
                    const val = s.querySelector(".stat-value");
                    if (val) status = val.text.trim();
                }
            }

            // 章节
            const chapters = {};
            const chapterItems = doc.querySelectorAll(".chapter-list a.chapter-item");
            for (const a of chapterItems) {
                const href = a.attributes["href"] || "";
                const m = href.match(/\/go\/([^\s"']+)/);
                if (m) {
                    const token = m[1];
                    const span = a.querySelector(".chapter-title");
                    const name = span ? span.text.trim() : token;
                    // dedupe 同名章节 (网页里可能重复)
                    if (!(token in chapters)) {
                        chapters[token] = name;
                    }
                }
            }

            // 推荐
            const recommend = this.parseComicGrid(doc).filter(c => c.id !== id).slice(0, 12);

            return {
                title,
                cover,
                description,
                tags: {
                    "作者": [author],
                    "状态": [status],
                    "标签": tags,
                },
                chapters: chapters,
                recommend,
                url: `${this.baseUrl}/comic/${id}.html`,
            };
        },

        loadEp: async (comicId, epId) => {
            // epId 为章节 token (base64: {comicId}-{chapterId}-{hash})
            // 1. 请求 /go/{token}, 从 JS 跳转中拿到阅读器地址
            const images = [];
            let readerUrl = "";
            let body = "";
            try {
                const goRes = await Network.get(`${this.baseUrl}/go/${epId}`, this.webHeaders);
                body = goRes.body || "";
            } catch (e) {
                throw `获取章节失败: ${e.message || e}`;
            }
            const locMatch = (body || "").match(/location\.(?:replace|href)\s*=\s*["']([^"']+)["']/);
            if (locMatch) {
                readerUrl = locMatch[1];
            }
            // 兜底: 直接构造阅读器地址
            if (!readerUrl) {
                readerUrl = `https://reader.hqread.cc/r/${epId}`;
            }

            const readerHeaders = Object.assign({}, this.webHeaders);
            // 阅读器与主站不同域, 需要独立 Referer
            readerHeaders["Referer"] = `${this.baseUrl}/go/${epId}`;
            let readerBody = "";
            try {
                const readerRes = await Network.get(readerUrl, readerHeaders);
                if (readerRes.status !== 200) {
                    throw `阅读器返回状态码: ${readerRes.status}`;
                }
                readerBody = readerRes.body || "";
            } catch (e) {
                throw `获取阅读器失败: ${e.message || e}`;
            }

            // 2. 解析图片 data-src
            const doc = new HtmlDocument(readerBody);
            const imgNodes = doc.querySelectorAll("img.reader-image");
            if (imgNodes.length === 0) {
                // 兜底: 任意带 data-src 的 img
                const fallback = doc.querySelectorAll("img[data-src]");
                for (const img of fallback) images.push(img.attributes["data-src"]);
            } else {
                for (const img of imgNodes) {
                    const src = img.attributes["data-src"] || img.attributes["src"];
                    if (src) images.push(src);
                }
            }
            return { images };
        },

        // enable tags translate
        enableTagsTranslate: false,
    }
}
