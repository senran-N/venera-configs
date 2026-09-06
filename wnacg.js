class Wnacg extends ComicSource {
  // 统一请求头 (防封: 模拟真实浏览器, Referer 跟随域名设置)
  get webHeaders() {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Referer": this.baseUrl + "/",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    };
  }

    // Note: The fields which are marked as [Optional] should be removed if not used

    // name of the source
    name = "紳士漫畫"

    // unique id of the source
    key = "wnacg"

    version = "1.0.13"

    minAppVersion = "1.0.0"

    // update url
    url = "https://cdn.jsdelivr.net/gh/senran-N/venera-configs@main/wnacg.js"

    static domains = [];

    get baseUrl() {
        let selection = this.loadSetting('domainSelection')
        if (selection === undefined || selection === null) selection = 0
        selection = parseInt(selection)

        if (selection === 0) {
            // 选择自定义域名
            let domain0 = this.loadSetting('domain0')
            if (!domain0 || domain0.trim() === '') {
                throw 'Custom domain is not set'
            }
            return `https://${domain0.trim()}`
        } else {
            // 选择获取的域名 (Domain 1-3)
            let index = selection - 1
            if (index >= Wnacg.domains.length) {
                throw 'Selected domain is unavailable'
            }
            return `https://${Wnacg.domains[index]}`
        }
    }

    overwriteDomains(domains) {
        if (domains.length != 0) Wnacg.domains = domains
    }

    // [Optional] account related
    account = {
        /**
         * login, return any value to indicate success
         * @param account {string}
         * @param pwd {string}
         * @returns {Promise<any>}
         */
        login: async (account, pwd) => {
            let res = await Network.post(
                `${this.baseUrl}/users-check_login.html`,
                {
                    'content-type': 'application/x-www-form-urlencoded'
                },
                `normal=1&login_name=${encodeURIComponent(account)}&login_pass=${encodeURIComponent(pwd)}&remember_pass=1`
            )
            if (res.status !== 200) {
                throw 'Login failed'
            }
            let json = JSON.parse(res.body)
            if (json['html'].includes('登錄成功')) {
                return 'ok'
            }
            throw 'Login failed'
        },

        /**
         * logout function, clear account related data
         */
        logout: () => {
            Network.deleteCookies(this.baseUrl)
        },

        // {string?} - register url
        registerWebsite: "https://www.wnacg.com/users-reg.html"
    }

    async init() {
        if (this.loadSetting('refreshDomainsOnStart')) await this.refreshDomains(false)
    }

    /**
     * 刷新域名列表
     * @param showConfirmDialog {boolean}
     */
    async refreshDomains(showConfirmDialog) {
        let url = "https://wn01.link/"
        let title = ""
        let message = ""
        let domains = []

        try {
            let res = await fetch(url)
            if (res.status == 200) {
                let html = await res.text()
                let document = new HtmlDocument(html)
                // 提取所有链接
                let links = document.querySelectorAll("a[href]")
                let seenDomains = new Set()

                for (let link of links) {
                    let href = link.attributes["href"]
                    if (!href) continue

                    // 提取域名（支持 http:// 和 https://）
                    let match = href.match(/^https?:\/\/([^\/]+)/)
                    if (match) {
                        let domain = match[1]
                        // 只提取有效的域名，排除 wn01.link 自身和其他无关链接
                        if (domain &&
                            domain.includes(".") &&
                            !domain.includes("wn01.link") &&
                            !domain.includes("google.cn") &&
                            !domain.includes("cdn-cgi") &&
                            !seenDomains.has(domain)) {
                            domains.push(domain)
                            seenDomains.add(domain)
                        }
                    }
                }
                document.dispose()

                if (domains.length > 0) {
                    title = "Update Success"
                    message = "Fetched: \n\n"
                }
            }
        } catch (e) {
            // 获取失败，使用自定义域名
        }

        if (domains.length == 0) {
            title = "Update Failed"
            message = "Using Custom: \n\n"
            domains = Wnacg.domains
        }

        for (let i = 0; i < domains.length; i++) {
            message = message + `URL ${i + 1}: ${domains[i]}\n`
        }
        message = message + `\n Total: ${domains.length} URLs\n\n Re-enter page to refresh`

        if (showConfirmDialog) {
            UI.showDialog(
                title,
                message,
                [
                    {
                        text: "Cancel",
                        callback: () => { }
                    },
                    {
                        text: "Apply",
                        callback: () => this.overwriteDomains(domains)
                    }
                ]
            )
        } else {
            this.overwriteDomains(domains)
        }
    }

    parseComic(c) {
        // c 通常为 li.gallary_item；当部分解析器丢弃 li 结构时，
        // 也可传入 div.pic_box 元素。这里兼容两种输入。
        let box, link, img
        if (c.localName === "div" && (c.classNames || []).indexOf("pic_box") >= 0) {
            box = c
            link = box.querySelector("a")
            img = link ? link.querySelector("img") : null
        } else {
            box = c.querySelector ? c.querySelector("div.pic_box") : null
            link = box ? box.querySelector("a") : null
            img = link ? link.querySelector("img") : null
        }
        let href = link && link.attributes ? link.attributes["href"] : null
        let id = this.extractAid(href)
        if (!id) throw "Invalid comic id"
        let image = img && img.attributes ? img.attributes["src"] : null
        image = this.normalizeImageUrl(image);
        // 标题: 优先取 info 块文本; 若解析器丢弃了 info 块, 回退到 <a> 的 title 属性
        // 搜索页 title 属性内含 <em> 高亮标签, 需 stripHtml
        let nameEl = c.querySelector ? c.querySelector("div.info > div.title > a") : null
        let name = nameEl ? nameEl.text : null
        if (!name) {
            let t = link && link.attributes ? link.attributes["title"] : null
            name = t || (img && img.attributes ? img.attributes["alt"] : null)
        }
        name = this.stripHtml(name)
        let info = ""
        let infoEl = c.querySelector ? c.querySelector("div.info > div.info_col") : null
        if (infoEl) {
            info = infoEl.text.trim()
            info = info.replaceAll('\n', '').replaceAll('\t', '')
        }
        return new Comic({
            id: id,
            title: name,
            cover: image,
            description: info,
        })
    }

    // 全局兜底解析: 某些 HTML 解析器会把首页区块容器丢弃, 但保留叶子 div.pic_box。
    // 这种情况下按每个 pic_box 直接构建 Comic, 归入单个分区。
    parseComicsGlobal(document) {
        let anchors = document.querySelectorAll("div.pic_box > a")
        let out = []
        for (let a of anchors) {
            try {
                let href = a.attributes["href"]
                if (!href) continue
                let id = RegExp("(?<=-aid-)[0-9]+").exec(href)
                if (!id) continue
                let img = a.querySelector("img")
                let image = img && img.attributes ? img.attributes["src"] : ""
                let name = a.attributes["title"] || (img && img.attributes ? img.attributes["alt"] : "")
                out.push(new Comic({
                    id: id[0],
                    title: this.stripHtml(name),
                    cover: this.normalizeImageUrl(image),
                    description: "",
                }))
            } catch (e) { /* skip */ }
        }
        return out
    }

    // 原站图片多为协议相对 URL, 且详情封面会出现 //// 四斜杠, 这里统一归一化为 https://
    normalizeImageUrl(src) {
        if (!src) return ""
        src = String(src).trim()
        if (src.startsWith("http://") || src.startsWith("https://")) {
            return src.replace(/^http:\/\//, "https://").replace(/^https:\/\/\/+/, "https://")
        }
        // 去掉前导斜杠后统一补 https://
        src = src.replace(/^\/+/, "")
        return "https://" + src
    }

    stripHtml(s) {
        if (!s) return ""
        return String(s).replace(/<[^>]*>/g, "").trim()
    }

    extractAid(href) {
        if (!href) return null
        let m = RegExp("(?<=-aid-)[0-9]+").exec(href)
        return m ? m[0] : null
    }

    // 分类/标签/更新列表共用解析 (原站 MeiuPic 2.2.0 通用结构)
    parseListPage(document) {
        let comicElements = document.querySelectorAll("div.grid div.gallary_wrap > ul.cc > li")
        if (comicElements.length === 0) {
            comicElements = document.querySelectorAll("li.gallary_item")
        }
        let comics = []
        for (let comicElement of comicElements) {
            try {
                comics.push(this.parseComic(comicElement))
            } catch (e) { /* 跳过损坏条目 */ }
        }
        // 分页: 取 paginator 内最后一个纯数字链接, 无则为 1
        let pages = 1
        let pagesLink = document.querySelectorAll("div.f_left.paginator > a")
        if (pagesLink.length > 0) {
            for (let i = pagesLink.length - 1; i >= 0; i--) {
                let n = Number((pagesLink[i].text || "").trim())
                if (!Number.isNaN(n) && n > 0) {
                    pages = n
                    break
                }
            }
        }
        return { comics, maxPage: pages }
    }

    // 统一构建分类 URL (原站规律, 实测):
    // 更新: /albums.html -> /albums-index-page-N.html
    // 分类: /albums-index-cate-5.html -> /albums-index-page-N-cate-5.html
    // 标签: /albums-index-tag-XXX.html -> /albums-index-page-N-tag-ENCODED.html
    buildCategoryUrl(param, page) {
        param = (param || "/albums.html").trim()
        if (!param.startsWith("/")) param = "/" + param
        if (!page || page <= 1) return this.baseUrl + param
        // 标签页: tag 部分必须 percent-encode, 否则翻页 404
        let tagMatch = param.match(/^(.*-tag-)(.+?)(\.html)$/)
        if (tagMatch) {
            let raw = tagMatch[2]
            try { raw = decodeURIComponent(raw) } catch (e) { /* 已是原文 */ }
            return this.baseUrl + `/albums-index-page-${page}-tag-${encodeURIComponent(raw)}.html`
        }
        let cateMatch = param.match(/-cate-(\d+)\.html$/)
        if (cateMatch) {
            return this.baseUrl + `/albums-index-page-${page}-cate-${cateMatch[1]}.html`
        }
        if (param === "/albums.html" || param === "/albums-index.html") {
            return this.baseUrl + `/albums-index-page-${page}.html`
        }
        // 兜底: 已带 page 的 param 直接替换页码, 否则拼到 albums- 后
        if (param.includes("-page-")) {
            return this.baseUrl + param.replace(/-page-\d+/, `-page-${page}`)
        }
        if (param.includes("albums-")) {
            let lr = param.split("albums-")
            return `${this.baseUrl}${lr[0]}albums-index-page-${page}-${lr[1].replace(/^-/, "")}`
        }
        return this.baseUrl + param
    }

    buildRankingUrl(option, page) {
        option = (option || "week").trim()
        if (!["day", "week", "month", "year"].includes(option)) option = "week"
        if (!page || page <= 1) {
            return `${this.baseUrl}/albums-favorite_ranking-type-${option}.html`
        }
        return `${this.baseUrl}/albums-favorite_ranking-page-${page}-type-${option}.html`
    }

    // explore page list
    explore = [
        {
            // title of the page.
            // title is used to identify the page, it should be unique
            title: "紳士漫畫",

            /// multiPartPage or multiPageComicList or mixed
            type: "multiPartPage",

            /**
             * load function
             * @param page {number | null} - page number, null for `singlePageWithMultiPart` type
             * @returns {{}}
             * - for `multiPartPage` type, return [{title: string, comics: Comic[], viewMore: string?}]
             * - for `multiPageComicList` type, for each page(1-based), return {comics: Comic[], maxPage: number}
             * - for `mixed` type, use param `page` as index. for each index(0-based), return {data: [], maxPage: number?}, data is an array contains Comic[] or {title: string, comics: Comic[], viewMore: string?}
             */
            load: async (page) => {
                let res = await Network.get(this.baseUrl, this.webHeaders)
                if (res.status !== 200) {
                    throw `Invalid Status Code ${res.status}`
                }
                let document = new HtmlDocument(res.body)
                // 最近主题 (weitu) 会在多个区块上重复输出 class 属性 (如 "class=\"title_sort\" class=\"cc\"")，
                // 部分 HTML 解析器会丢弃重复属性导致 bodywrap 丢失，因此这里不再强依赖 bodywrap 配对数。
                let titleBlocks = document.querySelectorAll("div.title_sort");
                // 兼容两种容器: bodywrap（标准结构）或直接是 grid
                let comicBlocks = document.querySelectorAll("div.bodywrap");
                if (comicBlocks.length === 0) {
                    comicBlocks = document.querySelectorAll("div.grid");
                }
                let result = []
                for (let i = 0; i < titleBlocks.length; i++) {
                    let titleEl = titleBlocks[i].querySelector("div.title_h2")
                    let title = titleEl ? titleEl.text.replaceAll(/\s+/g, '') : `Section ${i + 1}`
                    let linkEl = titleBlocks[i].querySelector("div.r > a")
                    let link = linkEl ? linkEl.attributes["href"] : "/albums.html"
                    let comics = []
                    let comicBlock = comicBlocks[i]
                    if (comicBlock) {
                        // 宽松选择器: 兼容 bodywrap > grid 或 grid 直接作为容器
                        let comicElements = comicBlock.querySelectorAll("ul.cc > li")
                        if (comicElements.length === 0) {
                            comicElements = comicBlock.querySelectorAll("li.gallary_item")
                        }
                        for (let comicElement of comicElements) {
                            try {
                                comics.push(this.parseComic(comicElement))
                            } catch (e) { /* 跳过损坏条目 */ }
                        }
                    }
                    if (comics.length > 0) {
                        result.push({
                            title: title,
                            comics: comics,
                            viewMore: `category:${title}@${link}`
                        })
                    }
                }
                // 兜底: 若按区块解析无结果(部分解析器丢弃了区块容器)，退化为按全局叶子节点解析
                if (result.length === 0) {
                    let globalComics = this.parseComicsGlobal(document)
                    if (globalComics.length > 0) {
                        let topTitle = "最新"
                        let firstH2 = document.querySelector("div.title_h2")
                        if (firstH2) topTitle = firstH2.text.replaceAll(/\s+/g, '')
                        result.push({
                            title: topTitle,
                            comics: globalComics,
                            viewMore: `category:${topTitle}@/albums.html`,
                        })
                    }
                }
                document.dispose()
                return result
            }
        }
    ]

    // categories
    category = {
        /// title of the category page, used to identify the page, it should be unique
        title: "紳士漫畫",
        parts: [
            {
                // title of the part
                name: "最新",

                // fixed or random
                // if random, need to provide `randomNumber` field, which indicates the number of comics to display at the same time
                type: "fixed",

                // number of comics to display at the same time
                // randomNumber: 5,

                categories: ["最新"],

                // category or search
                // if `category`, use categoryComics.load to load comics
                // if `search`, use search.load to load comics
                itemType: "category",

                // [Optional] {string[]?} must have same length as categories, used to provide loading param for each category
                categoryParams: ["/albums.html"],

                // [Optional] {string} cannot be used with `categoryParams`, set all category params to this value
                groupParam: null,
            },
            {
                // title of the part
                name: "同人誌",

                // fixed or random
                // if random, need to provide `randomNumber` field, which indicates the number of comics to display at the same time
                type: "fixed",

                // number of comics to display at the same time
                // randomNumber: 5,

                categories: ["同人誌", "漢化", "日語", "English", "CG畫集", "AI圖集", "3D漫畫", "Cosplay"],

                // category or search
                // if `category`, use categoryComics.load to load comics
                // if `search`, use search.load to load comics
                itemType: "category",

                // [Optional] {string[]?} must have same length as categories, used to provide loading param for each category
                categoryParams: [
                    "/albums-index-cate-5.html",
                    "/albums-index-cate-1.html",
                    "/albums-index-cate-12.html",
                    "/albums-index-cate-16.html",
                    "/albums-index-cate-2.html",
                    "/albums-index-cate-37.html",
                    "/albums-index-cate-22.html",
                    "/albums-index-cate-3.html",
                ],

                // [Optional] {string} cannot be used with `categoryParams`, set all category params to this value
                groupParam: null,
            },
            {
                // title of the part
                name: "單行本",

                // fixed or random
                // if random, need to provide `randomNumber` field, which indicates the number of comics to display at the same time
                type: "fixed",

                // number of comics to display at the same time
                // randomNumber: 5,

                categories: ["單行本", "漢化", "日語", "English",],

                // category or search
                // if `category`, use categoryComics.load to load comics
                // if `search`, use search.load to load comics
                itemType: "category",

                // [Optional] {string[]?} must have same length as categories, used to provide loading param for each category
                categoryParams: [
                    "/albums-index-cate-6.html",
                    "/albums-index-cate-9.html",
                    "/albums-index-cate-13.html",
                    "/albums-index-cate-17.html",
                ],

                // [Optional] {string} cannot be used with `categoryParams`, set all category params to this value
                groupParam: null,
            },
            {
                // title of the part
                name: "雜誌&短篇",

                // fixed or random
                // if random, need to provide `randomNumber` field, which indicates the number of comics to display at the same time
                type: "fixed",

                // number of comics to display at the same time
                // randomNumber: 5,

                categories: ["雜誌&短篇", "漢化", "日語", "English",],

                // category or search
                // if `category`, use categoryComics.load to load comics
                // if `search`, use search.load to load comics
                itemType: "category",

                // [Optional] {string[]?} must have same length as categories, used to provide loading param for each category
                categoryParams: [
                    "/albums-index-cate-7.html",
                    "/albums-index-cate-10.html",
                    "/albums-index-cate-14.html",
                    "/albums-index-cate-18.html",
                ],

                // [Optional] {string} cannot be used with `categoryParams`, set all category params to this value
                groupParam: null,
            },
            {
                // title of the part
                name: "韓漫",

                // fixed or random
                // if random, need to provide `randomNumber` field, which indicates the number of comics to display at the same time
                type: "fixed",

                // number of comics to display at the same time
                // randomNumber: 5,

                categories: ["韓漫", "漢化", "其他",],

                // category or search
                // if `category`, use categoryComics.load to load comics
                // if `search`, use search.load to load comics
                itemType: "category",

                // [Optional] {string[]?} must have same length as categories, used to provide loading param for each category
                categoryParams: [
                    "/albums-index-cate-19.html",
                    "/albums-index-cate-20.html",
                    "/albums-index-cate-21.html",
                ],

                // [Optional] {string} cannot be used with `categoryParams`, set all category params to this value
                groupParam: null,
            },
            {
                name: "3D&漫畫",
                type: "fixed",
                categories: ["3D&漫畫", "漢化", "其他",],
                itemType: "category",
                categoryParams: [
                    "/albums-index-cate-22.html",
                    "/albums-index-cate-23.html",
                    "/albums-index-cate-24.html",
                ],
                groupParam: null,
            },
            {
                name: "寫真&Cosplay",
                type: "fixed",
                categories: ["寫真&Cosplay",],
                itemType: "category",
                categoryParams: [
                    "/albums-index-cate-3.html",
                ],
                groupParam: null,
            },
            {
                name: "AI圖集",
                type: "fixed",
                categories: ["AI圖集",],
                itemType: "category",
                categoryParams: [
                    "/albums-index-cate-37.html",
                ],
                groupParam: null,
            },
        ],
        // enable ranking page
        enableRankingPage: true,
    }

    /// category comic loading related
    categoryComics = {
        /**
         * load comics of a category
         * @param category {string} - category name
         * @param param {string?} - category param
         * @param options {string[]} - options from optionList
         * @param page {number} - page number
         * @returns {Promise<{comics: Comic[], maxPage: number}>}
         */
        load: async (category, param, options, page) => {
            // param 为分类 path (如 /albums-index-cate-5.html 或 /albums-index-tag-XXX.html),
            // explore 的 viewMore 会传 category:title@param 格式, 这里 param 已是解析后的 path
            let url = this.buildCategoryUrl(param, page)

            let res = await Network.get(url, this.webHeaders)
            if (res.status !== 200) {
                throw `Invalid Status Code ${res.status}`
            }
            let document = new HtmlDocument(res.body)
            let { comics, maxPage } = this.parseListPage(document)
            document.dispose()
            return {
                comics: comics,
                maxPage: maxPage,
            }
        },
        ranking: {
            options: [
                "day-Day",
                "week-Week",
                "month-Month",
                "year-Year",
            ],
            load: async (option, page) => {
                let url = this.buildRankingUrl(option, page)

                let res = await Network.get(url, this.webHeaders)
                if (res.status !== 200) {
                    throw `Invalid Status Code ${res.status}`
                }

                let document = new HtmlDocument(res.body)
                let { comics, maxPage } = this.parseListPage(document)

                document.dispose()
                return {
                    comics: comics,
                    maxPage: maxPage,
                }
            }
        }
    }

    /// search related
    search = {
        /**
         * load search result
         * @param keyword {string}
         * @param options {string[]} - options from optionList
         * @param page {number}
         * @returns {Promise<{comics: Comic[], maxPage: number}>}
         */
        load: async (keyword, options, page) => {
            // 搜索排序: s=create_time_DESC(最新,默认)/create_time_ASC(最早)/comment/favorite (实测均返回200, comment与favorite当前同序, 保留)
            // 原站表单隐藏字段 f=_all, syn=yes, 分页 p=N (实测 p=1 与无 p 同结果)
            let sort = (options && options[0]) ? options[0].split("-")[0] : "create_time_DESC"
            if (!["create_time_DESC", "create_time_ASC", "comment", "favorite"].includes(sort)) {
                sort = "create_time_DESC"
            }
            let url = `${this.baseUrl}/search/?q=${encodeURIComponent(keyword)}&f=_all&s=${sort}&syn=yes`
            if (page && page > 1) {
                url += `&p=${page}`
            }
            let res = await Network.get(url, this.webHeaders)
            if (res.status !== 200) {
                throw `Invalid Status Code ${res.status}`
            }
            let document = new HtmlDocument(res.body)
            let { comics, maxPage } = this.parseListPage(document)
            // 搜索页有精确总数 p.result>b (首个为过滤命中数, 24条/页), 优先用它算 maxPage
            let total = document.querySelectorAll("p.result > b")
            const comicsPerPage = 24
            if (total.length > 0) {
                let n = Number((total[0].text || "").replaceAll(',', ''))
                if (!Number.isNaN(n) && n > 0) {
                    maxPage = Math.max(1, Math.ceil(n / comicsPerPage))
                }
            }
            document.dispose()
            return {
                comics: comics,
                maxPage: maxPage,
            }
        },

        // provide options for search
        optionList: [
            {
                type: "select",
                options: [
                    "create_time_DESC-最新",
                    "create_time_ASC-最早",
                    "comment-最多評論",
                    "favorite-最多收藏",
                ],
                label: "排序",
            }
        ],
    }

    // favorite related
    favorites = {
        // whether support multi folders
        multiFolder: true,
        isOldToNewSort: true,
        /**
         * add or delete favorite.
         * throw `Login expired` to indicate login expired, App will automatically re-login and re-add/delete favorite
         * @param comicId {string}
         * @param folderId {string}
         * @param isAdding {boolean} - true for add, false for delete
         * @param favoriteId {string?} - [Comic.favoriteId]
         * @returns {Promise<any>} - return any value to indicate success
         */
        addOrDelFavorite: async (comicId, folderId, isAdding, favoriteId) => {
            if (!isAdding) {
                let res = await Network.get(`${this.baseUrl}/users-fav_del-id-${favoriteId}.html?ajax=true&_t=${randomDouble(0, 1)}`, this.webHeaders)
                if (res.status !== 200) {
                    throw 'Delete failed'
                }
            } else {
                let res = await Network.post(`${this.baseUrl}/users-save_fav-id-${comicId}.html`, {
                    'content-type': 'application/x-www-form-urlencoded'
                }, `favc_id=${folderId}`)
                if (res.status !== 200) {
                    throw 'Delete failed'
                }
            }
            return 'ok'
        },
        /**
         * load favorite folders.
         * throw `Login expired` to indicate login expired, App will automatically re-login retry.
         * if comicId is not null, return favorite folders which contains the comic.
         * @param comicId {string?}
         * @returns {Promise<{folders: {[p: string]: string}, favorited: string[]}>} - `folders` is a map of folder id to folder name, `favorited` is a list of folder id which contains the comic
         */
        loadFolders: async (comicId) => {
            // 用指定漫画的加收藏弹窗取文件夹列表 (未登录会返回登录框, App 触发重登)
            // comicId 为空时用兜底 aid, 该 aid 仅用于取列表, 不产生收藏动作
            let aid = comicId || "210814"
            let res = await Network.get(`${this.baseUrl}/users-addfav-id-${aid}.html`, this.webHeaders)
            if (res.status !== 200) {
                throw 'Load failed'
            }
            if (res.body.includes("用戶登錄") || res.body.includes("login_form")) {
                throw 'Login expired'
            }
            let document = new HtmlDocument(res.body)
            let data = {}
            document.querySelectorAll("option").forEach((option => {
                if (option.attributes["value"] === "") return
                data[option.attributes["value"]] = option.text
            }))
            return {
                folders: data,
                favorited: []
            }
        },
        /**
         * add a folder
         * @param name {string}
         * @returns {Promise<any>} - return any value to indicate success
         */
        addFolder: async (name) => {
            let res = await Network.post(`${this.baseUrl}/users-favc_save-id.html`, {
                'content-type': 'application/x-www-form-urlencoded'
            }, `favc_name=${encodeURIComponent(name)}`)
            if (res.status !== 200) {
                throw 'Add failed'
            }
            return 'ok'
        },
        /**
         * delete a folder
         * @param folderId {string}
         * @returns {Promise<void>} - return any value to indicate success
         */
        deleteFolder: async (folderId) => {
            let res = await Network.get(`${this.baseUrl}/users-favclass_del-id-${folderId}.html?ajax=true&_t=${randomDouble()}`, this.webHeaders)
            if (res.status !== 200) {
                throw 'Delete failed'
            }
            return 'ok'
        },
        /**
         * load comics in a folder
         * throw `Login expired` to indicate login expired, App will automatically re-login retry.
         * @param page {number}
         * @param folder {string?} - folder id, null for non-multi-folder
         * @returns {Promise<{comics: Comic[], maxPage: number}>}
         */
        loadComics: async (page, folder) => {
            let url = `${this.baseUrl}/users-users_fav-page-${page}-c-${folder}.html`
            let res = await Network.get(url, this.webHeaders)
            if (res.status !== 200) {
                throw `Invalid Status Code ${res.status}`
            }
            if (res.body.includes("用戶登錄") || res.body.includes("login_form")) {
                throw 'Login expired'
            }
            let document = new HtmlDocument(res.body)
            let comicBlocks = document.querySelectorAll("div.asTB")
            let comics = comicBlocks.map((comic) => {
                let cover = comic.querySelector("div.asTBcell.thumb > div > img").attributes["src"]
                cover = this.normalizeImageUrl(cover)
                let time = comic.querySelector("div.box_cel.u_listcon > p.l_catg > span").text.replaceAll("創建時間：", "")
                let name = this.stripHtml(comic.querySelector("div.box_cel.u_listcon > p.l_title > a").text);
                let link = comic.querySelector("div.box_cel.u_listcon > p.l_title > a").attributes["href"];
                let id = this.extractAid(link);
                let info = comic.querySelector("div.box_cel.u_listcon > p.l_detla").text;
                let pages = Number(RegExp("(?<=頁數：)[0-9]+").exec(info)[0])
                let delUrl = comic.querySelector("div.box_cel.u_listcon > p.alopt > a").attributes["onclick"];
                let favoriteId = RegExp("(?<=del-id-)[0-9]+").exec(delUrl)[0];
                return new Comic({
                    id: id,
                    title: name,
                    subtitle: time,
                    cover: cover,
                    pages: pages,
                    favoriteId: favoriteId,
                })
            })
            let pages = 1
            let pagesLink = document.querySelectorAll("div.f_left.paginator > a")
            if (pagesLink.length > 0) {
                for (let i = pagesLink.length - 1; i >= 0; i--) {
                    let n = Number((pagesLink[i].text || "").trim())
                    if (!Number.isNaN(n) && n > 0) {
                        pages = n
                        break
                    }
                }
            }
            document.dispose()
            return {
                comics: comics,
                maxPage: pages,
            }
        }
    }

    /// single comic related
    comic = {
        /**
         * load comic info
         * @param id {string}
         * @returns {Promise<ComicDetails>}
         */
        loadInfo: async (id) => {
            id = this.extractAid(id) || id
            let res = await Network.get(`${this.baseUrl}/photos-index-aid-${id}.html`, this.webHeaders)
            if (res.status !== 200) {
                throw `Invalid Status Code ${res.status}`
            }
            let document = new HtmlDocument(res.body)
            let title = this.stripHtml(document.querySelector("div.userwrap > h2").text)
            let cover = this.normalizeImageUrl(document.querySelector("div.userwrap > div.asTB > div.asTBcell.uwthumb > img").attributes["src"])
            let labels = document.querySelectorAll("div.asTBcell.uwconn > label")
            let category = labels[0].text.split("：")[1]
            let pagesRaw = labels[1].text.split("：")[1];
            let pagesNum = parseInt((pagesRaw || "").replace(/[^0-9]/g, "")) || 0
            let tagsDom = document.querySelectorAll("a.tagshow");
            let tags = new Map()
            tags.set("頁數", [pagesRaw])
            tags.set("分類", [category])
            if (tagsDom.length > 0) {
                tags.set("標籤", tagsDom.map((e) => this.stripHtml(e.text)))
            }
            let description = document.querySelector("div.asTBcell.uwconn > p").text;
            if (description) description = description.replace(/^簡介：/, "").trim()
            let uploader = document.querySelector("div.asTBcell.uwuinfo > a > p").text;

            // wnacg 页面没有独立"作者"字段, 作者/社团名约定写在标题首对 [] 里 (如 [加濑大辉] ...)。
            // 必须提取出来填入 subtitle + 作者标签, 否则 App 会用 uploader 顶替作者位显示。
            let authorName = ""
            let titleMatch = title.match(/\[([^\[\]]+)\]/)
            if (titleMatch) {
                authorName = titleMatch[1].trim()
            }
            if (authorName && !tags.has("作者")) {
                tags.set("作者", [authorName])
            }

            return new ComicDetails({
                id: String(id),
                title: title,
                subtitle: authorName || undefined,
                cover: cover,
                tags: tags,
                description: description,
                uploader: uploader,
                maxPage: pagesNum || undefined,
                url: `${this.baseUrl}/photos-index-aid-${id}.html`,
                // wnacg 每个作品是单画廊: 只有一个章节 (loadEp 直接按 comicId 加载图片)
                chapters: new Map([["1", title]]),
            })
        },
        /**
         * [Optional] load thumbnails of a comic
         * @param id {string}
         * @param next {string | null | undefined} - next page token, null for first page
         * @returns {Promise<{thumbnails: string[], next: string?}>} - `next` is next page token, null for no more
         */
        loadThumbnails: async (id, next) => {
            id = this.extractAid(id) || id
            next = next || '1'
            let res = await Network.get(`${this.baseUrl}/photos-index-page-${next}-aid-${id}.html`, this.webHeaders);
            if (res.status !== 200) {
                throw `Invalid Status Code ${res.status}`
            }
            let document = new HtmlDocument(res.body)
            let thumbnails = document.querySelectorAll("div.pic_box.tb > a > img").map((e) => {
                return this.normalizeImageUrl(e.attributes["src"])
            })
            next = (Number(next) + 1).toString()
            let paginator = document.querySelector("div.f_left.paginator")
            if (paginator) {
                // 最后一页时最后一个子节点为 span.thispage (无后继 <a>), 否则还有下一页
                let pagesLink = paginator.querySelectorAll("a")
                let thisPage = paginator.querySelector("span.thispage")
                if (pagesLink.length === 0) {
                    next = null
                } else if (thisPage) {
                    // 若 thispage 后无 <a>, 说明已是末页
                    let children = paginator.children || []
                    let idx = -1
                    for (let i = 0; i < children.length; i++) {
                        if ((children[i].text || "").trim() === (thisPage.text || "").trim()) {
                            idx = i
                            break
                        }
                    }
                    let hasNext = false
                    for (let i = idx + 1; i < children.length; i++) {
                        if (children[i].localName === "a" || (children[i].querySelector && children[i].querySelector("a"))) {
                            hasNext = true
                            break
                        }
                    }
                    if (!hasNext) next = null
                }
            } else {
                // 无分页器说明只有一页
                next = null
            }
            document.dispose()
            return {
                thumbnails: thumbnails,
                next: next
            }
        },
        /**
         * load images of a chapter
         * @param comicId {string}
         * @param epId {string?}
         * @returns {Promise<{images: string[]}>}
         */
        loadEp: async (comicId, epId) => {
            comicId = this.extractAid(comicId) || comicId
            // 首选新阅读器数据源 /photos-item-aid- (mReader.initData page_url, 实测 20/20 全量)
            //  rightly filtered: 仅 /data/ 原图, 升级 http->https
            try {
                let itemRes = await Network.get(`${this.baseUrl}/photos-item-aid-${comicId}.html`, this.webHeaders)
                if (itemRes.status === 200) {
                    let m = itemRes.body.match(/"page_url"\s*:\s*\[(.*?)\]/s)
                    if (m) {
                        let urls = [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]).filter(u => u.includes("/data/"))
                        urls = urls.map(u => {
                            if (u.startsWith("//")) return "https:" + u
                            return u.replace(/^http:\/\//, "https://")
                        })
                        // 去重保序
                        let seen = new Set()
                        urls = urls.filter(u => !seen.has(u) && seen.add(u))
                        if (urls.length > 0) return { images: urls }
                    }
                }
            } catch (e) { /* 降级到旧 gallery */ }
            // 旧阅读器数据源 /photos-gallery-aid- (var imglist, 可能为空 document.writeln)
            try {
                let res = await Network.get(`${this.baseUrl}/photos-gallery-aid-${comicId}.html`, this.webHeaders)
                if (res.status === 200) {
                    let m = res.body.match(/imglist\s*=\s*\[(.*?)\]/s)
                    let target = (m && m[1]) || res.body
                    const regex = RegExp(String.raw`(?:https?:)?//[^"'`\s]+/data/[^"'`\s]+\.(?:jpg|jpeg|png|webp|gif|jpe)`, 'gi');
                    const seen = new Set()
                    const images = []
                    for (let mm of target.matchAll(regex)) {
                        let url = mm[0]
                        if (url.startsWith("//")) url = 'https:' + url
                        else url = url.replace(/^http:\/\//, "https://")
                        if (!seen.has(url)) {
                            seen.add(url)
                            images.push(url)
                        }
                    }
                    if (images.length > 0) return { images: images }
                }
            } catch (e) { /* 继续抛错 */ }
            throw `Invalid Status Code: no images found`
        },
        /**
         * [Optional] provide configs for an image loading
         * 正文/缩略图统一带浏览器头 (Referer 跟随当前域名), 防 403/防盗链, 顺带复用 webHeaders
         */
        onImageLoad: (url, comicId, epId) => {
            return {
                headers: this.webHeaders,
            }
        },
        onThumbnailLoad: (url) => {
            return {
                headers: this.webHeaders,
            }
        },
        /**
         * [Optional] Handle tag click event
         * 原站标签均为 /albums-index-tag-XXX.html, 走 category 比走 search 更准 (search 会混入标题命中)
         * @param namespace {string}
         * @param tag {string}
         * @returns {{action: string, keyword: string, param: string?}}
         */
        onClickTag: (namespace, tag) => {
            tag = (tag || "").trim()
            if (!tag) {
                return { action: 'search', keyword: tag }
            }
            return {
                action: 'category',
                keyword: tag,
                param: `/albums-index-tag-${tag}.html`,
            }
        },
        // {string?} - regex string, used to identify comic id from user input (aid-数字 / 纯数字 / 详情链接)
        idMatch: "(?:aid-)?(\\d{4,8})",
        link: {
            domains: [
                'wnacg.com',
                'www.wnacg.com',
                'wnacg.ru',
                'www.wnacg.ru',
            ],
            linkToId: (url) => {
                let m = RegExp("(?<=-aid-)[0-9]+").exec(url)
                if (m) return m[0]
                return null
            }
        },
        /**
         * [Optional] load comments
         * 原站 /comment-index-aid-XXX.html, div.plItem 结构 (需登录才能发表, 加载无需登录)
         */
        loadComments: async (comicId, subId, page, replyTo) => {
            comicId = this.extractAid(comicId) || comicId
            let res = await Network.get(`${this.baseUrl}/comment-index-aid-${comicId}.html`, this.webHeaders)
            if (res.status !== 200) {
                throw `Invalid Status Code ${res.status}`
            }
            let document = new HtmlDocument(res.body)
            let items = document.querySelectorAll("div.plItem")
            if (items.length === 0) {
                // 详情页内联评论兜底 (div.pl_pv)
                items = document.querySelectorAll("div.pl_pv")
                let comments = items.map((it) => {
                    let userName = it.querySelector(".pl_pv_n")?.text?.trim() || ""
                    let content = it.querySelector(".pl_pv_c")?.text?.trim() || ""
                    let time = it.querySelector(".pl_pv_m")?.text?.trim() || ""
                    let avatar = it.querySelector("img")?.attributes?.["src"] || ""
                    if (avatar && !avatar.startsWith("http")) {
                        avatar = avatar.startsWith("//") ? "https:" + avatar : this.baseUrl + (avatar.startsWith("/") ? avatar : "/" + avatar)
                    }
                    return new Comment({ userName, avatar, content, time })
                }).filter(c => c.content)
                document.dispose()
                return { comments, maxPage: 1 }
            }
            let comments = items.map((it) => {
                let userName = it.querySelector(".plName")?.text?.trim() || it.querySelector(".pl_pv_n")?.text?.trim() || ""
                let content = it.querySelector(".plText")?.text?.trim() || it.querySelector(".pl_pv_c")?.text?.trim() || ""
                let time = it.querySelector(".plTime")?.text?.trim() || it.querySelector(".pl_pv_m")?.text?.trim() || ""
                let avatar = it.querySelector("img.plAv")?.attributes?.["src"] || it.querySelector("img")?.attributes?.["src"] || ""
                if (avatar && !avatar.startsWith("http")) {
                    avatar = avatar.startsWith("//") ? "https:" + avatar : this.baseUrl + (avatar.startsWith("/") ? avatar : "/" + avatar)
                }
                let id = it.attributes?.["data-id"] || undefined
                return new Comment({ userName, avatar, content, time, id })
            }).filter(c => c.content)
            document.dispose()
            return { comments, maxPage: 1 }
        },
    }

    get settings() {
        // 动态生成选项，总是保留 Custom Domain (0)，然后根据 Wnacg.domains 数量添加选项
        let domainOptions = [{ value: '0', text: 'Custom Domain' }]
        for (let i = 0; i < Wnacg.domains.length; i++) {
            domainOptions.push({
                value: String(i + 1),
                text: Wnacg.domains[i]
            })
        }

        return {
            refreshDomains: {
                title: "Refresh Domain List",
                type: "callback",
                buttonText: "Refresh",
                callback: () => this.refreshDomains(true)
            },
            refreshDomainsOnStart: {
                title: "Refresh Domain List on Startup",
                type: "switch",
                default: true,
            },
            domainSelection: {
                title: "Domain Selection",
                type: "select",
                options: domainOptions,
                default: "0",
            },
            domain0: {
                title: "Custom Domain",
                type: "input",
                validator: String.raw`^(?!:\/\/)(?=.{1,253})([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$`,
                default: 'wnacg.com',
            },
        }
    }

    translation = {
        'zh_CN': {
            'Refresh Domain List': '刷新域名列表',
            'Refresh': '刷新',
            'Refresh Domain List on Startup': '启动时刷新域名列表',
            'Domain Selection': '域名选择',
            'Custom Domain': '自定义域名',
            'Custom domain is not set': '未设置自定义域名',
            'Selected domain is unavailable': '所选域名不可用，请先刷新域名列表',
            'Day': '日',
            'Week': '周',
            'Month': '月',
            'Year': '年',
            '排序': '排序',
            '最新': '最新',
            '最早': '最早',
            '最多評論': '最多评论',
            '最多收藏': '最多收藏',
        },
        'zh_TW': {
            'Refresh Domain List': '刷新域名列表',
            'Refresh': '刷新',
            'Refresh Domain List on Startup': '啟動時刷新域名列表',
            'Domain Selection': '域名選擇',
            'Custom Domain': '自定義域名',
            'Custom domain is not set': '未設置自定義域名',
            'Selected domain is unavailable': '所選域名不可用，請先刷新域名列表',
            'Day': '日',
            'Week': '週',
            'Month': '月',
            'Year': '年',
            '排序': '排序',
        },
    }
}
