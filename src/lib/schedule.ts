import type { UnifiedAppointment, StaffRosterEntry, StaffReservedSlot, Holiday, DayHours } from '@/types/types';

// 排班表與「空檔一覽」共用的小工具。

export function toApptDateStr(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function timeToMinutes(iso: string) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}
export function hhmmToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
export function minutesToHHMM(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

// 員工帳號讀不到 staff 表，預約帶回來的設計師名字是空的，所以優先用 staff_id 對軌道
export function isStaffAppt(a: UnifiedAppointment, s: StaffRosterEntry) {
  return a.staff_id ? a.staff_id === s.id : a.staff_name === s.name;
}
// 手動預約在資料庫沒有時長欄位（一律當 60 分）；舊系統匯入的預約真正的時間寫在備註，優先用那個
export function apptDurationMin(a: UnifiedAppointment) {
  const m = a.notes?.match(/^\[舊系統匯入\]\s*(\d{2}):(\d{2})~(\d{2}):(\d{2})/);
  if (m) {
    const d = (Number(m[3]) * 60 + Number(m[4])) - (Number(m[1]) * 60 + Number(m[2]));
    if (d > 0) return d;
  }
  return a.duration_minutes || 30;
}

// 某位設計師在某天 [startMin, startMin+durationMin) 這段有沒有空：
// 沒休假、沒有預約、沒有預留時間。營業時間、全店公休、過去的時間由呼叫端先擋掉。
export function isStaffFree(
  s: StaffRosterEntry,
  dateStr: string,
  startMin: number,
  durationMin: number,
  appts: UnifiedAppointment[],
  reserved: StaffReservedSlot[],
  holidays: Holiday[],
): boolean {
  const endMin = startMin + durationMin;
  if (holidays.some(h => h.holiday_date === dateStr && h.staff_id === s.id)) return false;
  const busyAppt = appts.some(a => {
    if (!isStaffAppt(a, s) || toApptDateStr(a.appointment_time) !== dateStr) return false;
    const st = timeToMinutes(a.appointment_time);
    return st < endMin && st + apptDurationMin(a) > startMin;
  });
  if (busyAppt) return false;
  return !reserved.some(r =>
    r.staff_id === s.id && r.reserved_date === dateStr &&
    hhmmToMinutes(r.start_time) < endMin && hhmmToMinutes(r.end_time) > startMin);
}

// 當天的營業時間範圍（分鐘）；沒設定就用 fallback（排班表時間軸範圍）。店休回傳 null。
export function dayOpenRange(hours: DayHours | undefined, fallbackStart: number, fallbackEnd: number): { open: number; close: number } | null {
  if (hours?.open === false) return null;
  return {
    open: hours?.start ? hhmmToMinutes(hours.start) : fallbackStart,
    close: hours?.end ? hhmmToMinutes(hours.end) : fallbackEnd,
  };
}
