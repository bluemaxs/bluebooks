import { restoreLibrary } from "./core.js";

export async function loadDefaultLibrary(fetcher = globalThis.fetch) {
  const response = await fetcher(new URL("./default-library.json", import.meta.url));
  if (!response.ok) throw new Error("无法加载默认书库。");
  return restoreLibrary(await response.json());
}

export async function initialLibrary(saved, loader = loadDefaultLibrary) {
  // An explicitly empty user library is a saved draft too.
  if (saved && Array.isArray(saved.books) && !saved.demo) return saved;
  return loader();
}
