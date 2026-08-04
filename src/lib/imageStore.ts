// 跨頁面傳遞本機圖片 URI（不走 URL params，避免 Android 雙重編碼問題）
let pendingBefore: string | null = null;
let pendingAfter: string | null = null;

export const setPendingBeforeUri = (uri: string) => { pendingBefore = uri; };
export const setPendingAfterUri = (uri: string) => { pendingAfter = uri; };
export const consumePendingBeforeUri = () => { const u = pendingBefore; pendingBefore = null; return u; };
export const consumePendingAfterUri = () => { const u = pendingAfter; pendingAfter = null; return u; };
