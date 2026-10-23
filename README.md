# bluebooks · 书屿

一个用于百度网盘、阿里云盘和夸克网盘的私人电子书目录。以紧凑列表管理大量书籍，不加载封面。文件留在原网盘，书目与阅读记录保存为可移动的 `library.json`。

## 已有功能

- 统一检索书名、作者、ISBN、分类、文件路径和笔记。
- 按网盘、文件格式、分类、未读 / 在读 / 已读筛选；书名排序与分页。
- 同一本书集中展示多个网盘和文件格式；打开已有分享链接。
- 重复书目整理：按有效 ISBN，或规范化后相同的书名与作者识别；归并后保留全部文件来源和不同笔记。
- 独立的已读书籍页面，完成日期、评分、笔记、收藏。
- 新增、编辑、移出书目；CSV / JSON 批量追加导入。
- 打开完整 JSON 书库，以及保存完整 JSON 文件；支持手机浏览器。
- 浏览器本机草稿缓存（IndexedDB），无账号、无云端数据库、无第三方运行时依赖。

## JSON 文件如何使用

1. 首次打开显示明确标注的示例书库。可以清空示例、添加第一本真实书籍，或打开自己的 JSON 文件。
2. 点击右上角 **打开 JSON 书库**，选择 `library.json`。确认后会替换当前浏览器的本机草稿。
3. 修改书目、已读状态或笔记后，点击 **保存 JSON**。浏览器会下载当前完整书库，文件名为 `library.json`。
4. 通过你自己的方式把最新 JSON 同步到手机 / 电脑，在另一端再次选择 **打开 JSON 书库**。

**本机自动缓存不等于 JSON 文件自动更新。** 浏览器不能静默覆盖你磁盘中的原文件；保存按钮下载新文件，可能被浏览器命名为 `library (1).json`。请用最新下载的版本更新你同步的文件。

两台设备分别编辑后不会自动合并。建议每次先打开最新 JSON，编辑完成后再保存并同步。浏览器缓存按网站地址和浏览器隔离，清理网站数据会删除缓存；JSON 文件是可带走的完整书库。

**打开 JSON 书库** 用于加载整份文件；**批量导入** 用于追加书目。批量导入会跳过已经存在的相同文件来源，首次导入真实书目会替换示例。

## 本地启动

无需 `npm install`。需要 Python 3；验证代码时需要 Node.js 20 或更高版本。

```sh
npm run dev
```

打开终端显示的本地地址 `http://localhost:4173`。也可以在 macOS 双击 `启动书库.command`。不要直接双击 `index.html`，浏览器需要 HTTP 来加载 JavaScript 模块。

```sh
npm run check
npm test
```

## 用 GitHub Desktop 发布

本地 Git 仓库已准备在这个 `bluebooks` 文件夹中，默认分支为 `main`。

1. GitHub Desktop → **File → Add Local Repository**，选择这个 `bluebooks` 文件夹。
2. 点击 **Publish repository**，仓库名填写 **bluebooks**。
3. 取消勾选 **Keep this code private**，发布为公开仓库。
4. 在 GitHub Desktop 点击 **Push origin**，把最新的根目录布局上传到 GitHub。
5. 网页打开仓库 → **Settings → Pages → Build and deployment → Source → Deploy from a branch**。
6. Branch 选择 **main**，文件夹选择 **/ (root)**，点击 **Save**。
7. 等 GitHub 自动发布完成，刷新 Pages 设置页，点击 **Visit site**。

以后向 `main` 分支 **Push origin**，GitHub Pages 会自动更新网站，无需手动运行发布工作流。项目另外保留了代码检查工作流，它只运行语法检查与测试，不负责发布。

流程采用 [GitHub Pages 官方分支发布方式](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。网页文件直接位于仓库根目录，`.nojekyll` 用于直接发布静态资源。代码使用相对资源路径，适配 `/bluebooks/` 项目站点。

## 导入大量书籍

使用页面中的 **批量导入 → 下载 CSV 模板**，或参考 `examples/import-template.csv`。CSV 使用 UTF-8 编码。

```csv
书名,作者,分类,网盘,格式,链接,路径,ISBN,状态,笔记
我的第一本书,作者姓名,文学,百度网盘,EPUB,,/电子书/我的第一本书.epub,,未读,
```

「书名」必填；推荐补充作者或有效 ISBN。网盘名称使用 `百度网盘`、`阿里云盘`、`夸克网盘`、`其他`。同一书籍的不同来源可以各占一行。状态支持中文或 `unread` / `reading` / `read`；链接仅接受 HTTP / HTTPS。

支持带逗号、换行和引号的标准 CSV。单次文件最大 25 MB、最多 100,000 条记录；实际容量与导入速度取决于设备和浏览器配额。搜索和列表分页在本机完成。

不会自动登录或扫描网盘，不下载、上传或删除任何电子书。需要为书目填写现成的文件 / 分享链接；只有路径而没有链接的书籍仍可收录，但不能直接打开网盘文件。

## 重复与阅读记录

- 有效 ISBN-10 会转换为 ISBN-13；相同 ISBN 视为同一版本。
- 缺少 ISBN 时，只按规范化的书名和作者严格匹配，保留 C++ / C#、版次等有意义的差别。
- 有效但不同的 ISBN 不会自动归并；未知作者且无有效 ISBN 的书目保持独立。
- 识别到重复时列表先集中显示，进入 **重复整理** 可归并底层条目。归并只影响目录，保留网盘文件和所有不同来源。
- 新来源不会把已有的已读状态、评分和笔记重置。冲突状态优先保留已读，其次在读；主动修改状态会更新该书的所有目录条目。
- 导入历史已读书目时，未提供有效 `finishedAt` 的记录保持「完成日期未记录」，不会用导入当天代替读完日期，也不会计入某年的读完数量。手动将一本书标为已读时，会记录当天日期。
- 此功能按书目信息匹配，不读取电子书内容，也不进行文件哈希去重。

## 文件结构

```text
index.html             网站首页（仓库根目录）
style.css              样式与手机布局
app.js                 页面和交互
core.js                导入、验证、分组、归并、JSON 恢复
storage.js             本机 IndexedDB 草稿缓存
seed.js                明确标注的示例书目
.nojekyll              禁用 Jekyll，直接发布静态资源
tests/                 Node.js 原生测试，无需安装测试框架
examples/              安全的 JSON 与 CSV 示例
.github/workflows/     代码检查配置（不负责发布）
```

公开仓库只放应用源码和安全示例。真实 `library.json`、备份及电子书扩展名已经加入 `.gitignore`；请不要把含私人分享链接的书库文件强制提交到公开仓库。

本项目没有自动同步、云端登录或网盘 API 接入。GitHub Pages 发布需要你在 GitHub Desktop 和仓库设置中完成上述操作。
