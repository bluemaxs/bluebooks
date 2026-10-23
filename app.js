import {
  STORAGE_KEY,
  DRIVES,
  STATUSES,
  escapeHTML as e,
  safeURL,
  groupBooks,
  parseCSV,
  prepareImport,
  mergeGroup,
  appendBooks,
  restoreLibrary,
} from "./core.js";
import { demoBooks } from "./seed.js";
import { readLibrary, writeLibrary } from "./storage.js";

const paths = {
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 3H20v19H6.5A2.5 2.5 0 0 1 4 19.5v-14A2.5 2.5 0 0 1 6.5 3Z",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  read: "m7 11 3 3 7-7M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
  copy: "M9 9h12v12H9zM5 15H3V3h12v2",
  cloud: "M7 18a5 5 0 0 1-1-9.9A7 7 0 0 1 19 8a5 5 0 0 1 0 10H7Z",
  search: "m21 21-5-5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z",
  plus: "M12 5v14M5 12h14",
  upload: "M12 16V3m-5 5 5-5 5 5M3 15v6h18v-6",
  download: "M12 3v13m-5-5 5 5 5-5M3 17v4h18v-4",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  close: "m6 6 12 12M6 18 18 6",
  check: "m5 12 4 4L19 6",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z",
  external: "M14 3h7v7m-10 3L21 3M10 3H3v18h18v-7",
  clock: "M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
  folder: "M3 7V4h6l3 3h9v13H3Z",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z",
};
const icon = (name, cls = "") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.book}"/></svg>`;
const $ = (s) => document.querySelector(s);
const driveClass = (d) =>
  d === "百度网盘"
    ? "baidu"
    : d === "阿里云盘"
      ? "ali"
      : d === "夸克网盘"
        ? "quark"
        : "";
const driveMark = (d, small = false) =>
  `<span class="drive-dot ${driveClass(d)} ${small ? "source-mark" : ""}" title="${e(d)}">${d === "百度网盘" ? "百" : d === "阿里云盘" ? "阿" : d === "夸克网盘" ? "夸" : "云"}</span>`;
let storageBroken = false;
let state;
try {
  const saved = await readLibrary();
  let legacy;
  try {
    legacy = localStorage.getItem(STORAGE_KEY);
  } catch {}
  state =
    saved || (legacy ? JSON.parse(legacy) : { books: demoBooks(), demo: true });
  if (!state || !Array.isArray(state.books)) throw Error("invalid");
} catch {
  state = { books: [], demo: false };
  storageBroken = true;
}
let page = "library",
  tab = "all",
  query = "",
  category = "",
  drive = "",
  format = "",
  sort = "added",
  currentPage = 1;
let dialogBookId = null,
  importPending = null,
  toastTimer;
const pageNames = {
  library: "全部书籍",
  read: "已读书籍",
  favorites: "我的收藏",
  duplicates: "重复整理",
  drives: "网盘管理",
};
let cachedBooks, cachedGroups;
const groups = () => {
  if (cachedBooks !== state.books) {
    cachedBooks = state.books;
    cachedGroups = groupBooks(state.books);
  }
  return cachedGroups;
};
const syncChannel =
  typeof BroadcastChannel === "function"
    ? new BroadcastChannel("bluebooks-updates")
    : null;
async function persist(next) {
  try {
    await writeLibrary(next);
    syncChannel?.postMessage("updated");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    state = next;
    storageBroken = false;
    return true;
  } catch {
    toast("保存失败：浏览器存储不可用或已满，请先导出备份。");
    return false;
  }
}
function toast(msg) {
  $("#toast").textContent = msg;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 3800);
}
function navigate(to, newDrive = "") {
  page = to;
  tab = "all";
  query = "";
  category = "";
  drive = newDrive;
  format = "";
  currentPage = 1;
  history.replaceState(
    null,
    "",
    `#${page}${newDrive ? `?drive=${encodeURIComponent(newDrive)}` : ""}`,
  );
  render();
  window.scrollTo({ top: 0 });
}
async function updateGroup(id, change) {
  const book = groups().find((x) => x.ids.includes(id));
  if (!book) return false;
  return await persist({
    ...state,
    books: state.books.map((x) =>
      book.ids.includes(x.id)
        ? { ...x, ...change, updatedAt: new Date().toISOString() }
        : x,
    ),
  });
}
function nav() {
  const all = groups();
  const items = [
    ["library", "book", all.length],
    ["read", "read", all.filter((x) => x.status === "read").length],
    ["favorites", "heart", all.filter((x) => x.favorite).length],
    ["duplicates", "copy", all.filter((x) => x.ids.length > 1).length],
    ["drives", "cloud", null],
  ];
  $("#navigation").innerHTML = items
    .map(
      ([p, i, n]) =>
        `<button class="nav-item ${page === p && !drive ? "active" : ""}" data-page="${p}">${icon(i)}${pageNames[p]}${n !== null ? `<span class="count">${n}</span>` : ""}</button>`,
    )
    .join("");
  $("#drive-count").textContent = DRIVES.slice(0, 3).length;
  $("#drive-navigation").innerHTML = DRIVES.slice(0, 3)
    .map(
      (d) =>
        `<button class="nav-item ${drive === d ? "active" : ""}" data-drive="${e(d)}">${driveMark(d)}${e(d)}<span class="count">${all.filter((b) => b.sources.some((s) => s.drive === d)).length}</span></button>`,
    )
    .join("");
  $("#breadcrumb").textContent = drive || pageNames[page];
  $("#backup-button").innerHTML = icon("download") + "备份与数据管理";
}
function heading(
  title,
  subtitle,
  eyebrow = "MY LITTLE LIBRARY",
  buttons = true,
) {
  return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${subtitle}</p></div>${buttons ? `<div class="heading-buttons"><button class="button" data-action="import">${icon("upload")}批量导入</button><button class="button primary" data-action="add">${icon("plus")}添加书籍</button></div>` : ""}</div>`;
}
function stats() {
  const all = groups();
  const count = all.filter((x) => x.ids.length > 1).length;
  return `<div class="stats">${[
    ["藏书总量", all.length, "本", "跨网盘归集后的独立书目", "book"],
    [
      "正在阅读",
      all.filter((x) => x.status === "reading").length,
      "本",
      "与好书，保持连接",
      "book",
    ],
    [
      "已读书籍",
      all.filter((x) => x.status === "read").length,
      "本",
      "每一页，都算数",
      "read",
    ],
    [
      "待整理重复",
      count,
      "组",
      count ? "归并书目，保留所有来源" : "书架清清爽爽",
      "copy",
    ],
  ]
    .map(
      ([label, n, unit, foot, ico]) =>
        `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-icon">${icon(ico)}</div><div class="stat-number">${n}<small>${unit}</small></div><div class="stat-foot">${foot}</div></div>`,
    )
    .join("")}</div>`;
}
function filtered() {
  let all = [...groups()];
  if (page === "read") all = all.filter((x) => x.status === "read");
  if (page === "favorites") all = all.filter((x) => x.favorite);
  if (tab !== "all") all = all.filter((x) => x.status === tab);
  if (drive)
    all = all.filter((x) =>
      x.sources.some(
        (s) => s.drive === drive && (!format || s.format === format),
      ),
    );
  else if (format)
    all = all.filter((x) => x.sources.some((s) => s.format === format));
  if (category) all = all.filter((x) => x.category === category);
  if (query) {
    const q = query.toLocaleLowerCase().trim();
    all = all.filter((x) =>
      [
        x.title,
        x.author,
        x.isbn,
        x.category,
        x.notes,
        ...x.sources.map((s) => s.path),
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(q),
    );
  }
  return all.sort((a, b) =>
    sort === "title"
      ? a.title.localeCompare(b.title, "zh-CN")
      : sort === "finished"
        ? (b.finishedAt || "").localeCompare(a.finishedAt || "")
        : (b.addedAt || "").localeCompare(a.addedAt || ""),
  );
}
function controls() {
  const all = groups();
  const cats = [...new Set(all.map((x) => x.category))].sort((a, b) =>
    a.localeCompare(b, "zh-CN"),
  );
  const formats = [
    ...new Set(all.flatMap((x) => x.sources.map((s) => s.format))),
  ].sort();
  return `<div class="toolbar"><div class="tabs">${(page === "read"
    ? [["all", "阅读足迹"]]
    : page === "favorites"
      ? [["all", "心头好书"]]
      : [
          ["all", "全部"],
          ["unread", "未读"],
          ["reading", "在读"],
          ["read", "已读"],
        ]
  )
    .map(
      ([k, label]) =>
        `<button class="tab ${tab === k ? "active" : ""}" data-tab="${k}">${label}<span>${all.filter((x) => (page !== "read" || x.status === "read") && (page !== "favorites" || x.favorite) && (!drive || x.sources.some((s) => s.drive === drive)) && (k === "all" || x.status === k)).length}</span></button>`,
    )
    .join(
      "",
    )}</div></div><div class="filters"><label class="search-box">${icon("search")}<input id="search-input" type="search" placeholder="搜索书名、作者、ISBN 或笔记…" value="${e(query)}" aria-label="搜索书籍"></label><select class="filter-select" id="category-filter" aria-label="分类"><option value="">全部分类</option>${cats.map((c) => `<option ${category === c ? "selected" : ""}>${e(c)}</option>`).join("")}</select><select class="filter-select" id="drive-filter" aria-label="网盘"><option value="">全部网盘</option>${DRIVES.map((d) => `<option ${drive === d ? "selected" : ""}>${e(d)}</option>`).join("")}</select><select class="filter-select" id="format-filter" aria-label="文件格式"><option value="">全部格式</option>${formats.map((f) => `<option ${format === f ? "selected" : ""}>${e(f)}</option>`).join("")}</select><select class="filter-select" id="sort-filter" aria-label="排序"><option value="added" ${sort === "added" ? "selected" : ""}>最近添加</option><option value="title" ${sort === "title" ? "selected" : ""}>书名排序</option>${page === "read" ? `<option value="finished" ${sort === "finished" ? "selected" : ""}>最近读完</option>` : ""}</select><span id="result-count" class="result-count"></span></div>`;
}
function list(books) {
  return `<div class="book-list"><div class="list-row list-head"><span>书名 / 作者</span><span>分类</span><span>网盘来源 / 格式</span><span>阅读状态</span><span></span></div>${books.map((b) => `<article class="list-row"><button class="list-name book-open" data-book="${e(b.id)}"><span class="list-book-symbol">${icon("book")}</span><span class="list-title-copy"><span class="book-title">${e(b.title)}</span><span class="book-author">${e(b.author)}</span></span>${b.favorite ? `<span class="inline-favorite">${icon("heart")}</span>` : ""}</button><span class="list-category">${e(b.category)}</span><div class="list-sources">${[...new Set(b.sources.map((s) => s.drive))].map((d) => `<span class="list-drive" title="${e(d)}">${driveMark(d, true)}<span>${e(d.replace("网盘", ""))}</span></span>`).join("")}<span class="list-formats">${e([...new Set(b.sources.map((s) => s.format))].join(" / "))}</span></div><span class="list-status ${b.status}">${b.status === "read" ? icon("check") : b.status === "reading" ? icon("book") : icon("clock")}${STATUSES[b.status]}</span><button class="list-action" data-book="${e(b.id)}">详情 →</button></article>`).join("")}</div>`;
}
function empty(
  title = "暂时没有找到书籍",
  desc = "换个关键词或筛选条件，让好书重新出现。",
  action = "reset",
  button = "重置筛选",
) {
  return `<div class="empty-state">${icon("book")}<h3>${title}</h3><p>${desc}</p><button class="button" data-action="${action}">${button}</button></div>`;
}
function renderResults() {
  const all = filtered();
  const pages = Math.max(1, Math.ceil(all.length / 18));
  currentPage = Math.min(currentPage, pages);
  const start = (currentPage - 1) * 18;
  const visible = all.slice(start, start + 18);
  $("#result-count").textContent = `共 ${all.length} 本书籍`;
  $("#results").innerHTML = all.length
    ? list(visible) +
      (pages > 1
        ? `<div class="pagination"><button data-pageno="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""} aria-label="上一页">‹</button>${Array.from(
            { length: pages },
            (_, i) => i + 1,
          )
            .filter(
              (i) => i === 1 || i === pages || Math.abs(i - currentPage) < 2,
            )
            .map(
              (i, j, arr) =>
                `${j && i - arr[j - 1] > 1 ? "<span>…</span>" : ""}<button class="${i === currentPage ? "current" : ""}" data-pageno="${i}">${i}</button>`,
            )
            .join(
              "",
            )}<button data-pageno="${currentPage + 1}" ${currentPage === pages ? "disabled" : ""} aria-label="下一页">›</button><span>${start + 1}–${start + visible.length} / ${all.length} 本</span></div>`
        : "")
    : state.books.length
      ? empty()
      : empty(
          "你的书岛，等第一本书靠岸",
          "添加书籍，或批量导入网盘书目。文件留在原处，书目在这里相遇。",
          "import",
          "导入我的书目",
        );
}
function readSummary() {
  const all = groups().filter((x) => x.status === "read");
  const year = new Date().getFullYear();
  const yearRead = all.filter(
    (x) => x.finishedAt && new Date(x.finishedAt).getFullYear() === year,
  );
  const notes = all.filter((x) => x.notes).length;
  return `<div class="read-summary"><div><strong>${yearRead.length}</strong><p>${year} 年读完 / 本</p></div><div><strong>${notes}</strong><p>留下阅读笔记 / 本</p></div><div class="read-quote">「读过的书，都藏在你的气质里。」</div></div>`;
}
function duplicatePage() {
  const dupes = groups().filter((x) => x.ids.length > 1);
  return (
    heading(
      "把好书，整理在一起",
      "归并重复的书目，保留每一个网盘来源。",
      "A TIDIER BOOKSHELF",
      false,
    ) +
    `<div class="section-note">${icon("copy")}<span>按有效 ISBN，或完全一致的书名与作者识别重复。不同 ISBN 的版本分别保留；归并只整理目录，不会删除网盘中的文件。</span>${dupes.length ? '<button class="button small" data-action="merge-all">全部归并</button>' : ""}</div>` +
    (dupes.length
      ? `<div class="selection-info">发现 ${dupes.length} 组重复书目 · 归并后仍可在书籍详情中选择所有来源</div><div class="duplicates-list">${dupes.map((b) => `<article class="duplicate-card"><div class="duplicate-symbol">${icon("copy")}</div><div class="duplicate-info"><h3>${e(b.title)}</h3><p>${e(b.author)} · ${b.ids.length} 条书目 · ${b.sources.length} 个文件来源</p><div class="duplicate-sources">${b.sources.map((s) => `<span class="source-chip">${driveMark(s.drive)}${e(s.drive)} · ${e(s.format)}</span>`).join("")}</div></div><button class="button" data-merge="${e(b.id)}">${icon("copy")}归并书目</button></article>`).join("")}</div>`
      : empty(
          "书架，清清爽爽",
          "目前没有待归并的重复条目。导入后，这里会自动识别相同书目的重复记录。",
          "library",
          "回到书架",
        ))
  );
}
function drivesPage() {
  const all = groups();
  return (
    heading(
      "散落各处，尽在一处",
      "文件保留在原网盘，书屿为你整理统一入口。",
      "YOUR CONNECTED SHELVES",
      false,
    ) +
    `<div class="section-note">${icon("cloud")}<span>当前使用书目链接管理模式，尚未连接网盘 API。支持手动添加分享链接或导入书目 CSV / JSON；不需要提供网盘密码。</span></div><div class="drive-cards">${DRIVES.slice(
      0,
      3,
    )
      .map(
        (d) =>
          `<article class="drive-card">${driveMark(d)}<h3>${d}</h3><p>${d === "百度网盘" ? "你的主力藏书空间，把散落的收藏整理成一座书岛。" : "让每一份收藏，都能在同一个书架被找到。"}</p><div class="drive-stat">${all.filter((x) => x.sources.some((s) => s.drive === d)).length}<small>本书已收录</small></div><p>链接目录模式 · 未连接自动同步</p><button class="button" data-drive="${e(d)}">浏览此网盘书籍 ${icon("arrow")}</button></article>`,
      )
      .join(
        "",
      )}</div><div class="section-note">${icon("folder")}<span>有大量文件？先准备包含书名、作者、网盘、格式和链接的 CSV。相同书目集中展示，重复记录可以随时归并。</span><button class="button small" data-action="import">批量导入</button></div>`
  );
}
function render() {
  nav();
  let content = "";
  if (storageBroken)
    content +=
      '<div class="storage-warning">浏览器存储无法读取。导入或修改前，请检查浏览器存储权限；导出备份可保存当前数据。</div>';
  if (page === "duplicates") content += duplicatePage();
  else if (page === "drives") content += drivesPage();
  else {
    content += heading(
      page === "read"
        ? "读过的书，走过的路"
        : page === "favorites"
          ? "偏爱的书，值得再读"
          : drive
            ? "在这里，遇见你的藏书"
            : "我的电子书库",
      page === "read"
        ? "那些读过的文字，终会成为你的一部分。"
        : page === "favorites"
          ? "为心头好留个位置，随时重逢。"
          : "把散落各个网盘的好书，收进同一座书屿。",
      page === "read"
        ? "MY READING JOURNEY"
        : page === "favorites"
          ? "BOOKS CLOSE TO HEART"
          : "MY LITTLE LIBRARY",
    );
    content +=
      page === "library" ? stats() : page === "read" ? readSummary() : "";
    content += controls();
    if (state.demo)
      content += `<div class="demo-notice"><span>当前为示例书库 · 未连接你的网盘，可打开自己的 JSON 文件。</span><button class="text-button" data-action="clear-demo">清空示例，开始我的书库</button></div>`;
    content += '<div id="results"></div>';
  }
  $("#main").innerHTML = content;
  if ($("#results")) renderResults();
}
function openBook(id) {
  const b = groups().find((x) => x.ids.includes(id));
  if (!b) return;
  dialogBookId = b.id;
  const d = $("#book-dialog");
  d.innerHTML = `<div class="dialog-header"><h2>书籍详情</h2><button class="icon-button" data-close="book-dialog" aria-label="关闭">${icon("close")}</button></div><div class="dialog-body"><div class="detail-top"><div class="detail-book-icon">${icon("book")}</div><div class="detail-copy"><h2>${e(b.title)}</h2><p>${e(b.author)}</p><span class="detail-category">${e(b.category)}</span><p style="margin-top:14px;font-size:10px">${b.isbn ? `ISBN ${e(b.isbn)}<br>` : ""}${b.status === "read" ? (b.finishedAt ? `读完于 ${e(new Date(b.finishedAt).toLocaleDateString("zh-CN"))}` : "已读 · 完成日期未记录") : `收录于 ${e(new Date(b.addedAt).toLocaleDateString("zh-CN"))}`}</p><button class="button small" data-favorite="${e(b.id)}">${icon("heart")}${b.favorite ? "已收藏" : "收藏这本书"}</button></div></div><div class="detail-label">我的阅读状态</div><div class="status-control">${Object.entries(
    STATUSES,
  )
    .map(
      ([k, v]) =>
        `<button class="${b.status === k ? "selected" : ""}" data-status="${k}">${v}</button>`,
    )
    .join(
      "",
    )}</div><div class="detail-label">文件来源 <small>${b.sources.length} 个文件 · 原网盘保存</small></div>${b.sources.map((s, i) => `<div class="source-row">${driveMark(s.drive)}<div class="source-copy">${e(s.drive)} <span class="format-tag">${e(s.format)}</span><div class="source-path">${e(s.path || "未填写文件路径")}</div></div>${safeURL(s.url) ? `<a class="button small" href="${e(safeURL(s.url))}" target="_blank" rel="noopener noreferrer">打开网盘 ${icon("external")}</a>` : `<button class="button small" data-source-edit="${i}">${state.demo ? "示例 · 无链接" : "添加链接"}</button>`}</div>`).join("")}<div class="detail-label">我的评分 <small>再次点击当前星级可清除</small></div><div class="stars" aria-label="我的评分">${[1, 2, 3, 4, 5].map((n) => `<button class="${b.rating >= n ? "filled" : ""}" data-rating="${n}" aria-label="${n} 星">★</button>`).join("")}</div><label for="book-notes" class="detail-label">阅读笔记 <small>只保存在当前浏览器</small></label><textarea id="book-notes" class="notes-field" placeholder="记下一句话，或此刻的感受…">${e(b.notes || "")}</textarea></div><div class="dialog-footer"><button class="button small danger" data-action="delete-book">${icon("trash")}移出书库</button><div style="display:flex;gap:8px"><button class="button small" data-action="edit-book">编辑书目</button><button class="button primary small" data-action="save-notes">保存笔记</button></div></div>`;
  if (!d.open) d.showModal();
}
function openAdd(editBook = null) {
  const b = editBook;
  const s = b?.sources[0] || {};
  const d = $("#form-dialog");
  d.innerHTML = `<form id="book-form"><div class="dialog-header"><h2>${b ? "编辑书目" : "让一本好书靠岸"}</h2><button type="button" class="icon-button" data-close="form-dialog" aria-label="关闭">${icon("close")}</button></div><div class="dialog-body"><p class="form-intro">记录书籍信息与网盘入口，文件继续保留在原网盘。${!b && state.demo ? "添加第一本真实书籍时，将替换当前示例书库。" : ""}${b && b.sources.length > 1 ? "这里编辑首个文件来源，其他来源完整保留。" : ""}</p><div class="form-grid"><label class="form-field">书名 *<input name="title" required maxlength="300" value="${e(b?.title || "")}" placeholder="例如：山茶文具店"></label><label class="form-field">作者<input name="author" maxlength="200" value="${e(b?.author || "")}" placeholder="作者姓名，用于识别重复"></label><label class="form-field">分类<input name="category" maxlength="60" list="categories" value="${e(b?.category || "文学")}"><datalist id="categories">${["文学", "历史", "心理", "社会", "成长", "科学", "技术", "艺术", "未分类"].map((x) => `<option>${x}</option>`).join("")}</datalist></label><label class="form-field">ISBN<input name="isbn" maxlength="30" value="${e(b?.isbn || "")}" placeholder="选填，优先识别相同版本"></label><label class="form-field">网盘<select name="drive">${DRIVES.map((x) => `<option ${s.drive === x ? "selected" : ""}>${x}</option>`).join("")}</select></label><label class="form-field">文件格式<select name="format">${[...new Set(["EPUB", "PDF", "MOBI", "AZW3", "TXT", s.format].filter(Boolean))].map((x) => `<option ${s.format === x ? "selected" : ""}>${e(x)}</option>`).join("")}</select></label><label class="form-field full">网盘链接<input name="url" type="url" value="${e(s.url || "")}" placeholder="https://pan.baidu.com/s/…"><small>可填写带提取码的完整分享链接；仅允许 http / https。</small></label><label class="form-field full">文件路径（选填）<input name="path" maxlength="2000" value="${e(s.path || "")}" placeholder="/电子书/文学/山茶文具店.epub"></label></div><div id="form-error" class="form-error" role="alert"></div></div><div class="dialog-footer"><span></span><button class="button primary" type="submit">${b ? "保存修改" : "添加到书库"}</button></div></form>`;
  $("#book-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(ev.target));
    if (data.url && !safeURL(data.url)) {
      $("#form-error").textContent = "请输入有效的 http / https 链接。";
      return;
    }
    const title = data.title.trim();
    if (!title) {
      $("#form-error").textContent = "请填写书名。";
      return;
    }
    let next;
    if (b) {
      const source = {
        ...s,
        drive: data.drive,
        format: data.format,
        url: safeURL(data.url),
        path: data.path,
      };
      const changes = {
        title,
        author: data.author.trim() || "未知作者",
        category: data.category.trim() || "未分类",
        isbn: data.isbn.trim(),
        sources: [source, ...b.sources.slice(1)],
      };
      const { key, ids, ...old } = b;
      next = {
        ...state,
        books: [
          ...state.books.filter((x) => !ids.includes(x.id)),
          { ...old, ...changes, updatedAt: new Date().toISOString() },
        ],
      };
    } else {
      const prepared = prepareImport([data]).books[0];
      next = {
        demo: false,
        books: [...(state.demo ? [] : state.books), prepared],
      };
    }
    if (await persist(next)) {
      d.close();
      $("#book-dialog").close();
      render();
      toast(b ? "书目信息已更新" : "好书已靠岸，欢迎入藏。");
    }
  });
  d.showModal();
}
function openImport() {
  importPending = null;
  const d = $("#form-dialog");
  d.innerHTML = `<div class="dialog-header"><h2>把散落的书，带回书屿</h2><button class="icon-button" data-close="form-dialog" aria-label="关闭">${icon("close")}</button></div><div class="dialog-body"><p class="form-intro">支持网盘书目 CSV 和书屿 JSON 备份。导入只读取书目信息，不上传电子书；相同的来源记录会自动跳过。</p><button class="text-button" data-action="template">下载 CSV 模板（含百度 / 阿里 / 夸克示例）</button><label class="upload-area">${icon("upload")}<strong>选择要导入的书目文件</strong><small>CSV / JSON · UTF-8 编码 · 最大 25 MB</small><input type="file" id="import-file" accept=".csv,.json,text/csv,application/json"></label><div class="import-help">CSV 表头：<code>书名,作者,分类,网盘,格式,链接,路径,ISBN,状态,笔记</code><br>「书名」必填；状态支持 未读 / 在读 / 已读。网盘名称使用 百度网盘 / 阿里云盘 / 夸克网盘。JSON 可直接恢复完整备份。<br>没有作者或有效 ISBN 的条目保留独立记录，避免误归并。</div><div id="import-preview"></div><div id="form-error" class="form-error" role="alert"></div></div><div class="dialog-footer"><span></span><button class="button primary" id="confirm-import" disabled>确认导入</button></div>`;
  $("#import-file").addEventListener("change", async (ev) => {
    importPending = null;
    $("#confirm-import").disabled = true;
    $("#form-error").textContent = "";
    $("#import-preview").innerHTML = "";
    const file = ev.target.files[0];
    if (!file) return;
    try {
      if (file.size > 25 * 1024 * 1024)
        throw Error("文件超过 25 MB，请拆分后导入。");
      const text = await file.text();
      const parsed = file.name.toLowerCase().endsWith(".json")
        ? JSON.parse(text)
        : parseCSV(text);
      importPending = prepareImport(parsed);
      $("#import-preview").innerHTML =
        `<div class="import-preview">已识别 ${importPending.books.length} 条书目${importPending.skipped ? `，跳过 ${importPending.skipped} 条无书名记录` : ""}。<br>前几本：${importPending.books
          .slice(0, 3)
          .map((b) => e(b.title))
          .join(
            "、",
          )}<br>${state.demo ? "确认后将替换示例书库。" : "导入将追加至当前书库。"}阅读状态、笔记与评分均会保留。</div>`;
      $("#confirm-import").disabled = false;
    } catch (err) {
      $("#form-error").textContent = "无法导入：" + err.message;
    }
  });
  $("#confirm-import").addEventListener("click", async () => {
    if (!importPending) return;
    const base = state.demo ? [] : state.books;
    const result = appendBooks(base, importPending.books);
    if (await persist({ books: result.books, demo: false })) {
      d.close();
      navigate("library");
      toast(
        `已导入 ${result.added} 条书目${result.duplicates ? `，跳过 ${result.duplicates} 条相同来源` : ""}${state.demo ? "，示例书库已替换" : ""}`,
      );
    }
  });
  d.showModal();
}
function download(name, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function exportBackup() {
  download(
    "library.json",
    JSON.stringify(
      {
        app: "bluebooks",
        version: 1,
        exportedAt: new Date().toISOString(),
        books: state.books,
      },
      null,
      2,
    ),
  );
  toast("library.json 已下载，请将它同步到其他设备。");
}
function openBackup() {
  const d = $("#form-dialog");
  d.innerHTML = `<div class="dialog-header"><h2>备份与数据管理</h2><button class="icon-button" data-close="form-dialog" aria-label="关闭">${icon("close")}</button></div><div class="dialog-body"><p class="form-intro">本机草稿自动缓存在浏览器。跨设备请保存 library.json，并在另一台设备选择「打开 JSON 书库」。修改后记得重新保存 JSON 文件。</p><div class="backup-options"><section class="backup-option"><h3>完整备份</h3><p>包含全部书目、文件来源、阅读状态、评分、完成日期和笔记。当前共 ${groups().length} 本书。</p><button class="button primary" data-action="export">${icon("download")}保存 JSON 文件</button></section><section class="backup-option"><h3>导入与恢复</h3><p>从 CSV 导入书目，或追加恢复一份完整 JSON 备份。相同来源不会重复添加。</p><button class="button" data-action="import">导入备份 / 书目</button></section><section class="backup-option"><h3>清空当前书库</h3><p>将清除本浏览器中全部书目与阅读记录，不影响任何网盘文件。请先导出备份。</p><button class="button danger" data-action="clear-all">清空数据</button>${!state.books.length ? '<button class="button" data-action="load-demo" style="margin-left:8px">载入示例</button>' : ""}</section></div></div>`;
  d.showModal();
}
function confirmDialog(title, desc, onConfirm, label = "确认") {
  const d = $("#form-dialog");
  if (d.open) d.close();
  d.innerHTML = `<div class="dialog-header"><h2>${title}</h2><button class="icon-button" data-close="form-dialog" aria-label="关闭">${icon("close")}</button></div><div class="dialog-body"><p class="form-intro">${desc}</p></div><div class="dialog-footer"><button class="button" data-close="form-dialog">取消</button><button id="confirm-action" class="button primary">${label}</button></div>`;
  $("#confirm-action").onclick = async () => {
    if ((await onConfirm()) !== false) d.close();
  };
  d.showModal();
}
async function mergeOne(id) {
  const b = groups().find((x) => x.ids.includes(id));
  if (b && (await persist({ ...state, books: mergeGroup(state.books, b) }))) {
    render();
    toast("书目已归并，所有文件来源均已保留。");
  }
}
async function stashNotes() {
  const notes = $("#book-notes");
  if (notes && dialogBookId) {
    const b = groups().find((x) => x.ids.includes(dialogBookId));
    if (b && notes.value !== (b.notes || ""))
      return await updateGroup(dialogBookId, { notes: notes.value });
  }
  return true;
}
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("button,a");
  if (!t) return;
  const ds = t.dataset;
  if (ds.close) {
    if (ds.close === "book-dialog" && !(await stashNotes())) return;
    $("#" + ds.close).close();
    return;
  }
  if (ds.page) {
    navigate(ds.page);
    return;
  }
  if (ds.drive) {
    navigate("library", ds.drive);
    return;
  }
  if (ds.tab) {
    tab = ds.tab;
    currentPage = 1;
    render();
    return;
  }
  if (ds.pageno) {
    currentPage = Number(ds.pageno);
    renderResults();
    return;
  }
  if (ds.book) {
    openBook(ds.book);
    return;
  }
  if (ds.favorite) {
    await stashNotes();
    const b = groups().find((x) => x.ids.includes(ds.favorite));
    if (b && (await updateGroup(b.id, { favorite: !b.favorite }))) {
      render();
      if ($("#book-dialog").open) openBook(b.id);
      toast(b.favorite ? "已取消收藏" : "已收进心头好书。");
    }
    return;
  }
  if (ds.merge) {
    await mergeOne(ds.merge);
    return;
  }
  if (ds.status) {
    if (!(await stashNotes())) return;
    const b = groups().find((x) => x.ids.includes(dialogBookId));
    if (
      b &&
      (await updateGroup(b.id, {
        status: ds.status,
        finishedAt:
          ds.status === "read"
            ? b.finishedAt || new Date().toISOString()
            : null,
      }))
    ) {
      render();
      openBook(b.id);
      toast(`已标记为${STATUSES[ds.status]}`);
    }
    return;
  }
  if (ds.rating) {
    if (!(await stashNotes())) return;
    const b = groups().find((x) => x.ids.includes(dialogBookId));
    if (
      b &&
      (await updateGroup(b.id, {
        rating: b.rating === Number(ds.rating) ? 0 : Number(ds.rating),
      }))
    ) {
      render();
      openBook(b.id);
    }
    return;
  }
  if (ds.sourceEdit !== undefined) {
    let b = groups().find((x) => x.ids.includes(dialogBookId));
    if (state.demo) {
      toast("这是示例书目；导入真实书目后即可打开网盘。");
      return;
    }
    if (!(await stashNotes())) return;
    b = groups().find((x) => x.ids.includes(dialogBookId));
    const source = b.sources[Number(ds.sourceEdit)];
    const d = $("#form-dialog");
    d.innerHTML = `<form id="source-form"><div class="dialog-header"><h2>添加 ${e(source.drive)} 链接</h2><button type="button" class="icon-button" data-close="form-dialog" aria-label="关闭">${icon("close")}</button></div><div class="dialog-body"><label class="form-field">分享或文件链接<input name="url" type="url" required placeholder="https://…"></label><p id="form-error" class="form-error" role="alert"></p></div><div class="dialog-footer"><span></span><button class="button primary" type="submit">保存链接</button></div></form>`;
    $("#source-form").onsubmit = async (event) => {
      event.preventDefault();
      const url = safeURL(new FormData(event.target).get("url"));
      if (!url) {
        $("#form-error").textContent = "请输入有效的 http / https 链接。";
        return;
      }
      const sources = b.sources.map((s, i) =>
        i === Number(ds.sourceEdit) ? { ...s, url } : s,
      );
      const { key, ids, ...base } = b;
      if (
        await persist({
          ...state,
          books: [
            ...state.books.filter((x) => !ids.includes(x.id)),
            { ...base, sources, updatedAt: new Date().toISOString() },
          ],
        })
      ) {
        d.close();
        render();
        openBook(b.id);
        toast("网盘链接已保存。");
      }
    };
    d.showModal();
    return;
  }
  const a = ds.action;
  if (!a) return;
  if (a === "add") openAdd();
  else if (a === "import") {
    if ($("#form-dialog").open) $("#form-dialog").close();
    openImport();
  } else if (a === "export") exportBackup();
  else if (a === "open-json") $("#open-library-file").click();
  else if (a === "library") navigate("library");
  else if (a === "reset") {
    query = "";
    category = "";
    drive = "";
    format = "";
    tab = "all";
    currentPage = 1;
    render();
  } else if (a === "save-notes") {
    if (await stashNotes()) {
      render();
      toast("阅读笔记已保存。");
    }
  } else if (a === "edit-book") {
    if (!(await stashNotes())) return;
    openAdd(groups().find((x) => x.ids.includes(dialogBookId)));
  } else if (a === "delete-book") {
    const b = groups().find((x) => x.ids.includes(dialogBookId));
    confirmDialog(
      "把这本书移出书库？",
      `将移除《${e(b.title)}》的目录、阅读记录与全部来源链接，不会删除网盘文件。`,
      async () => {
        if (
          !(await persist({
            ...state,
            books: state.books.filter((x) => !b.ids.includes(x.id)),
          }))
        )
          return false;
        $("#book-dialog").close();
        render();
        toast("已移出书库。");
      },
      "移出书库",
    );
  } else if (a === "clear-demo")
    confirmDialog(
      "开启你自己的书库",
      "将移除全部示例书目。你可以随后添加书籍或导入真实书目。",
      async () => {
        if (!(await persist({ books: [], demo: false }))) return false;
        render();
        toast("书架已准备好，等你的好书靠岸。");
      },
      "清空示例",
    );
  else if (a === "clear-all")
    confirmDialog(
      "确认清空全部数据？",
      "这会删除当前浏览器保存的书目、链接、笔记和阅读记录，无法撤销。网盘文件不受影响。请先导出备份。",
      async () => {
        if (!(await persist({ books: [], demo: false }))) return false;
        $("#book-dialog").close();
        render();
        toast("本浏览器书库已清空。");
      },
      "确认清空",
    );
  else if (a === "load-demo") {
    if (await persist({ books: demoBooks(), demo: true })) {
      $("#form-dialog").close();
      navigate("library");
    }
  } else if (a === "merge-all") {
    const dupes = groups().filter((x) => x.ids.length > 1);
    confirmDialog(
      "归并所有重复书目？",
      `将整理 ${dupes.length} 组重复记录。所有网盘来源与笔记会保留；阅读状态优先保留已读，其次在读，避免新增来源覆盖阅读进度。`,
      async () => {
        let books = state.books;
        dupes.forEach((b) => (books = mergeGroup(books, b)));
        if (!(await persist({ ...state, books }))) return false;
        render();
        toast(`已归并 ${dupes.length} 组书目。`);
      },
      "全部归并",
    );
  } else if (a === "template")
    download(
      "bluebooks-import-template.csv",
      "\uFEFF书名,作者,分类,网盘,格式,链接,路径,ISBN,状态,笔记\r\n我的第一本书,作者姓名,文学,百度网盘,EPUB,,/电子书/我的第一本书.epub,,未读,\r\n另一本文学书,另一位作者,文学,阿里云盘,PDF,,/收藏/另一本文学书.pdf,,在读,\r\n读过的一本书,作者姓名,历史,夸克网盘,EPUB,,/图书/读过的一本书.epub,,已读,我的阅读感想\r\n",
      "text/csv;charset=utf-8",
    );
});
document.addEventListener("input", (ev) => {
  if (ev.target.id === "search-input") {
    query = ev.target.value;
    currentPage = 1;
    renderResults();
  }
});
document.addEventListener("change", (ev) => {
  const id = ev.target.id;
  if (id === "category-filter") category = ev.target.value;
  else if (id === "drive-filter") drive = ev.target.value;
  else if (id === "format-filter") format = ev.target.value;
  else if (id === "sort-filter") sort = ev.target.value;
  else return;
  currentPage = 1;
  nav();
  renderResults();
});
$("#backup-button").onclick = openBackup;
$("#search-shortcut").onclick = () => {
  if (!$("#search-input")) navigate("library");
  $("#search-input").focus();
};
document.addEventListener("keydown", (ev) => {
  if ((ev.metaKey || ev.ctrlKey) && ev.key === "k") {
    ev.preventDefault();
    $("#search-shortcut").click();
  }
});
$("#book-dialog").addEventListener("cancel", async (ev) => {
  ev.preventDefault();
  if (await stashNotes()) $("#book-dialog").close();
});
$("#book-dialog").addEventListener("focusout", async (ev) => {
  if (ev.target.id === "book-notes") await stashNotes();
});
if (syncChannel)
  syncChannel.onmessage = async () => {
    try {
      const next = await readLibrary();
      if (next && Array.isArray(next.books)) {
        state = next;
        $("#book-dialog").close();
        $("#form-dialog").close();
        render();
        toast("已同步同一浏览器中另一标签页的修改。");
      }
    } catch {
      toast("另一标签页的数据无法读取，请导出备份。");
    }
  };
const initial = location.hash.slice(1).split("?");
if (pageNames[initial[0]]) {
  page = initial[0];
  drive = new URLSearchParams(initial[1]).get("drive") || "";
}
if (!storageBroken) await persist(state);
render();

$("#open-library-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  try {
    if (file.size > 25 * 1024 * 1024)
      throw new Error("书库文件超过 25 MB，请先拆分。");
    const next = restoreLibrary(JSON.parse(await file.text()));
    confirmDialog(
      "打开这份 JSON 书库？",
      `文件「${e(file.name)}」包含 ${groupBooks(next.books).length} 本书。打开后将替换本机草稿；如需保留当前书库，请先取消并保存 JSON。`,
      async () => {
        if (!(await persist(next))) return false;
        $("#book-dialog").close();
        navigate("library");
        toast("JSON 书库已打开。修改后，请重新保存 JSON 文件。");
      },
      "打开书库",
    );
  } catch (error) {
    toast("无法打开：" + error.message);
  }
});
