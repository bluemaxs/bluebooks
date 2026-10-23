import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCSV,
  prepareImport,
  groupBooks,
  mergeGroup,
  appendBooks,
  safeURL,
  escapeHTML,
  validISBN,
  restoreLibrary,
} from "../core.js";
import { demoBooks } from "../seed.js";

test("opening JSON preserves book identifiers and all reading records", () => {
  const original = demoBooks();
  const restored = restoreLibrary({ version: 1, books: original });
  assert.equal(restored.demo, false);
  assert.equal(restored.books[0].id, original[0].id);
  assert.equal(restored.books[2].finishedAt, original[2].finishedAt);
  assert.equal(restored.books[6].notes, original[6].notes);
});
test("opening a deliberately empty JSON library is supported", () => {
  assert.deepEqual(restoreLibrary({ version: 1, books: [] }), {
    books: [],
    demo: false,
  });
});
test("invalid JSON structures and future versions cannot silently replace a draft", () => {
  assert.throws(() => restoreLibrary({ version: 2, books: [] }));
  assert.throws(() =>
    restoreLibrary({ version: 1, books: [{ author: "No title" }] }),
  );
  assert.throws(() => restoreLibrary({ settings: {} }));
});

test("semantic symbols and edition names remain distinct", () => {
  const books = prepareImport([
    { title: "C++", author: "A" },
    { title: "C#", author: "A" },
    { title: "书名（第二版）", author: "B" },
    { title: "书名", author: "B" },
  ]).books;
  assert.equal(groupBooks(books).length, 4);
});

test("new file sources cannot reset reading progress or a rating", () => {
  const books = prepareImport([
    {
      title: "A",
      author: "B",
      status: "read",
      rating: 5,
      finishedAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    },
    {
      title: "A",
      author: "B",
      status: "unread",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ]).books;
  const b = groupBooks(books)[0];
  assert.equal(b.status, "read");
  assert.equal(b.rating, 5);
  assert.equal(b.finishedAt, "2025-01-01T00:00:00.000Z");
});

test("reimport after merging skips each already retained source", () => {
  const rows = [
    { title: "A", author: "B", drive: "百度网盘" },
    { title: "A", author: "B", drive: "阿里云盘" },
  ];
  const books = prepareImport(rows).books;
  const merged = mergeGroup(books, groupBooks(books)[0]);
  const result = appendBooks(merged, prepareImport(rows).books);
  assert.equal(result.added, 0);
  assert.equal(result.duplicates, 2);
  assert.equal(result.books.length, 1);
});

test("CSV supports BOM, quoted commas, escaped quotes and multiline notes", () => {
  const rows = parseCSV(
    '\uFEFF书名,作者,笔记\r\n"书,一",作者,"第一行\n第二行"\r\n"书""二",作者,读完',
  );
  assert.equal(rows[0].title, "书,一");
  assert.equal(rows[0].notes, "第一行\n第二行");
  assert.equal(rows[1].title, '书"二');
  assert.throws(() => parseCSV('书名\n"abc'), /引号/);
  assert.throws(() => parseCSV("作者\nabc"), /缺少/);
});
test("ISBN validates checksums and unifies ISBN-10 and ISBN-13", () => {
  assert.equal(validISBN("0-306-40615-2"), "9780306406157");
  assert.equal(validISBN("9780306406157"), "9780306406157");
  assert.equal(validISBN("9780306406158"), "");
});
test("dedup groups title and author conservatively, preserves editions and unknown authors", () => {
  const rows = prepareImport([
    { title: "Test.epub", author: "A" },
    { title: "Test", author: "A" },
    { title: "Test", author: "B" },
    { title: "Test" },
    { title: "Test" },
    { title: "Test", author: "A", isbn: "9780306406157" },
  ]).books;
  assert.equal(groupBooks(rows).length, 5);
});
test("merging preserves all sources, favorites and distinct notes", () => {
  const books = prepareImport([
    { title: "A", author: "B", drive: "百度网盘", notes: "笔记一" },
    {
      title: "A",
      author: "B",
      drive: "阿里云盘",
      favorite: true,
      notes: "笔记二",
    },
  ]).books;
  const group = groupBooks(books)[0];
  assert.equal(group.ids.length, 2);
  assert.equal(group.sources.length, 2);
  assert.equal(group.favorite, true);
  assert.equal(group.notes, "笔记一\n\n笔记二");
  const merged = mergeGroup(books, group);
  assert.equal(merged.length, 1);
  assert.equal(groupBooks(merged)[0].ids.length, 1);
  assert.equal(merged[0].sources.length, 2);
});
test("identical repeated import is skipped; different sources are retained", () => {
  const row = {
    title: "A",
    author: "B",
    drive: "百度网盘",
    url: "https://pan.baidu.com/s/example",
  };
  const existing = prepareImport([row]).books;
  const incoming = prepareImport([row, { ...row, drive: "夸克网盘" }]).books;
  const result = appendBooks(existing, incoming);
  assert.equal(result.duplicates, 1);
  assert.equal(result.added, 1);
  assert.equal(groupBooks(result.books)[0].sources.length, 2);
});
test("backup round trip preserves dates, states, notes, ratings, multiple sources and favorites", () => {
  const books = demoBooks();
  books[0].notes = "private notes <3";
  books[0].rating = 5;
  const restored = prepareImport(JSON.parse(JSON.stringify({ books }))).books;
  assert.equal(restored.length, books.length);
  assert.equal(restored[0].notes, books[0].notes);
  assert.equal(restored[0].rating, 5);
  assert.equal(restored[0].addedAt, books[0].addedAt);
  assert.equal(restored[2].finishedAt, books[2].finishedAt);
  assert.equal(restored[0].favorite, true);
  assert.equal(groupBooks(restored).length, 24);
});
test("imports normalize statuses and reject malformed or empty input", () => {
  const { books, skipped } = prepareImport([
    { title: " A ", status: "已读", rating: 900, drive: "其他盘" },
    { title: "" },
    null,
  ]);
  assert.equal(books[0].title, "A");
  assert.equal(books[0].status, "read");
  assert.ok(books[0].finishedAt);
  assert.equal(books[0].rating, 5);
  assert.equal(books[0].sources[0].drive, "其他");
  assert.equal(skipped, 2);
  assert.throws(() => prepareImport({}));
  assert.throws(() => prepareImport([]));
});
test("untrusted links and markup are safely handled", () => {
  for (const link of [
    "javascript:alert(1)",
    "data:text/html,test",
    "file:///etc/passwd",
    "not a url",
  ])
    assert.equal(safeURL(link), "");
  assert.equal(
    safeURL("https://pan.baidu.com/s/test"),
    "https://pan.baidu.com/s/test",
  );
  assert.equal(
    escapeHTML('<img onerror="alert(1)">'),
    "&lt;img onerror=&quot;alert(1)&quot;&gt;",
  );
  const { books } = prepareImport([
    { title: "<script>alert(1)</script>", url: "javascript:alert(1)" },
  ]);
  assert.equal(books[0].sources[0].url, "");
});
test("sample library counts are derived from real sample records", () => {
  const all = groupBooks(demoBooks());
  assert.equal(all.length, 24);
  assert.equal(all.filter((b) => b.status === "read").length, 8);
  assert.equal(all.filter((b) => b.status === "reading").length, 3);
  assert.equal(all.filter((b) => b.ids.length > 1).length, 4);
});
