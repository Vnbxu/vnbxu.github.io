# Haoran Xu · Academic homepage

轻量静态学术主页：Markdown / YAML 内容 → Nunjucks 共用模板 → HTML。浏览器无需加载任何框架，正文在关闭 JavaScript 时仍可阅读。保留 `index.html`、`publications.html` 和原有资源路径，生成结果可直接由 GitHub Pages 提供。

## 本地使用

构建需要 **Node.js 22 或更新版本**，推荐 Node.js 24（`.nvmrc`）。npm 命令通过 `scripts/run.cjs` 启动：优先使用当前兼容的 Node，旧版本会尝试 PATH 中的其他 Node 和本机已安装的 Codex Node 运行时。它不会安装软件或修改系统配置。

```sh
npm ci --ignore-scripts
npm run dev
```

打开 `http://127.0.0.1:4173`。修改并保存内容、模板、CSS 或 JS 后，预览服务会自动重新构建并刷新浏览器。保持这个终端运行，按 Ctrl+C 停止。可用 `PORT=4174 npm run dev` 修改端口。服务器仅监听本机，并只提供页面和 `assets/` 资源；自动刷新脚本只由开发服务器临时注入，不进入发布文件。构建错误会显示在终端，修正后保存即可重试。

```sh
npm run build  # 生成静态页面、sitemap.xml 和 robots.txt
npm run export # 生成最小发布目录 _local/publish/，不包含源码或搜索引擎辅助文件
npm test       # 检查数据验证、渲染、转义、项目关联等
npm run check  # 验证已生成文件与内容、模板和样式一致，不改写文件
```

本次环境的系统 Node.js 为 14.4，npm 命令会自动使用本机已有的 Node.js 24，因此可直接运行上面的命令。其他机器若找不到 Node.js 22+，启动器会提示切换版本；也可显式使用 `SITE_NODE=/absolute/path/to/node npm run build` 指定已安装的 Node。使用 nvm 时可执行 `nvm install`、`nvm use`，读取 `.nvmrc` 的版本配置。

## 内容在哪里维护

| 文件 | 内容 |
| --- | --- |
| `content/site.yml` | 姓名、身份、学校、联系方式、研究兴趣、首页论文 ID、分区标签、页脚日期 |
| `content/about.md` | 简介，支持 Markdown 链接、加粗与段落 |
| `content/publications.yml` | 全部论文、作者、年份、会议/期刊、分区、资源链接、BibTeX |
| `content/education.yml` | 教育经历，按文件中的顺序展示 |
| `content/experience.yml` | 工作/实习经历，description 支持 Markdown |
| `content/awards.yml` | 荣誉、年份、机构、中文名称 |
| `content/projects.yml` | 独立项目，可引用已有论文；原站没有独立项目，因此当前为空 |

**不要直接编辑根目录生成的 HTML**，下一次构建会覆盖它。原有正文、经历日期、作者顺序、共同一作标记和资源链接已迁移。需要评估的文字修改仅保存在本地 `_local/notes/content-review.md`，不参与构建或提交。页脚更新时间采用自动记录，规则见下文。

### 更新时间与页面刷新

`site.yml` 中的 `updated: auto` 和 `publications_updated: auto` 分别控制首页与论文页。成功构建时，两个页面使用北京时间的当前月份，例如 `September 2026`。同月重复构建显示相同月份；跨月重新构建会更新月份。只打开或刷新页面不会改变已生成的日期。

无需额外状态文件。日期直接写入生成 HTML；只读的 `npm run check` 使用 HTML 中已有的月份，避免 CI 因跨月而把没有修改的页面判为过期，其他内容仍做完整一致性检查。需要固定月份时，可把 `auto` 改为带引号的 `YYYY-MM`，例如 `updated: '2026-08'`。

自动日期采用构建月份，与 `git add` 无关。

- **本地开发**：保持 `npm run dev` 运行，保存 `content/` 文件后浏览器自动刷新；首次载入旧页面时手动刷新一次，以加载自动刷新功能。
- **未运行预览服务**：先执行 `npm run build`，再刷新浏览器（macOS：⌘R）。修改 YAML/Markdown 本身不会直接改变 HTML。
- **GitHub Pages 线上页面**：源码与 Actions 方案启用后，提交并推送内容源文件，等待自动构建部署完成后刷新；本地保存不会自动发布。

### 添加论文

在 `publications.yml` 增加一个条目。年份会自动倒序分组；同一年内按文件顺序展示。ID 要唯一、稳定，使用小写字母、数字和连字符。

```yaml
- id: example-2027
  year: 2027
  type: conference              # conference 或 journal
  title: 'Example: A Paper Title'
  authors:
    - name: Haoran Xu           # 与 site.name 相同时自动加粗
      equal: true              # 可选，共同一作标记
    - name: Another Author
  venue: Example Conference, 2027
  venue_short: EXAMPLE'27
  badges: [ccfa]                # 可为空 []；键定义在 site.yml
  url: https://example.org/paper # 可选，论文标题的链接
  links:
    - label: Paper
      url: https://example.org/paper
    - label: Slides
      url: assets/slides/example.pdf
  bibtex: |-                   # 可选，保留原始引用文本
    @inproceedings{example2027,
      title={A Paper Title},
      year={2027}
    }
```

没有资源时使用 `links: []`，无需放置空链接或占位按钮。Slides、Code、Poster 等入口均由 `links` 中的标签和 URL 决定。把本地文件放在 `assets/` 后引用它，构建会检查文件存在。Google Scholar 等外部链接会验证格式，不会在每次构建中请求外部网站。

首页代表作由 `site.yml` 的 `featured_publications` 控制，按其中的 ID 顺序展示，题目、作者、资源与论文页共用同一份数据，不重复录入。使用 `[]`、省略或注释此配置均可隐藏该区块。

### 添加经历或项目

经历的日期使用带引号的 `YYYY-MM`，结束时间也可写 `Present`。页面继续采用原站的 `2025.9 – Present` 显示形式。教育条目的 `advisor`、实习条目的 `note`、奖项的 `organization` 和 `title_cn` 均为可选。

独立项目的示例（请替换示例文字和链接）：

```yaml
- id: example-project
  name: Example Project
  topic: Research topic
  description: A short, approved project description.
  publication: example-2027     # 可选，引用已有论文 ID
  links:                       # 可选；未填写时继承关联论文的资源入口
    - label: Code
      url: https://example.org/code
```

各列表文件使用 `[]` 时对应区块会隐藏。必填项缺失、ID 重复、错误日期、无效项目引用或缺失本地文件会阻止构建并提示具体位置。

## 代码结构

```text
content/                     唯一内容来源
src/templates/
  base.njk                   共用页面骨架、导航、SEO、页脚
  home.njk                   首页布局
  publications.njk           论文归档与筛选界面
  components/paper.njk        共用论文条目
assets/css/site.css          设计变量、组件、响应式与打印样式
assets/js/publications.js    筛选、搜索与复制引用，渐进增强
scripts/
  content.mjs                内容读取与校验
  build.mjs                  渲染、链接校验、生成文件一致性检查
  run.cjs                    Node 版本检测与 npm 命令启动
  dev.mjs                    本机预览、重新构建与浏览器自动刷新
test/site.test.mjs           构建与内容管理回归检查
```

颜色、字体、宽度在 CSS 顶部的变量中统一设置。使用系统字体，无外部字体请求。保留原先选定的 CCF / 中科院分区标签配色。引用使用原生 `<details>`，关闭 JavaScript 时也可展开和手动复制；筛选与复制按钮在相应浏览器能力可用时出现。

首页桌面布局为左侧照片、姓名与联系方式，右侧 Biography 及其下方的 Interests；Education 位于整个首屏区块下方。手机端先展示个人信息，再依次展示简介和研究兴趣。网页图标使用 `assets/images/favicon-hx.png`，可通过 `site.yml` 的 `favicon` 字段更换。图标原图与提示词仅保存在本地 `_local/design/`，网页运行不依赖它们。

## 源码保存在 GitHub，自动构建和发布

为了换电脑后仍能维护网站，将当前网站的内容、模板和资源保存到同一个 GitHub 仓库。GitHub Actions 从源码生成最小网页并发布；无需另外复制备份这些已提交并推送的维护源码。

需要提交：

| 文件/目录 | 用途 |
| --- | --- |
| `content/` | 简介、论文、兴趣、经历等 Markdown/YAML 内容 |
| `src/` | 共用页面模板与论文组件 |
| `assets/` | 样式、浏览器脚本、照片、图标和 Slides |
| `scripts/`、`package.json`、`package-lock.json` | 内容校验与可复现的构建工具 |
| `.github/`、`test/` | 自动构建、测试及 Pages 部署 |
| `README.md`、`.gitignore`、`.nvmrc` | 维护说明、生成文件忽略规则与 Node 版本 |

生成的 `index.html`、`publications.html`、`robots.txt`、`sitemap.xml`、`.nojekyll` 和 `_local/publish/` 不必提交，已加入忽略规则。`node_modules/`、调试日志和本地历史备份也不提交。`.git/` 由 Git 自己管理。

这是保存当前可维护网站所需的源码清单；`_local/` 的旧版备份、改版笔记和图标原图仍只在本地，它们不参与构建，也不影响从 GitHub 恢复当前网站。

### 首次启用

1. 将上面的源码提交并推送到仓库 `main` 分支。
2. 在 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 在 Actions 中查看 **Build and deploy website**。若首次推送时 Pages 设置尚未切换，可切换后手动执行 **Run workflow**。

工作流 `.github/workflows/pages.yml` 使用 Node.js 24，执行依赖安装、测试和最小网页生成；只有 `main` 的推送或手动运行会发布。Pull request 会构建和测试，不部署。部署产物只有 `_local/publish/` 的网页和资源。[GitHub Pages 工作流说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

原仓库曾跟踪根目录 HTML。若要在首次迁移时让仓库只保留源码，可执行以下命令取消跟踪，文件仍留在本机：

```sh
git rm --cached --ignore-unmatch index.html publications.html robots.txt sitemap.xml .nojekyll
git add content src assets scripts test .github package.json package-lock.json README.md .gitignore .nvmrc
git status --short
```

确认清单后再提交和推送。取消跟踪 HTML 应与切换到 GitHub Actions 配合进行；分支静态发布模式仍需要根目录 HTML。本次尚未执行取消跟踪、提交、推送，也未修改远端设置。

### 后续更新

修改 `content/` 后，提交并推送源文件即可触发 GitHub 构建，不必上传生成的 HTML。也可直接在 GitHub 上编辑内容文件并提交。

本地预览仍使用 `npm run dev`。本地检查可运行 `npm test` 和 `npm run export`。新电脑克隆这个仓库后，使用 Node.js 22+ 执行 `npm ci --ignore-scripts` 即可恢复构建环境。

## 最小发布产物

`npm run export` 会重建 `_local/publish/`，只包含网页引用的资源。当前共 8 个文件：

```text
_local/publish/
├── .nojekyll
├── index.html
├── publications.html
└── assets/
    ├── css/site.css
    ├── js/publications.js
    ├── images/haoran.jpg
    ├── images/favicon-hx.png
    └── slides/aida_sigcomm26.pdf
```

这 8 个文件是浏览器实际需要的发布产物，不是维护源码。Actions 会自动生成并部署它们。

`robots.txt` 用来控制搜索引擎爬虫的抓取规则；`sitemap.xml` 列出网页地址。它们不参与页面渲染，最小发布产物不包含它们。[robots.txt 官方说明](https://developers.google.com/search/docs/crawling-indexing/robots/intro)

旧的本地构建、手动上传方式仍可使用：将 `_local/publish/` 的内容上传到仓库根目录，Pages 选择 **Deploy from a branch → main / (root)**。这种方式只保存生成网页，需要另行保存源码；当前推荐使用上面的源码与 Actions 方案。

## 设计参考

参考 [Jon Barron](https://jonbarron.info/) 的简洁简介、研究列表和直接资源入口，以及 [Shiry Ginosar](https://shiry.ttic.edu/) 的研究信息层级。页面采用独立实现：暖白底色、深色正文、克制的蓝色链接、统一无衬线字体，按区块组织信息；BibTeX 引用保留等宽字体，方便阅读和复制。
