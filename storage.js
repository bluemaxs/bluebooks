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
async function readValue(key) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("library", "readonly");
    const request = transaction.objectStore("library").get(key);
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error || new Error("读取被中断"));
  });
}
async function writeValue(key, state) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("library", "readwrite");
    transaction.objectStore("library").put(state, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error || new Error("保存被中断"));
  });
}
export const readLibrary = () => readValue("state");
export const writeLibrary = state => writeValue("state",state);
function datasetKey(name) {
  if(!['price-plan','wishlist','reader-contents'].includes(name))throw new Error('未知数据文件。');
  return 'dataset:'+name;
}
export const readDataset = name => readValue(datasetKey(name));
export const writeDataset = (name,data) => writeValue(datasetKey(name),data);
