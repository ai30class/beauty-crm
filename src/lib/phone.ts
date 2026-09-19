// 顧客電話一律存成「半形、只有數字」的標準格式，系統所有比對（員工電話查詢、預約頁熟客判斷、
// 送出預約時的既有顧客比對）都是完全相同才算同一個人，格式不一致就會查不到、或建出重複顧客。
// - 全形數字（０９１２…）轉半形
// - 去掉空格、連字號、括號、小數點
// - 台灣國碼：+886912345678／886912345678 → 0912345678（市話同理，+886-2-… → 02…）
// - 其他國碼（如香港 852…）只去掉 + 與符號、保留數字，跟資料庫現有格式一致
export function normalizePhone(input: string): string {
  const half = input.normalize('NFKC').trim();
  const hasPlus = half.startsWith('+');
  const digits = half.replace(/[^0-9]/g, '');
  if ((hasPlus || digits.length >= 11) && digits.startsWith('886')) {
    return '0' + digits.slice(3).replace(/^0/, '');
  }
  return digits;
}
