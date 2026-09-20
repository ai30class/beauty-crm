// 結帳完成（狀態 completed）的預約，姓名與服務項目字體反灰，一眼分辨誰已經結完帳。
export const DONE_TEXT_COLOR = '#9a9497';

export function isDoneStatus(status: string | null | undefined): boolean {
  return status === 'completed';
}
