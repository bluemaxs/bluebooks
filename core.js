export const STORAGE_KEY = "bluebooks.library.v1";
export const DRIVES = ["百度网盘", "阿里云盘", "夸克网盘", "其他"];
export const STATUSES = { unread: "未读", reading: "在读", read: "已读" };
export const uid = () =>
  globalThis.crypto?.randomUUID?.() ||
  `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function readingCount(book) {
  const n = Number(book.readCount);
  return Math.max(
    book.status === 'read' ? 1 : 0,
    Number.isFinite(n) ? Math.min(100000, Math.max(0, Math.floor(n))) : 0,
  );
}
export function recordRead(book, date = new Date()) {
  return {
    status: 'read',
    readCount: Math.min(100000, readingCount(book) + 1),
    readYears: [...(book.readYears || []), date.getFullYear()].slice(-100000),
    finishedAt: date.toISOString(),
  };
}
export const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (x) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        x
      ],
  );
export function safeURL(value) {
  try {
    const u = new URL(String(value || "").trim());
    return ["https:", "http:"].includes(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
}
export function normalizeTitle(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\.(epub|pdf|mobi|azw3|txt)$/i, "")
    .replace(/\s+/gu, "")
    .replace(/[《》「」『』]/g, "");
}
export function validISBN(value) {
  const s = String(value || "")
    .replace(/[\s-]/g, "")
    .toUpperCase();
  if (/^\d{13}$/.test(s))
    return [...s].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0) %
      10 ===
      0
      ? s
      : "";
  if (/^\d{9}[\dX]$/.test(s)) {
    if (
      [...s].reduce(
        (n, c, i) => n + (c === "X" ? 10 : Number(c)) * (10 - i),
        0,
      ) % 11
    )
      return "";
    const base = "978" + s.slice(0, 9);
    return (
      base +
      ((10 -
        ([...base].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0) %
          10)) %
        10)
    );
  }
  return "";
}
export function bookKey(book) {
  const isbn = validISBN(book.isbn);
  if (isbn) return `isbn:${isbn}`;
  const author = normalizeTitle(book.author);
  return author && author !== "未知作者"
    ? `title:${normalizeTitle(book.title)}|${author}`
    : `unique:${book.id}`;
}
export function groupBooks(books) {
  const groups = new Map();
  for (const book of books) {
    const key = bookKey(book);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(book);
  }
  return [...groups.entries()].map(([key, entries]) => {
    const ordered = [...entries].sort((a, b) =>
      (b.updatedAt || b.addedAt || "").localeCompare(
        a.updatedAt || a.addedAt || "",
      ),
    );
    const latest = ordered[0];
    const progress = { unread: 0, reading: 1, read: 2 };
    const readingRecord = [...ordered].sort(
      (a, b) => progress[b.status] - progress[a.status],
    )[0];
    const sourceMap = new Map();
    entries
      .flatMap((x) => x.sources || [])
      .forEach((s) => {
        const k = JSON.stringify([s.drive, s.format, s.url, s.path]);
        if (!sourceMap.has(k)) sourceMap.set(k, s);
      });
    return {
      ...latest,
      status: readingRecord.status,
      finishedAt: readingRecord.finishedAt,
      rating: ordered.find((x) => x.rating > 0)?.rating || 0,
      readCount: entries.reduce((n, x) => Math.max(n, readingCount(x)), 0),
      readYears: ordered.find(x=>Array.isArray(x.readYears)&&x.readYears.length)?.readYears || [],
      key,
      ids: entries.map((x) => x.id),
      sources: [...sourceMap.values()],
      favorite: entries.some((x) => x.favorite),
      notes: [...new Set(entries.map((x) => x.notes).filter(Boolean))].join(
        "\n\n",
      ),
    };
  });
}
export function parseCSV(text) {
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  const s = String(text).replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') {
      if (quoted && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (quoted || field === "") quoted = !quoted;
      else field += c;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("CSV 中有未闭合的引号，请检查文件。");
  row.push(field);
  if (row.some((x) => x.trim())) rows.push(row);
  if (rows.length < 2) throw new Error("文件需要包含表头和至少一行书目。");
  const aliases = {
    书名: "title",
    作者: "author",
    分类: "category",
    网盘: "drive",
    格式: "format",
    链接: "url",
    路径: "path",
    状态: "status",
    笔记: "notes",
    评分: "rating",
    收藏: "favorite",
    阅读次数: "readCount",
    ISBN: "isbn",
  };
  const headers = rows
    .shift()
    .map((x) => aliases[x.trim()] || x.trim().toLowerCase());
  if (!headers.includes("title")) throw new Error("缺少「书名」或 title 列。");
  return rows.map((r) =>
    Object.fromEntries(headers.map((h, i) => [h, r[i] || ""])),
  );
}
export function prepareImport(input) {
  const rows = Array.isArray(input) ? input : input?.books;
  if (!Array.isArray(rows))
    throw new Error("JSON 应为书目数组或书屿导出的备份文件。");
  if (rows.length > 100000) throw new Error("单次最多导入 100,000 条书目。");
  const now = new Date().toISOString();
  let skipped = 0;
  const books = rows.flatMap((r, i) => {
    if (!r || typeof r !== "object" || !String(r.title || "").trim()) {
      skipped++;
      return [];
    }
    const status =
      Object.keys(STATUSES).find(
        (k) => k === r.status || STATUSES[k] === r.status,
      ) || "unread";
    const readYears=Array.isArray(r.readYears)?r.readYears.map(Number).filter(y=>Number.isInteger(y)&&y>=1900&&y<=9999).slice(0,100000):[];
    const sources = (Array.isArray(r.sources) ? r.sources : [r])
      .filter((x) => x && typeof x === "object")
      .map((s) => ({
        id: uid(),
        drive: DRIVES.includes(s.drive) ? s.drive : "其他",
        format: String(s.format || "EPUB")
          .toUpperCase()
          .slice(0, 12),
        url: safeURL(s.url),
        path: String(s.path || "").slice(0, 2000),
      }));
    return [
      {
        id: uid(),
        title: String(r.title).trim().slice(0, 300),
        author: String(r.author || "未知作者")
          .trim()
          .slice(0, 200),
        isbn: String(r.isbn || ""),
        category: String(r.category || "未分类").slice(0, 60),
        status,
        readCount: Math.max(readingCount({...r,status}),readYears.length),
        readYears,
        favorite:
          r.favorite === true || r.favorite === "true" || r.favorite === "是",
        notes: String(r.notes || "").slice(0, 50000),
        rating: Math.max(0, Math.min(5, Number(r.rating) || 0)),
        addedAt:
          r.addedAt && Number.isFinite(Date.parse(r.addedAt)) ? r.addedAt : now,
        updatedAt:
          r.updatedAt && Number.isFinite(Date.parse(r.updatedAt))
            ? r.updatedAt
            : now,
        finishedAt:
          status === "read"
            ? r.finishedAt && Number.isFinite(Date.parse(r.finishedAt))
              ? r.finishedAt
              : null
            : null,
        sources,
      },
    ];
  });
  if (!books.length) throw new Error("没有找到包含书名的有效记录。");
  return { books, skipped };
}
export function mergeGroup(books, group) {
  if (group.ids.length < 2) return books;
  const { key, ids, ...book } = group;
  return [
    ...books.filter((x) => !ids.includes(x.id)),
    { ...book, id: ids[0], updatedAt: new Date().toISOString() },
  ];
}
export function restoreLibrary(input) {
  const rows = Array.isArray(input) ? input : input?.books;
  if (input?.version && input.version !== 1)
    throw new Error("暂不支持这个版本的书库文件。");
  if (!Array.isArray(rows))
    throw new Error("请选择包含 books 数组的 JSON 书库文件。");
  if (!rows.length) return { books: [], demo: false };
  const prepared = prepareImport(rows);
  if (prepared.skipped)
    throw new Error("书库中存在缺少书名的记录，未替换当前草稿。");
  const used = new Set();
  const books = prepared.books.map((b, i) => {
    const savedId =
      typeof rows[i].id === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(rows[i].id)
        ? rows[i].id
        : b.id;
    const id = used.has(savedId) ? uid() : savedId;
    used.add(id);
    return { ...b, id };
  });
  return { books, demo: false };
}
export function appendBooks(existing, incoming) {
  const signatures = new Set();
  const signature = (b, s) => {
    let key = bookKey(b);
    // Unknown authors remain separate books, but an identical concrete file is safe to skip.
    if (key.startsWith("unique:") && (s.url || s.path)) {
      key = `file:${normalizeTitle(b.title)}|${normalizeTitle(b.author)}`;
    }
    return JSON.stringify([key, s.drive, s.format, s.url, s.path]);
  };
  existing.forEach((b) =>
    b.sources.forEach((s) => signatures.add(signature(b, s))),
  );
  let duplicates = 0;
  const fresh = [];
  for (const b of incoming) {
    const sources = b.sources.filter((s) => !signatures.has(signature(b, s)));
    if (!sources.length) {
      duplicates++;
      continue;
    }
    sources.forEach((s) => signatures.add(signature(b, s)));
    fresh.push({ ...b, sources });
  }
  return { books: [...existing, ...fresh], added: fresh.length, duplicates };
}
