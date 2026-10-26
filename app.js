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
  readingCount,
  recordRead,
  readingCountForYear,
  readingCountForSelection,
  uid,
} from "./core.js";
import { ProjectController } from "./project-ui.js";
import { mountSourceEditor, openSplitDialog } from "./book-editors.js";
import { PROJECT_TYPES } from "./projects.js";
import { initialLibrary, loadDefaultLibrary } from "./default-library.js";
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
  reader: "M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM8 7h8M8 11h8M11 17h2",
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
let defaultLoadError = "";
let state, savedState;
try {
  savedState = await readLibrary();
  if (!savedState) {
    let legacy;
    try { legacy = localStorage.getItem(STORAGE_KEY); } catch {}
    if (legacy) savedState = JSON.parse(legacy);
  }
  if (savedState && !Array.isArray(savedState.books)) throw Error("invalid");
} catch {
  savedState = null;
  storageBroken = true;
}
try {
  state = await initialLibrary(savedState);
} catch {
  state = { books: [], demo: false };
  defaultLoadError = "默认书库暂时无法加载，请检查网络后重试，也可以打开自己的 JSON 文件。";
}
let page = "library",
  tab = "all",
  query = "",
  category = "",
  drive = "",
  format = "",
  sort = "added",
  readYear = "",
  currentPage = 1;
let dialogBookId = null,
  importPending = null,
  toastTimer;
const pageNames = {
  library: "全部书籍",
  read: "已读书籍",
  favorites: "我的收藏",
  duplicates: "重复整理",
  prices: "价格回收计划",
  wishlist: "待看清单",
  readers: "阅读器内容记录",
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
const projects = new ProjectController({
  page: () => page, toast, confirm: confirmDialog, navigate, render, download,
  books: () => groups(),
  notify: kind => syncChannel?.postMessage({dataset: kind}),
});
await projects.load();
async function persist(next) {
  try {
    await writeLibrary(next);
    syncChannel?.postMessage("updated");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    state = next;
    storageBroken = false;
    defaultLoadError = "";
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
  projects.resetFilters();
  tab = "all";
  query = "";
  category = "";
  drive = newDrive;
  format = "";
  readYear = "";
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
    ["read", "read", all.reduce((n, x) => n + readingCount(x), 0)],
    ["favorites", "heart", all.filter((x) => x.favorite).length],
    ["duplicates", "copy", all.filter((x) => x.ids.length > 1).length],
    ["prices", "list", projects.count("prices")],
    ["wishlist", "clock", projects.count("wishlist")],
    ["readers", "reader", projects.count("readers")],
  ];
  $("#navigation").innerHTML = items
    .map(
      ([p, i, n]) =>
        `<button class="nav-item ${page === p && !drive ? "active" : ""}" data-page="${p}">${icon(i)}${pageNames[p]}${n !== null ? `<span class="count">${n}</span>` : ""}</button>`,
    )
    .join("") + `<button class="nav-item mobile-backup" data-action="backup">${icon("download")}备份与数据管理</button>`;
  $("#drive-count").textContent = DRIVES.slice(0, 3).length;
  $("#drive-navigation").innerHTML = DRIVES.slice(0, 3)
    .map(
      (d) =>
        `<button class="nav-item ${drive === d ? "active" : ""}" data-drive="${e(d)}">${driveMark(d)}${e(d)}<span class="count">${all.filter((b) => b.sources.some((s) => s.drive === d)).length}</span></button>`,
    )
    .join("");
  $("#breadcrumb").textContent = drive || pageNames[page];
  $("#backup-button").innerHTML = icon("download") + "备份与数据管理";
  const menu = $("#navigation"), active = $("#navigation .active");
  if (active && menu.scrollWidth > menu.clientWidth) {
    const item = active.getBoundingClientRect(), view = menu.getBoundingClientRect();
    if (item.right > view.right) menu.scrollLeft += item.right - view.right;
    else if (item.left < view.left) menu.scrollLeft -= view.left - item.left;
  }
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
      "已读总数（含重读）",
      all.reduce((n, x) => n + readingCount(x), 0),
      "册次",
      `${all.filter(x => readingCount(x) > 0).length} 本独立书目，分卷分别统计`,
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
  if (page === "read") all = all.filter((x) => readingCountForSelection(x, readYear) > 0);
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
    ? [["all", `${readYear === "unknown" ? "未记录年份" : readYear ? readYear + " 年" : ""}阅读足迹`]]
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
        `<button class="tab ${tab === k ? "active" : ""}" data-tab="${k}">${label}<span>${all.filter((x) => (page !== "read" || readingCountForSelection(x, readYear) > 0) && (page !== "favorites" || x.favorite) && (!drive || x.sources.some((s) => s.drive === drive)) && (k === "all" || x.status === k)).length}</span></button>`,
    )
    .join(
      "",
    )}</div></div><div class="filters"><label class="search-box">${icon("search")}<input id="search-input" type="search" placeholder="搜索书名、作者、ISBN 或笔记…" value="${e(query)}" aria-label="搜索书籍"></label><select class="filter-select" id="category-filter" aria-label="分类"><option value="">全部分类</option>${cats.map((c) => `<option ${category === c ? "selected" : ""}>${e(c)}</option>`).join("")}</select><select class="filter-select" id="drive-filter" aria-label="网盘"><option value="">全部网盘</option>${DRIVES.map((d) => `<option ${drive === d ? "selected" : ""}>${e(d)}</option>`).join("")}</select><select class="filter-select" id="format-filter" aria-label="文件格式"><option value="">全部格式</option>${formats.map((f) => `<option ${format === f ? "selected" : ""}>${e(f)}</option>`).join("")}</select><select class="filter-select" id="sort-filter" aria-label="排序"><option value="added" ${sort === "added" ? "selected" : ""}>最近添加</option><option value="title" ${sort === "title" ? "selected" : ""}>书名排序</option>${page === "read" ? `<option value="finished" ${sort === "finished" ? "selected" : ""}>最近读完</option>` : ""}</select><span id="result-count" class="result-count"></span></div>`;
}
function list(books) {
  return `<div class="book-list"><div class="list-row list-head"><span>书名 / 作者</span><span>分类</span><span>网盘来源 / 格式</span><span>阅读状态</span><span></span></div>${books.map((b) => `<article class="list-row"><button class="list-name book-open" data-book="${e(b.id)}"><span class="list-book-symbol">${icon("book")}</span><span class="list-title-copy"><span class="book-title">${e(b.title)}</span><span class="book-author">${e(b.author)}${readingCount(b) ? `<span class="read-count-tag">读过 ${readingCount(b)} 次</span>` : ""}</span></span>${b.favorite ? `<span class="inline-favorite">${icon("heart")}</span>` : ""}</button><span class="list-category">${e(b.category)}</span><div class="list-sources">${[...new Set(b.sources.map((s) => s.drive))].map((d) => `<span class="list-drive" title="${e(d)}">${driveMark(d, true)}<span>${e(d.replace("网盘", ""))}</span></span>`).join("")}<span class="list-formats">${e([...new Set(b.sources.map((s) => s.format))].join(" / "))}</span></div><span class="list-status ${b.status}">${b.status === "read" ? icon("check") : b.status === "reading" ? icon("book") : icon("clock")}${STATUSES[b.status]}</span><button class="list-action" data-book="${e(b.id)}">详情 →</button></article>`).join("")}</div>`;
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
  $("#result-count").textContent = page === "read"
    ? `${readYear === "unknown" ? "未记录年份 · " : readYear ? readYear + " 年 · " : ""}${all.length} 本独立书目 · ${all.reduce((n, b) => n + readingCountForSelection(b, readYear), 0)} 册次（含重读）`
    : `共 ${all.length} 本书籍`;
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
  const all = groups().filter((x) => readingCount(x) > 0);
  const year = new Date().getFullYear();
  const yearCount = groups().reduce((n, x) => n + readingCountForYear(x, year), 0);
  const totalCount = groups().reduce((n, x) => n + readingCount(x), 0);
  const notes = all.filter((x) => x.notes).length;
  const years = [...new Set(groups().flatMap(b => b.readYears?.length ? b.readYears : b.finishedAt ? [new Date(b.finishedAt).getFullYear()] : []))].sort((a,b) => b-a);
  const unknown = all.reduce((n,b) => n + readingCountForSelection(b,"unknown"),0);
  const selections = [["", "全部年份", totalCount], ...years.map(y => [String(y), String(y), all.reduce((n,b) => n + readingCountForYear(b,y),0)]), ...(unknown ? [["unknown", "未记录年份", unknown]] : [])];
  const annualSummary = `<div class="reading-years" role="group" aria-label="按阅读年份筛选">${selections.map(([value,label,count]) => `<button type="button" class="reading-year ${readYear === value ? "active" : ""}" data-read-year="${value}" aria-pressed="${readYear === value}"><strong>${label}</strong> ${count} 册次</button>`).join("")}</div>`;
  return `<div class="read-summary"><div><strong>${yearCount}</strong><p>${year} 年已记录 / 次</p></div><div><strong>${totalCount}</strong><p>已读总数 / 册次（含重读）</p></div><div><strong>${notes}</strong><p>留下阅读笔记 / 本</p></div><div class="read-quote">「读过的书，都藏在你的气质里。」</div></div>${annualSummary}`;
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
function render() {
  nav();
  const project = projects.isProject(page);
  let content = "";
  if (storageBroken)
    content +=
      '<div class="storage-warning">浏览器存储无法读取。导入或修改前，请检查浏览器存储权限；导出备份可保存当前数据。</div>';
  if (defaultLoadError)
    content += `<div class="storage-warning" role="alert">${e(defaultLoadError)} <button class="button small" data-action="load-default">重试载入默认书库</button></div>`;
  if (project) content += projects.render(page);
  else if (page === "duplicates") content += duplicatePage();
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
    content += '<div id="results"></div>';
  }
  $("#main").innerHTML = content;
  if ($("#results")) renderResults();
  projects.renderResults();
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
    )}</div><div class="reread-control"><span class="read-count-tag">读过 ${readingCount(b)} 次</span><button class="button small" data-action="read-again">${readingCount(b) ? "再读一次 +1" : "记一次已读 +1"}</button>${b.readYears?.length ? `<small>已记录年份：${e(b.readYears.join("、"))}</small>` : ""}</div><div class="detail-label">网盘来源 <small>${b.sources.length} 处来源 · 原网盘保存</small></div>${!b.sources.length ? '<p class="source-empty">这本书已记录，网盘来源待补充。可在编辑书目中填写路径或链接。</p>' : ""}${b.sources.map((s, i) => `<div class="source-row">${driveMark(s.drive)}<div class="source-copy">${e(s.drive)} <span class="format-tag">${e(s.format)}</span><div class="source-path">${e(s.path || "未填写文件路径")}</div></div>${safeURL(s.url) ? `<a class="button small" href="${e(safeURL(s.url))}" target="_blank" rel="noopener noreferrer">打开网盘 ${icon("external")}</a>` : ""}</div>`).join("")}<div class="detail-label">我的评分 <strong class="rating-label">${b.rating > 0 ? `${e(b.rating)} / 5` : "未评分"}</strong><small>再次点击当前星级可清除</small></div><div class="stars" aria-label="我的评分">${[1, 2, 3, 4, 5].map((n) => `<button class="${b.rating >= n ? "filled" : ""}" data-rating="${n}" aria-label="${n} 星">★</button>`).join("")}</div><label for="book-notes" class="detail-label">阅读笔记 <small>本机缓存，保存 JSON 可备份</small></label><textarea id="book-notes" class="notes-field" placeholder="记下一句话，或此刻的感受…">${e(b.notes || "")}</textarea></div><div class="dialog-footer"><button class="button small danger" data-action="delete-book">${icon("trash")}移出书库</button><div style="display:flex;gap:8px"><button class="button small" data-action="split-book">拆分合集</button><button class="button small" data-action="edit-book">编辑书目</button><button class="button primary small" data-action="save-notes">保存笔记</button></div></div>`;
  if (!d.open) d.showModal();
}
function openAdd(editBook = null) {
  const b = editBook, d = $("#form-dialog");
  const categories = [...new Set([...groups().map(book=>book.category), '文学','历史','心理学','社会','成长','科学','技术','艺术','未分类'].filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  d.innerHTML = `<form id="book-form"><div class="dialog-header"><h2>${b ? "编辑书目" : "让一本好书靠岸"}</h2><button type="button" class="icon-button" data-close="form-dialog" aria-label="关闭">${icon("close")}</button></div><div class="dialog-body"><p class="form-intro">记录书籍信息与网盘入口，文件继续保留在原网盘。下方可管理全部来源和文件格式。</p><div class="form-grid"><label class="form-field">书名 *<input name="title" required maxlength="300" value="${e(b?.title || "")}" placeholder="例如：山茶文具店"></label><label class="form-field">作者<input name="author" maxlength="200" value="${e(b?.author || "")}" placeholder="作者姓名，用于识别重复"></label><div class="form-field"><label for="book-category">分类</label><div class="category-input-group"><input id="book-category" name="category" maxlength="60" value="${e(b?.category || "")}" placeholder="输入自定义分类" aria-describedby="category-help"><select id="category-preset" aria-label="选择已有分类"><option value="">选择分类</option>${categories.map(category=>`<option value="${e(category)}">${e(category)}</option>`).join("")}</select></div><small id="category-help">可选择已有分类，也可直接输入；留空归入未分类。</small></div><label class="form-field full independent-field"><span><input name="independent" type="checkbox" ${b?.workId ? "checked" : ""}> 按独立书目记录</span><small>分卷即使 ISBN 或合集文件相同，也保留为不同书目。</small></label><label class="form-field">阅读次数<input name="readCount" type="number" min="${b?.status === "read" ? 1 : 0}" max="100000" step="1" required value="${b ? readingCount(b) : 0}"><small>未知历史年份无需补填。</small></label><label class="form-field">ISBN<input name="isbn" maxlength="30" value="${e(b?.isbn || "")}" placeholder="选填，优先识别相同版本"></label></div><section id="source-editor"></section><div id="form-error" class="form-error" role="alert"></div></div><div class="dialog-footer"><span></span><button class="button primary" type="submit">${b ? "保存修改" : "添加到书库"}</button></div></form>`;
  $("#category-preset").onchange = event => {
    if (!event.target.value) return;
    $("#book-category").value = event.target.value;
    event.target.value = "";
  };
  const sources = mountSourceEditor($("#source-editor"), b?.sources || []);
  $("#book-form").addEventListener("submit", async ev => {
    ev.preventDefault(); $("#form-error").textContent = "";
    try {
      const data = Object.fromEntries(new FormData(ev.target));
      const title = data.title.trim();
      if (!title) throw Error("请填写书名。");
      const changes = {
        workId: data.independent ? b?.workId || uid() : "",
        title, author: data.author.trim() || "未知作者", category: data.category.trim() || "未分类",
        isbn: data.isbn.trim(), sources: sources.sources(), readCount: Number(data.readCount),
      };
      let next;
      if (b) {
        changes.readYears = (b.readYears || []).slice(0, changes.readCount);
        changes.finishedAt = changes.readCount < (b.readYears || []).length ? null : b.finishedAt;
        const {key,ids,...old} = b;
        next = {...state,books:[...state.books.filter(x=>!ids.includes(x.id)),{...old,...changes,updatedAt:new Date().toISOString()}]};
      } else next = {demo:false,books:[...(state.demo?[]:state.books),prepareImport([changes]).books[0]]};
      if (await persist(next)) {
        d.close(); $("#book-dialog").close(); render();
        toast(b ? "书目与全部来源已更新。" : "好书已靠岸，欢迎入藏。");
      }
    } catch(error) { $("#form-error").textContent = error.message; }
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
  const datasets = Object.entries(PROJECT_TYPES).map(([kind,type])=>`<section class="backup-option"><h3>${type.label}</h3><p>${type.file} · ${projects.count(kind)} 条记录${kind==='readers'?' · 同时包含 Kindle、X3 的全部书单':''}</p><div class="backup-buttons"><button class="button" data-dataset-open="${kind}">打开 ${type.file}</button><button class="button primary" data-dataset-export="${kind}">保存 ${type.file}</button></div></section>`).join("");
  d.innerHTML = `<div class="dialog-header"><h2>备份与数据管理</h2><button class="icon-button" data-close="form-dialog" aria-label="关闭">${icon("close")}</button></div><div class="dialog-body"><p class="form-intro">在这里打开或保存各份 JSON。打开文件替换对应的本机草稿；修改后请保存 JSON，并自行同步到其他设备。</p><div class="backup-options"><section class="backup-option"><h3>主书库</h3><p>library.json · ${groups().length} 本独立书目，包含全部网盘来源、阅读记录、评分和笔记。</p><div class="backup-buttons"><button class="button" data-action="open-library">打开 library.json</button><button class="button primary" data-action="export">保存 library.json</button></div></section>${datasets}<section class="backup-option"><h3>批量追加与恢复</h3><p>从 CSV 或书库 JSON 追加导入书目；相同来源不会重复添加。</p><button class="button" data-action="import">追加导入书目</button></section><section class="backup-option"><h3>恢复默认书库</h3><p>重新载入网站默认书库，替换主书库草稿，其他清单独立保留。</p><button class="button" data-action="load-default">恢复默认书库</button></section><section class="backup-option"><h3>清空当前书库</h3><p>仅清除主书库的本机草稿，不影响网盘文件和其他清单。请先保存 JSON。</p><button class="button danger" data-action="clear-all">清空主书库</button></section></div></div>`;
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
  if (ds.readYear !== undefined && page === "read") {
    readYear = ds.readYear;
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
    if (!b || b.status === ds.status) return;
    if (await updateGroup(b.id, ds.status === "read" ? recordRead(b) : {
      status: ds.status, finishedAt: null, readCount: readingCount(b),
    })) {
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
  if (ds.datasetOpen) { projects.openFile(ds.datasetOpen); return; }
  if (ds.datasetExport) { projects.export(ds.datasetExport); return; }
  const a = ds.action;
  if (!a) return;
  if (a === "add") openAdd();
  else if (a === "backup") openBackup();
  else if (a === "import") {
    if ($("#form-dialog").open) $("#form-dialog").close();
    openImport();
  } else if (a === "export") exportBackup();
  else if (a === "export-current") projects.isProject(page) ? projects.export(page) : exportBackup();
  else if (a === "open-library") $("#open-library-file").click();
  else if (a === "open-json") projects.isProject(page) ? projects.openFile(page) : $("#open-library-file").click();
  else if (a === "read-again") {
    if (!(await stashNotes())) return;
    const b = groups().find(x => x.ids.includes(dialogBookId));
    if (b && await updateGroup(b.id, recordRead(b))) {
      render(); openBook(b.id); toast(`已累计阅读 ${readingCount(b) + 1} 次。`);
    }
  }
  else if (a === "library") navigate("library");
  else if (a === "reset") {
    query = "";
    category = "";
    drive = "";
    format = "";
    tab = "all";
    readYear = "";
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
  } else if (a === "split-book") {
    if (!(await stashNotes())) return;
    const collection = groups().find(x=>x.ids.includes(dialogBookId));
    if (collection) openSplitDialog({dialog:$("#form-dialog"),collection,getBooks:()=>state.books,save:async result=>{
      if (!(await persist({...state,books:result.books}))) return false;
      $("#book-dialog").close(); navigate("library");
      toast(`已拆分：新增 ${result.added} 本，向 ${result.updated} 本追加来源，原合集已移除。`);
      return true;
    }});
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
  }
  else if (a === "clear-all")
    confirmDialog(
      "确认清空主书库？",
      "这会清空本机主书库的书目、链接、笔记和阅读记录。价格计划、待看清单、阅读器记录和网盘文件不受影响。请先保存 library.json。",
      async () => {
        if (!(await persist({ books: [], demo: false }))) return false;
        $("#book-dialog").close();
        render();
        toast("本浏览器书库已清空。");
      },
      "确认清空",
    );
  else if (a === "load-default") {
    confirmDialog(
      "载入默认书库？",
      "将使用网站自带书库替换本机草稿。请先保存你在本机做过的修改；价格计划、待看清单和阅读器记录仍独立保留。",
      async () => {
        const button = $("#confirm-action");
        button.disabled = true;
        button.textContent = "正在载入…";
        try {
          const next = await loadDefaultLibrary();
          if (!(await persist(next))) return false;
          $("#book-dialog").close();
          navigate("library");
          toast("默认书库已载入。");
        } catch {
          toast("默认书库加载失败，请检查网络后重试。");
          return false;
        } finally {
          button.disabled = false;
          button.textContent = "载入默认书库";
        }
      },
      "载入默认书库",
    );
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
  if (!$("#search-input") && !$("#project-search")) navigate("library");
  ($("#search-input") || $("#project-search")).focus();
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
  syncChannel.onmessage = async event => {
    try {
      if (projects.isProject(event.data?.dataset)) {
        await projects.reload(event.data.dataset); render(); return;
      }
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
} else if (initial[0] === "drives") {
  history.replaceState(null, "", "#library");
}
if (!storageBroken && !defaultLoadError) await persist(state);
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
      `文件「${e(file.name)}」包含 ${groupBooks(next.books).length} 本独立书目、${groupBooks(next.books).reduce((n,b) => n + readingCount(b),0)} 册次阅读。打开后将替换本机草稿；如需保留当前书库，请先取消并保存 JSON。`,
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
