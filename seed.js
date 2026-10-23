const titles = [
  ["山茶文具店", "小川糸", "文学"],
  ["人类简史", "尤瓦尔·赫拉利", "历史"],
  ["也许你该找个人聊聊", "洛莉·戈特利布", "心理"],
  ["悉达多", "赫尔曼·黑塞", "文学"],
  ["置身事内", "兰小欢", "社会"],
  ["被讨厌的勇气", "岸见一郎 / 古贺史健", "心理"],
  ["活着", "余华", "文学"],
  ["原子习惯", "詹姆斯·克利尔", "成长"],
  ["漫长的余生", "罗新", "历史"],
  ["明亮的夜晚", "崔恩荣", "文学"],
  ["当呼吸化为空气", "保罗·卡拉尼什", "文学"],
  ["认知觉醒", "周岭", "成长"],
  ["额尔古纳河右岸", "迟子建", "文学"],
  ["瓦尔登湖", "亨利·戴维·梭罗", "文学"],
  ["思考，快与慢", "丹尼尔·卡尼曼", "心理"],
  ["小王子", "安托万·德·圣埃克苏佩里", "文学"],
  ["我与地坛", "史铁生", "文学"],
  ["乡土中国", "费孝通", "社会"],
  ["深度工作", "卡尔·纽波特", "成长"],
  ["时间简史", "史蒂芬·霍金", "科学"],
  ["月亮与六便士", "威廉·萨默塞特·毛姆", "文学"],
  ["万物简史", "比尔·布莱森", "科学"],
  ["红楼梦", "曹雪芹", "文学"],
  ["看不见的城市", "伊塔洛·卡尔维诺", "文学"],
];
export function demoBooks() {
  const books = titles.map(([title, author, category], i) => ({
    id: `demo-${i}`,
    title,
    author,
    category,
    status: [0, 1, 3].includes(i)
      ? "reading"
      : [2, 5, 6, 8, 10, 13, 15, 17].includes(i)
        ? "read"
        : "unread",
    favorite: [0, 3, 6, 9, 13].includes(i),
    rating: [2, 5, 6, 8, 10, 13, 15, 17].includes(i) ? (i % 2 ? 4 : 5) : 0,
    notes:
      i === 6
        ? "人是为了活着本身而活着，而不是为了活着之外的任何事物而活着。"
        : "",
    addedAt: new Date(Date.UTC(2026, 9, 23 - i)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 9, 23 - i)).toISOString(),
    finishedAt: [2, 5, 6, 8, 10, 13, 15, 17].includes(i)
      ? new Date(Date.UTC(2026, 9, 20 - i)).toISOString()
      : null,
    sources: [
      {
        id: `source-${i}`,
        drive: i % 7 === 4 ? "阿里云盘" : i % 7 === 5 ? "夸克网盘" : "百度网盘",
        format: i % 5 === 1 ? "PDF" : "EPUB",
        url: "",
        path: `/我的电子书/${category}/${title}.${i % 5 === 1 ? "pdf" : "epub"}`,
      },
    ],
  }));
  [0, 1, 3, 7].forEach((n, i) =>
    books.push({
      ...books[n],
      id: `demo-duplicate-${i}`,
      sources: [
        {
          id: `extra-${i}`,
          drive: i % 2 ? "百度网盘" : "阿里云盘",
          format: i % 2 ? "MOBI" : "PDF",
          url: "",
          path: `/待整理/${books[n].title}.${i % 2 ? "mobi" : "pdf"}`,
        },
      ],
    }),
  );
  return books;
}
