// Store metadata in IndexedDB so a large library is not constrained by localStorage's small quota.
let connection;
function database() {
  if (!connection)
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open("bluebooks", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("library");
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          connection = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        connection = null;
        reject(request.error);
      };
      request.onblocked = () =>
        reject(new Error("请关闭旧版本的书库标签页后重试。"));
    });
  return connection;
}
export async function readLibrary() {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("library", "readonly");
    const request = transaction.objectStore("library").get("state");
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error || new Error("读取被中断"));
  });
}
export async function writeLibrary(state) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("library", "readwrite");
    transaction.objectStore("library").put(state, "state");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error || new Error("保存被中断"));
  });
}
