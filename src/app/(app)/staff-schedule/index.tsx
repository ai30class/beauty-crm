import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator, Modal, TextInput, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowLeft, CalendarDays, Clock, User, Globe, ChevronLeft, ChevronRight, Users, CalendarPlus, Coffee, Trash2,
} from 'lucide-react-native';
import {
  getMergedAppointments, getShopProfile, getHolidays,
  getStaffReservedSlots, createStaffReservedSlot, deleteStaffReservedSlot,
  getScheduleStaff, getAccountType,
} from '@/db/api';
import OnlineOrderInfoModal from '@/components/OnlineOrderInfoModal';
import type { UnifiedAppointment, BusinessHours, Holiday, StaffReservedSlot, StaffRosterEntry } from '@/types/types';

const DAY_KEYS: (keyof BusinessHours)[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// ── 工具 ─────────────────────────────────────────────────────────────────────
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function toApptDateStr(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function formatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  const today = toDateStr(new Date());
  const tomorrow = toDateStr(new Date(Date.now() + 86400000));
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const prefix = dateStr === today ? '今天' : dateStr === tomorrow ? '明天' : '';
  return `${prefix ? prefix + '・' : ''}${d.getMonth() + 1}/${d.getDate()}（週${weekdays[d.getDay()]}）`;
}
// 週一為一週起點，符合排班表慣例
function getMonday(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}
function addDays(d: Date, n: number): Date {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}
// 員工帳號讀不到 staff 表，預約帶回來的設計師名字是空的，所以優先用 staff_id 對軌道
function isStaffAppt(a: UnifiedAppointment, s: StaffRosterEntry) {
  return a.staff_id ? a.staff_id === s.id : a.staff_name === s.name;
}
// 手動預約在資料庫沒有時長欄位（一律當 60 分）；舊系統匯入的預約真正的時間寫在備註，優先用那個
function apptDurationMin(a: UnifiedAppointment) {
  const m = a.notes?.match(/^\[舊系統匯入\]\s*(\d{2}):(\d{2})~(\d{2}):(\d{2})/);
  if (m) {
    const d = (Number(m[3]) * 60 + Number(m[4])) - (Number(m[1]) * 60 + Number(m[2]));
    if (d > 0) return d;
  }
  return a.duration_minutes || 30;
}
// 日視圖區塊上的字：顧客姓名（員工帳號讀不到時是「—」就不顯示）＋服務／備註
function apptLabels(a: UnifiedAppointment) {
  const who = a.customer_name && a.customer_name !== '—' ? a.customer_name : '';
  const detail = a.source === 'manual'
    ? (a.notes ?? '').replace(/^\[舊系統匯入\]\s*\d{2}:\d{2}~\d{2}:\d{2}（\d+分）/, '').replace(/^[\s｜|]+/, '').replace(/^一般[\s｜|]*/, '').trim() || a.service_name
    : a.service_name;
  return { who, detail };
}
function timeToMinutes(iso: string) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}
function hhmmToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function minutesToHHMM(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:         { label: '待服務', color: '#e8789a', bg: '#fce9f0' },
  confirmed:       { label: '已確認', color: '#4a6cf7', bg: '#eef0ff' },
  paid:            { label: '已付訂金', color: '#2ea87e', bg: '#e0f5ef' },
  pending_payment: { label: '待付款', color: '#e8a000', bg: '#fef3e6' },
  completed:       { label: '已完成', color: '#999', bg: '#f0f0f0' },
  cancelled:       { label: '已取消', color: '#c4a0ae', bg: '#f5eaef' },
};

// ── 預約卡 ────────────────────────────────────────────────────────────────────
function ApptCard({ item }: { item: UnifiedAppointment }) {
  const status = STATUS_META[item.status] ?? STATUS_META.pending;
  return (
    <View
      className="bg-card rounded-2xl px-4 py-3 border border-border gap-2"
      style={{ shadowColor: '#e8789a', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 }}
    >
      {/* 頂排：姓名 + 狀態 */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2 flex-1 mr-2">
          <View
            className="w-7 h-7 rounded-full items-center justify-center"
            style={{ backgroundColor: item.source === 'online' ? '#eef0ff' : '#fce9f0' }}
          >
            {item.source === 'online'
              ? <Globe size={13} color="#4a6cf7" />
              : <User size={13} color="#e8789a" />
            }
          </View>
          <Text className="font-rounded text-sm font-bold text-foreground flex-1" numberOfLines={1}>
            {item.customer_name}
          </Text>
        </View>
        <View className="px-2.5 py-0.5 rounded-full" style={{ backgroundColor: status.bg }}>
          <Text className="font-rounded" style={{ fontSize: 11, color: status.color, fontWeight: '600' }}>{status.label}</Text>
        </View>
      </View>

      {/* 服務名稱 */}
      <Text className="font-rounded text-sm text-muted-foreground" numberOfLines={1}>{item.service_name}</Text>

      {/* 時間 + 人員 + 費用 */}
      <View className="flex-row items-center gap-3 flex-wrap">
        <View className="flex-row items-center gap-1">
          <Clock size={12} color="#c4a0ae" />
          <Text className="font-rounded text-xs text-muted-foreground">
            {formatTime(item.appointment_time)}
            {item.duration_minutes > 0 ? ` · ${item.duration_minutes}分` : ''}
          </Text>
        </View>
        {item.staff_name && (
          <View className="flex-row items-center gap-1">
            <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.staff_color ?? '#e8789a' }} />
            <Text className="font-rounded text-xs text-muted-foreground">{item.staff_name}</Text>
          </View>
        )}
        {item.customer_phone ? (
          <Text className="font-rounded text-xs text-muted-foreground">{item.customer_phone}</Text>
        ) : null}
        {item.total_amount > 0 && (
          <Text className="font-rounded text-xs font-semibold" style={{ color: '#e8789a' }}>
            ${Number(item.total_amount).toLocaleString()}
          </Text>
        )}
      </View>

      {item.notes ? (
        <Text className="font-rounded text-xs text-muted-foreground" numberOfLines={1}>📝 {item.notes}</Text>
      ) : null}
    </View>
  );
}

// 週視圖時間軸：固定假設範圍 9:00–21:00，涵蓋大多數美業診所的營業時段
const TIMELINE_START_MIN = 9 * 60;
const TIMELINE_END_MIN = 21 * 60;
const TRACK_HEIGHT = 320;
// 日視圖：每小時的高度，一天 12 小時共 720 高，往下捲動看
const DAY_HOUR_PX = 60;
const HOUR_MARKS = Array.from({ length: (TIMELINE_END_MIN - TIMELINE_START_MIN) / 60 + 1 }, (_, i) => 9 + i);
// 每 30 分鐘一條刻度線（含整點），整點另外顯示數字，半點只畫線不顯示文字
const GRID_LINES = Array.from({ length: (TIMELINE_END_MIN - TIMELINE_START_MIN) / 30 + 1 }, (_, i) => TIMELINE_START_MIN + i * 30);

// 色塊顏色只用來區分「同一位人員當天的不同預約」，跟人員本身的識別色（外框）是兩件事——
// 同一人員背靠背兩筆預約如果都用人員色，會黏成一塊看不出是兩個人
const APPT_BLOCK_COLORS = ['#e8789a', '#4a6cf7', '#2ea87e', '#e8a000', '#a78bfa', '#22b8c0'];
// 空檔可點的時段：跟畫面上的 30 分鐘刻度線對齊
const TAP_SLOT_MINUTES = GRID_LINES.slice(0, -1);
// 預留時間的快速標籤
const RESERVE_LABEL_PRESETS = ['午休', '外出', '教育訓練'];
// 預留時間的快速時長（分鐘）；也可以在下方輸入框自行輸入其他數字
const RESERVE_DURATION_PRESETS = [30, 60, 90, 120];

// ── 主頁面 ────────────────────────────────────────────────────────────────────
export default function StaffScheduleScreen() {
  const router = useRouter();
  const today = toDateStr(new Date());

  const { width: winW } = useWindowDimensions();
  // 手機寬度預設「日」視圖（一週 7 天 × 每位設計師一條軌道，手機上每欄只剩 25 像素，看不清楚）
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>(() => (winW < 700 ? 'day' : 'week'));
  const [dayDate, setDayDate] = useState<string>(today);
  const [allAppts, setAllAppts] = useState<UnifiedAppointment[]>([]);
  const [allStaff, setAllStaff] = useState<StaffRosterEntry[]>([]);
  const [businessHours, setBusinessHours] = useState<BusinessHours | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [reservedSlots, setReservedSlots] = useState<StaffReservedSlot[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null); // null = 全部
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));

  // 點空白處：先彈「排新預約／預留時間」選單，選預留時間才接著問標籤
  const [slotPicker, setSlotPicker] = useState<{ dateStr: string; time: string; staffId: string; staffName: string } | null>(null);
  const [reserveTarget, setReserveTarget] = useState<{ dateStr: string; time: string; staffId: string; staffName: string } | null>(null);
  const [reserveLabel, setReserveLabel] = useState('');
  const [reserveDurationMin, setReserveDurationMin] = useState('30');
  const [savingReserve, setSavingReserve] = useState(false);
  const [deleteReserveTarget, setDeleteReserveTarget] = useState<StaffReservedSlot | null>(null);
  const [deletingReserve, setDeletingReserve] = useState(false);
  const [isStaffAccount, setIsStaffAccount] = useState(false);
  const [infoAppt, setInfoAppt] = useState<UnifiedAppointment | null>(null);

  // 點預約色塊：手動 → 預約詳情；線上 → 商家去訂單頁，員工（讀不到訂單頁資料）改跳唯讀小視窗
  const openAppt = (a: UnifiedAppointment) => {
    if (a.source === 'manual') router.push(`/(app)/appointments/${a.id.replace('manual-', '')}` as any);
    else if (isStaffAccount) setInfoAppt(a);
    else router.push('/(app)/online-orders' as any);
  };

  // 「暫停服務」的設計師只要還有預約／預留時間就照樣顯示，不然那些預約會從排班表消失
  const bookedStaffIds = new Set<string>();
  allAppts.forEach(a => { if (a.staff_id) bookedStaffIds.add(a.staff_id); });
  reservedSlots.forEach(r => bookedStaffIds.add(r.staff_id));
  const staffList = allStaff.filter(s => s.is_active || bookedStaffIds.has(s.id));

  // 切換日期時同步把「週」對到那天所在的週，預留時間與公休日資料才會跟著載入
  const goDay = (ds: string) => {
    setDayDate(ds);
    const m = getMonday(new Date(ds + 'T00:00:00'));
    setWeekStart(prev => (toDateStr(prev) === toDateStr(m) ? prev : m));
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, staff, profile, accountType] = await Promise.all([
        getMergedAppointments(),
        getScheduleStaff(),
        getShopProfile(),
        getAccountType().catch(() => 'merchant' as const),
      ]);
      setIsStaffAccount(accountType === 'staff');
      const staffById = new Map(staff.map(s => [s.id, s]));
      // 只顯示今天及之後、非取消的；設計師名字/顏色缺的（員工帳號）用 staff_id 補上
      const upcoming = data
        .filter(a =>
          toApptDateStr(a.appointment_time) >= today &&
          !['cancelled', 'refunded'].includes(a.status)
        )
        .map(a => {
          const s = a.staff_id ? staffById.get(a.staff_id) : undefined;
          return s ? { ...a, staff_name: a.staff_name ?? s.name, staff_color: a.staff_color ?? s.color } : a;
        });
      setAllAppts(upcoming);
      setAllStaff(staff);
      setBusinessHours(profile?.business_hours ?? null);
    } finally {
      setLoading(false);
    }
  }, [today]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // 目前這一週涵蓋到的月份可能跨月，公休資料兩個月都要查
  const loadHolidays = useCallback(async (start: Date) => {
    const end = addDays(start, 6);
    const monthKeys = new Set([
      `${start.getFullYear()}-${start.getMonth() + 1}`,
      `${end.getFullYear()}-${end.getMonth() + 1}`,
    ]);
    const results = await Promise.all(
      [...monthKeys].map(key => {
        const [y, m] = key.split('-').map(Number);
        return getHolidays(y, m);
      })
    );
    setHolidays(results.flat());
  }, []);

  useFocusEffect(useCallback(() => { loadHolidays(weekStart); }, [weekStart, loadHolidays]));

  const loadReservedSlots = useCallback(async (start: Date) => {
    const slots = await getStaffReservedSlots(toDateStr(start), toDateStr(addDays(start, 6)));
    setReservedSlots(slots);
  }, []);

  useFocusEffect(useCallback(() => { loadReservedSlots(weekStart); }, [weekStart, loadReservedSlots]));

  const handleCreateReserve = async () => {
    if (!reserveTarget) return;
    setSavingReserve(true);
    try {
      const durationMin = Math.max(parseInt(reserveDurationMin, 10) || 30, 5);
      const endMin = Math.min(hhmmToMinutes(reserveTarget.time) + durationMin, TIMELINE_END_MIN);
      await createStaffReservedSlot({
        staff_id: reserveTarget.staffId,
        reserved_date: reserveTarget.dateStr,
        start_time: reserveTarget.time,
        end_time: minutesToHHMM(endMin),
        label: reserveLabel.trim() || '預留時間',
      });
      setReserveTarget(null);
      setReserveLabel('');
      await loadReservedSlots(weekStart);
    } finally {
      setSavingReserve(false);
    }
  };

  const handleDeleteReserve = async () => {
    if (!deleteReserveTarget) return;
    setDeletingReserve(true);
    try {
      await deleteStaffReservedSlot(deleteReserveTarget.id);
      setDeleteReserveTarget(null);
      await loadReservedSlots(weekStart);
    } finally {
      setDeletingReserve(false);
    }
  };

  // 有預約的日期集合（月曆用）
  const markedDates = new Set(allAppts.map(a => toApptDateStr(a.appointment_time)));

  // 選定日期的預約（依時間排序，月曆模式用）
  const dayAppts = allAppts
    .filter(a => toApptDateStr(a.appointment_time) === selectedDate)
    .sort((a, b) => new Date(a.appointment_time).getTime() - new Date(b.appointment_time).getTime());

  // ── 月曆 ─────────────────────────────────────────────────────────────────
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const weekLabels = ['日', '一', '二', '三', '四', '五', '六'];
  const monthNames = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
  const calCells: Array<number | null> = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (calCells.length % 7 !== 0) calCells.push(null);

  // ── 週視圖 ─────────────────────────────────────────────────────────────────
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = weekDays[6];
  const weekLabel = `${weekStart.getMonth() + 1}/${weekStart.getDate()} - ${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`;

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />

      {/* Header */}
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable
          className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2"
          onPress={() => {
            // 員工登入後直接落在這頁（見 sign-in.tsx／reset-password.tsx），導覽堆疊裡
            // 沒有「上一頁」，router.back() 會靜默沒反應，讓員工卡在這裡連底部分頁列
            // （顧客／預約／報表／我的）都碰不到。這種情況改導去預約分頁，那裡才進得了
            // 分頁列，可以繼續往其他分頁走。商家從別處點進來時 canGoBack() 是 true，行為不變。
            if (router.canGoBack()) router.back();
            else router.replace('/(app)/appointments' as any);
          }}
        >
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Users size={20} color="#e8789a" style={{ marginRight: 8 }} />
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">設計師排班表</Text>
        <Pressable
          className="w-8 h-8 items-center justify-center rounded-full active:bg-muted"
          onPress={load}
        >
          <CalendarDays size={18} color="#e8789a" />
        </Pressable>
      </View>

      {/* 週／月切換 */}
      <View className="flex-row gap-2 px-5 mb-3">
        {(['day', 'week', 'month'] as const).map(m => (
          <Pressable
            key={m}
            className="px-4 py-1.5 rounded-full active:opacity-70"
            style={{ backgroundColor: viewMode === m ? '#e8789a' : '#f5e6ec' }}
            onPress={() => setViewMode(m)}
          >
            <Text className="font-rounded text-sm font-medium" style={{ color: viewMode === m ? '#fff' : '#c4a0ae' }}>
              {m === 'day' ? '日' : m === 'week' ? '週' : '月'}
            </Text>
          </Pressable>
        ))}
      </View>

      {viewMode === 'day' ? (
        <ScrollView className="flex-1" contentContainerClassName="pb-10">
          {/* 日期切換 */}
          <View className="flex-row items-center justify-between px-5 mb-3">
            <Pressable className="w-9 h-9 rounded-full items-center justify-center active:bg-muted"
              onPress={() => goDay(toDateStr(addDays(new Date(dayDate + 'T00:00:00'), -1)))}>
              <ChevronLeft size={20} color="#e8789a" />
            </Pressable>
            <Pressable className="items-center active:opacity-70" onPress={() => goDay(today)}>
              <Text className="font-rounded text-sm font-bold text-foreground">{formatDateLabel(dayDate)}</Text>
              {dayDate !== today && <Text className="font-rounded text-xs text-primary">回到今天</Text>}
            </Pressable>
            <Pressable className="w-9 h-9 rounded-full items-center justify-center active:bg-muted"
              onPress={() => goDay(toDateStr(addDays(new Date(dayDate + 'T00:00:00'), 1)))}>
              <ChevronRight size={20} color="#e8789a" />
            </Pressable>
          </View>

          {loading ? (
            <View className="items-center py-10"><ActivityIndicator color="#e8789a" /></View>
          ) : staffList.length === 0 ? (
            <View className="mx-5 bg-card rounded-2xl p-8 border border-border items-center">
              <Text className="font-rounded text-sm text-muted-foreground">目前沒有可顯示的設計師</Text>
            </View>
          ) : (() => {
            const dayHours = businessHours?.[DAY_KEYS[new Date(dayDate + 'T00:00:00').getDay()]];
            const shopClosed = dayHours?.open === false || holidays.some(h => h.holiday_date === dayDate && !h.staff_id);
            const dayList = allAppts.filter(a => toApptDateStr(a.appointment_time) === dayDate);
            const totalH = ((TIMELINE_END_MIN - TIMELINE_START_MIN) / 60) * DAY_HOUR_PX;
            const yOf = (min: number) => ((min - TIMELINE_START_MIN) / 60) * DAY_HOUR_PX;
            const colW = Math.max(92, Math.floor((winW - 40 - 30) / staffList.length));
            return (
              <View className="px-5 flex-row">
                {/* 時間刻度 */}
                <View style={{ width: 30, marginTop: 28, height: totalH }}>
                  {HOUR_MARKS.map(h => (
                    <Text key={h} className="font-rounded"
                      style={{ position: 'absolute', top: yOf(h * 60) - 7, fontSize: 11, color: '#c4a0ae' }}>
                      {h}
                    </Text>
                  ))}
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View>
                    {/* 設計師名字列 */}
                    <View className="flex-row" style={{ height: 28 }}>
                      {staffList.map(s => (
                        <View key={s.id} style={{ width: colW }} className="flex-row items-center justify-center gap-1.5">
                          <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                          <Text className="font-rounded text-xs font-bold" style={{ color: '#7a6a70' }} numberOfLines={1}>{s.name}</Text>
                        </View>
                      ))}
                    </View>
                    <View className="flex-row">
                      {staffList.map(s => {
                        const staffOff = holidays.some(h => h.holiday_date === dayDate && h.staff_id === s.id);
                        const closed = shopClosed || staffOff;
                        const staffAppts = dayList.filter(a => isStaffAppt(a, s));
                        const staffReserved = reservedSlots.filter(r => r.staff_id === s.id && r.reserved_date === dayDate);
                        return (
                          <View key={s.id} style={{ width: colW, height: totalH, position: 'relative', overflow: 'hidden',
                            backgroundColor: closed ? '#f5f0f2' : '#fdf1f5', borderLeftWidth: 1, borderLeftColor: '#f0dde4' }}>
                            {GRID_LINES.map(m => (
                              <View key={m} pointerEvents="none"
                                style={{ position: 'absolute', left: 0, right: 0, top: yOf(m), height: 1,
                                  backgroundColor: m % 60 === 0 ? '#e8c8d4' : '#f0dde4' }} />
                            ))}
                            {closed ? (
                              <Text className="font-rounded" style={{ position: 'absolute', top: '40%', left: 0, right: 0, textAlign: 'center', fontSize: 12, color: '#c4a0ae' }}>
                                {shopClosed ? '店休' : '休'}
                              </Text>
                            ) : (
                              <>
                                {TAP_SLOT_MINUTES.map(min => (
                                  <Pressable key={`slot-${min}`}
                                    style={{ position: 'absolute', left: 0, right: 0, top: yOf(min), height: DAY_HOUR_PX / 2 }}
                                    onPress={() => setSlotPicker({ dateStr: dayDate, time: minutesToHHMM(min), staffId: s.id, staffName: s.name })} />
                                ))}
                                {staffReserved.map(r => {
                                  const startMin = Math.max(hhmmToMinutes(r.start_time), TIMELINE_START_MIN);
                                  const endMin = Math.min(hhmmToMinutes(r.end_time), TIMELINE_END_MIN);
                                  return (
                                    <Pressable key={r.id}
                                      style={({ pressed }) => ({ position: 'absolute', left: 3, right: 3, top: yOf(startMin),
                                        height: Math.max(((endMin - startMin) / 60) * DAY_HOUR_PX, 16),
                                        backgroundColor: '#e5dde0', borderRadius: 6, borderWidth: 1, borderColor: '#c4a0ae',
                                        opacity: pressed ? 0.7 : 1, overflow: 'hidden', padding: 3 })}
                                      onPress={() => setDeleteReserveTarget(r)}>
                                      <Text className="font-rounded" style={{ fontSize: 11, color: '#7a6a70' }} numberOfLines={3}>{r.label}</Text>
                                    </Pressable>
                                  );
                                })}
                                {staffAppts.map(a => {
                                  const startMin = Math.max(timeToMinutes(a.appointment_time), TIMELINE_START_MIN);
                                  const endMin = Math.min(startMin + apptDurationMin(a), TIMELINE_END_MIN);
                                  const { who, detail } = apptLabels(a);
                                  return (
                                    <Pressable key={a.id}
                                      style={({ pressed }) => ({ position: 'absolute', left: 3, right: 3, top: yOf(startMin),
                                        height: Math.max(((endMin - startMin) / 60) * DAY_HOUR_PX, 22),
                                        backgroundColor: s.color + '33', borderRadius: 6, borderLeftWidth: 4, borderLeftColor: s.color,
                                        opacity: pressed ? 0.7 : 1, overflow: 'hidden', padding: 4 })}
                                      onPress={() => openAppt(a)}>
                                      <Text className="font-rounded" style={{ fontSize: 11, fontWeight: '700', color: '#3d2b32' }} numberOfLines={1}>
                                        {formatTime(a.appointment_time)}{who ? ` ${who}` : ''}
                                      </Text>
                                      {detail ? <Text className="font-rounded" style={{ fontSize: 11, color: '#5a4850' }} numberOfLines={3}>{detail}</Text> : null}
                                    </Pressable>
                                  );
                                })}
                              </>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </ScrollView>
              </View>
            );
          })()}
          <Text className="font-rounded text-xs text-muted-foreground px-5 mt-3">
            💡 點色塊看預約詳情，點空白處可排新預約或標記預留時間
          </Text>
        </ScrollView>
      ) : viewMode === 'week' ? (
        <ScrollView className="flex-1" contentContainerClassName="pb-10">
          {/* 週切換 */}
          <View className="flex-row items-center justify-between px-5 mb-3">
            <Pressable className="w-8 h-8 rounded-full items-center justify-center active:bg-muted"
              onPress={() => setWeekStart(w => addDays(w, -7))}>
              <ChevronLeft size={18} color="#e8789a" />
            </Pressable>
            <Text className="font-rounded text-sm font-bold text-foreground">{weekLabel}</Text>
            <Pressable className="w-8 h-8 rounded-full items-center justify-center active:bg-muted"
              onPress={() => setWeekStart(w => addDays(w, 7))}>
              <ChevronRight size={18} color="#e8789a" />
            </Pressable>
          </View>

          {/* 人員篩選 */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerClassName="px-5 gap-2">
            <Pressable
              className="px-3.5 py-1.5 rounded-full active:opacity-70"
              style={{ backgroundColor: selectedStaffId === null ? '#e8789a' : '#f5e6ec' }}
              onPress={() => setSelectedStaffId(null)}
            >
              <Text className="font-rounded text-xs font-medium" style={{ color: selectedStaffId === null ? '#fff' : '#c4a0ae' }}>全部</Text>
            </Pressable>
            {staffList.map(s => (
              <Pressable
                key={s.id}
                className="px-3.5 py-1.5 rounded-full active:opacity-70"
                style={{ backgroundColor: selectedStaffId === s.id ? s.color : s.color + '18' }}
                onPress={() => setSelectedStaffId(s.id)}
              >
                <Text className="font-rounded text-xs font-medium" style={{ color: selectedStaffId === s.id ? '#fff' : s.color }}>{s.name}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {loading ? (
            <View className="items-center py-10"><ActivityIndicator color="#e8789a" /></View>
          ) : (
            <>
              {/* 星期＋日期標題列：獨立一排，不會把下面的格子往下推——時間刻度跟格子本體
                  才能真正對齊在同一個起點（之前這兩行文字長在每天欄位「裡面」、刻度尺
                  卻沒有，導致刻度尺整體比格子高了一截，點空白處帶出來的時間跟點擊位置對不上）。 */}
              <View className="px-5 flex-row mb-1" style={{ gap: 2 }}>
                <View style={{ width: 28 }} />
                {weekDays.map(d => {
                  const dateStr = toDateStr(d);
                  const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六'];
                  return (
                    <View key={dateStr} style={{ flex: 1 }}>
                      <Text className="font-rounded text-center" style={{ fontSize: 10, color: dateStr === today ? '#e8789a' : '#c4a0ae', fontWeight: dateStr === today ? '700' : '400' }}>
                        週{weekdayLabels[d.getDay()]}
                      </Text>
                      <Text className="font-rounded text-center" style={{ fontSize: 11, color: dateStr === today ? '#e8789a' : '#7a6a70', fontWeight: dateStr === today ? '700' : '400' }}>
                        {d.getDate()}
                      </Text>
                    </View>
                  );
                })}
              </View>

              <View className="px-5 flex-row" style={{ gap: 2 }}>
              {/* 時間刻度 */}
              <View style={{ width: 28, height: TRACK_HEIGHT }}>
                {HOUR_MARKS.map(h => (
                  <Text
                    key={h}
                    className="font-rounded"
                    style={{
                      position: 'absolute',
                      top: ((h * 60 - TIMELINE_START_MIN) / (TIMELINE_END_MIN - TIMELINE_START_MIN)) * TRACK_HEIGHT - 6,
                      fontSize: 10,
                      color: '#c4a0ae',
                    }}
                  >
                    {h}
                  </Text>
                ))}
              </View>

              {/* 7 天欄位 */}
              {weekDays.map(d => {
                const dateStr = toDateStr(d);
                const dayKey = DAY_KEYS[d.getDay()];
                const dayHours = businessHours?.[dayKey];
                const shopClosed = dayHours?.open === false || holidays.some(h => h.holiday_date === dateStr && !h.staff_id);
                const dayAppointments = allAppts.filter(a => toApptDateStr(a.appointment_time) === dateStr);

                return (
                  <View key={dateStr} style={{ flex: 1 }}>
                    <View style={{ height: TRACK_HEIGHT, backgroundColor: shopClosed ? '#f5f0f2' : '#fdf1f5', borderRadius: 8, overflow: 'hidden', position: 'relative', flexDirection: 'row', gap: 1 }}>
                      {/* 每 30 分鐘一條刻度線，整點線稍深、半點線較淡 */}
                      {GRID_LINES.map(m => (
                        <View
                          key={m}
                          pointerEvents="none"
                          style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: ((m - TIMELINE_START_MIN) / (TIMELINE_END_MIN - TIMELINE_START_MIN)) * TRACK_HEIGHT,
                            height: 1,
                            backgroundColor: m % 60 === 0 ? '#e8c8d4' : '#f0dde4',
                          }}
                        />
                      ))}
                      {shopClosed ? (
                        <Text className="font-rounded" style={{ position: 'absolute', top: '46%', left: 0, right: 0, textAlign: 'center', fontSize: 10, color: '#c4a0ae' }}>休</Text>
                      ) : selectedStaffId === null ? (
                        // 全部模式：一人一條細軌道，不重疊混色
                        staffList.map(s => {
                          const staffOff = holidays.some(h => h.holiday_date === dateStr && h.staff_id === s.id);
                          const staffDayAppts = dayAppointments.filter(a => isStaffAppt(a, s));
                          const staffDayReserved = reservedSlots.filter(r => r.staff_id === s.id && r.reserved_date === dateStr);
                          return (
                            <View key={s.id} style={{ flex: 1, height: '100%', position: 'relative' }}>
                              {/* 空檔可點：30 分鐘一格，點了彈「排新預約／預留時間」選單 */}
                              {!staffOff && TAP_SLOT_MINUTES.map(min => {
                                const top = ((min - TIMELINE_START_MIN) / (TIMELINE_END_MIN - TIMELINE_START_MIN)) * TRACK_HEIGHT;
                                const slotH = (30 / (TIMELINE_END_MIN - TIMELINE_START_MIN)) * TRACK_HEIGHT;
                                const timeStr = minutesToHHMM(min);
                                return (
                                  <Pressable
                                    key={`slot-${min}`}
                                    style={{ position: 'absolute', left: 0, right: 0, top, height: slotH }}
                                    onPress={() => setSlotPicker({ dateStr, time: timeStr, staffId: s.id, staffName: s.name })}
                                  />
                                );
                              })}
                              {!staffOff && staffDayReserved.map(r => {
                                const startMin = Math.max(hhmmToMinutes(r.start_time), TIMELINE_START_MIN);
                                const endMin = Math.min(hhmmToMinutes(r.end_time), TIMELINE_END_MIN);
                                const top = ((startMin - TIMELINE_START_MIN) / (TIMELINE_END_MIN - TIMELINE_START_MIN)) * TRACK_HEIGHT;
                                const h = Math.max(((endMin - startMin) / (TIMELINE_END_MIN - TIMELINE_START_MIN)) * TRACK_HEIGHT, 4);
                                return (
                                  <Pressable
                                    key={r.id}
                                    style={({ pressed }) => ({
                                      position: 'absolute', left: 1, right: 1, top, height: h,
                                      backgroundColor: '#e5dde0', borderRadius: 3, borderWidth: 1, borderColor: '#c4a0ae',
                                      opacity: pressed ? 0.7 : 1, overflow: 'hidden',
                                    })}
                                    onPress={() => setDeleteReserveTarget(r)}
                                  >
                                    <Text numberOfLines={1} className="font-rounded" style={{ fontSize: 8, color: '#7a6a70', paddingHorizontal: 2 }}>{r.label}</Text>
                                  </Pressable>
                                );
                              })}
                              {staffOff ? null : staffDayAppts.map((a, idx) => {
                                const startMin = Math.max(timeToMinutes(a.appointment_time), TIMELINE_START_MIN);
                                const endMin = Math.min(startMin + apptDurationMin(a), TIMELINE_END_MIN);
                                const top = ((startMin - TIMELINE_START_MIN) / (TIMELINE_END_MIN - TIMELINE_START_MIN)) * TRACK_HEIGHT;
                                const h = Math.max(((endMin - startMin) / (TIMELINE_END_MIN - TIMELINE_START_MIN)) * TRACK_HEIGHT, 4);
                                return (
                                  <Pressable
                                    key={a.id}
                                    style={({ pressed }) => ({
                                      position: 'absolute', left: 1, right: 1, top, height: h,
                                      backgroundColor: APPT_BLOCK_COLORS[idx % APPT_BLOCK_COLORS.length],
                                      borderRadius: 3, borderWidth: 1.5, borderColor: s.color,
                                      opacity: pressed ? 0.7 : 1,
                                    })}
                                    onPress={() => openAppt(a)}
                                  />
                                );
                              })}
                            </View>
                          );
                        })
                      ) : (
                        // 單一人員模式：只顯示這位的預約
                        (() => {
                          const staff = staffList.find(s => s.id === selectedStaffId);
                          const staffOff = holidays.some(h => h.holiday_date === dateStr && h.staff_id === selectedStaffId);
                          if (staffOff || !staff) {
                            return staffOff ? (
                              <Text className="font-rounded" style={{ position: 'absolute', top: '46%', left: 0, right: 0, textAlign: 'center', fontSize: 10, color: '#c4a0ae' }}>休</Text>
                            ) : null;
                          }
                          const staffDayAppts = dayAppointments.filter(a => isStaffAppt(a, staff));
                          const staffDayReserved = reservedSlots.filter(r => r.staff_id === staff.id && r.reserved_date === dateStr);
                          return (
                            <View style={{ flex: 1, height: '100%', position: 'relative' }}>
                              {TAP_SLOT_MINUTES.map(min => {
                                const top = ((min - TIMELINE_START_MIN) / (TIMELINE_END_MIN - TIMELINE_START_MIN)) * TRACK_HEIGHT;
                                const slotH = (30 / (TIMELINE_END_MIN - TIMELINE_START_MIN)) * TRACK_HEIGHT;
                                const timeStr = minutesToHHMM(min);
                                return (
                                  <Pressable
                                    key={`slot-${min}`}
                                    style={{ position: 'absolute', left: 0, right: 0, top, height: slotH }}
                                    onPress={() => setSlotPicker({ dateStr, time: timeStr, staffId: staff.id, staffName: staff.name })}
                                  />
                                );
                              })}
                              {staffDayReserved.map(r => {
                                const startMin = Math.max(hhmmToMinutes(r.start_time), TIMELINE_START_MIN);
                                const endMin = Math.min(hhmmToMinutes(r.end_time), TIMELINE_END_MIN);
                                const top = ((startMin - TIMELINE_START_MIN) / (TIMELINE_END_MIN - TIMELINE_START_MIN)) * TRACK_HEIGHT;
                                const h = Math.max(((endMin - startMin) / (TIMELINE_END_MIN - TIMELINE_START_MIN)) * TRACK_HEIGHT, 4);
                                return (
                                  <Pressable
                                    key={r.id}
                                    style={({ pressed }) => ({
                                      position: 'absolute', left: 2, right: 2, top, height: h,
                                      backgroundColor: '#e5dde0', borderRadius: 4, borderWidth: 1, borderColor: '#c4a0ae',
                                      opacity: pressed ? 0.7 : 1, overflow: 'hidden',
                                    })}
                                    onPress={() => setDeleteReserveTarget(r)}
                                  >
                                    <Text numberOfLines={1} className="font-rounded" style={{ fontSize: 9, color: '#7a6a70', paddingHorizontal: 3 }}>{r.label}</Text>
                                  </Pressable>
                                );
                              })}
                              {staffDayAppts.map((a, idx) => {
                                const startMin = Math.max(timeToMinutes(a.appointment_time), TIMELINE_START_MIN);
                                const endMin = Math.min(startMin + apptDurationMin(a), TIMELINE_END_MIN);
                                const top = ((startMin - TIMELINE_START_MIN) / (TIMELINE_END_MIN - TIMELINE_START_MIN)) * TRACK_HEIGHT;
                                const h = Math.max(((endMin - startMin) / (TIMELINE_END_MIN - TIMELINE_START_MIN)) * TRACK_HEIGHT, 4);
                                return (
                                  <Pressable
                                    key={a.id}
                                    style={({ pressed }) => ({
                                      position: 'absolute', left: 2, right: 2, top, height: h,
                                      backgroundColor: APPT_BLOCK_COLORS[idx % APPT_BLOCK_COLORS.length],
                                      borderRadius: 4, borderWidth: 1.5, borderColor: staff.color,
                                      opacity: pressed ? 0.7 : 1,
                                    })}
                                    onPress={() => openAppt(a)}
                                  />
                                );
                              })}
                            </View>
                          );
                        })()
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
            </>
          )}

          {/* 人員色圖例：色塊外框顏色 = 人員，色塊本身顏色只用來區分同時段不同預約 */}
          {selectedStaffId === null && staffList.length > 0 && (
            <View className="flex-row flex-wrap gap-3 px-5 mt-4">
              {staffList.map(s => (
                <View key={s.id} className="flex-row items-center gap-1.5">
                  <View className="w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: s.color, backgroundColor: 'transparent' }} />
                  <Text className="font-rounded text-xs text-muted-foreground">{s.name}</Text>
                </View>
              ))}
            </View>
          )}
          <Text className="font-rounded text-xs text-muted-foreground px-5 mt-2">
            💡 點色塊看預約詳情並微調，點空白處可排新預約或標記預留時間
          </Text>
        </ScrollView>
      ) : (
      <ScrollView className="flex-1" contentContainerClassName="pb-10">
        {/* 月曆卡 */}
        <View className="mx-5 mb-4 bg-card rounded-2xl p-4 border border-border"
          style={{ shadowColor: '#e8789a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 }}>

          {/* 月份切換 */}
          <View className="flex-row items-center justify-between mb-3">
            <Pressable className="w-8 h-8 rounded-full items-center justify-center active:bg-muted"
              onPress={() => {
                if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
                else setCalMonth(m => m - 1);
              }}>
              <ChevronLeft size={18} color="#e8789a" />
            </Pressable>
            <Text className="font-rounded text-base font-bold text-foreground">
              {calYear} 年 {monthNames[calMonth]}
            </Text>
            <Pressable className="w-8 h-8 rounded-full items-center justify-center active:bg-muted"
              onPress={() => {
                if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
                else setCalMonth(m => m + 1);
              }}>
              <ChevronRight size={18} color="#e8789a" />
            </Pressable>
          </View>

          {/* 星期標題 */}
          <View className="flex-row mb-1">
            {weekLabels.map((w, i) => (
              <View key={w} className="flex-1 items-center">
                <Text className="font-rounded text-xs font-semibold"
                  style={{ color: i === 0 ? '#f87171' : i === 6 ? '#818cf8' : '#c4a0ae' }}>{w}</Text>
              </View>
            ))}
          </View>

          {/* 日期格 */}
          {Array.from({ length: calCells.length / 7 }, (_, row) => (
            <View key={row} className="flex-row">
              {calCells.slice(row * 7, row * 7 + 7).map((day, col) => {
                if (!day) return <View key={col} className="flex-1" />;
                const ds = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isMarked = markedDates.has(ds);
                const isSel = selectedDate === ds;
                const isToday = ds === today;
                const isPast = ds < today;
                return (
                  <Pressable key={col} className="flex-1 items-center py-0.5 gap-0.5 active:opacity-70"
                    onPress={() => setSelectedDate(ds)}>
                    <View className="w-8 h-8 rounded-full items-center justify-center"
                      style={{ backgroundColor: isSel ? '#e8789a' : isToday ? '#fce9f0' : 'transparent' }}>
                      <Text className="font-rounded text-sm font-semibold"
                        style={{
                          color: isSel ? '#fff' : isToday ? '#e8789a' : isPast ? '#d0c0c8'
                            : col === 0 ? '#f87171' : col === 6 ? '#818cf8' : '#444',
                        }}>
                        {day}
                      </Text>
                    </View>
                    <View className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: isMarked ? (isSel ? '#fff' : '#e8789a') : 'transparent' }} />
                  </Pressable>
                );
              })}
            </View>
          ))}

          {/* 說明列 */}
          <View className="flex-row items-center gap-4 pt-2 mt-1 border-t border-border">
            <View className="flex-row items-center gap-1">
              <View className="w-2 h-2 rounded-full bg-primary" />
              <Text className="font-rounded text-xs text-muted-foreground">有預約</Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <View className="w-5 h-5 rounded-full bg-primary/15 items-center justify-center">
                <User size={10} color="#e8789a" />
              </View>
              <Text className="font-rounded text-xs text-muted-foreground">手動</Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <View className="w-5 h-5 rounded-full items-center justify-center" style={{ backgroundColor: '#eef0ff' }}>
                <Globe size={10} color="#4a6cf7" />
              </View>
              <Text className="font-rounded text-xs text-muted-foreground">線上</Text>
            </View>
          </View>
        </View>

        {/* 選定日期標題 */}
        <View className="px-5 mb-3 flex-row items-center justify-between">
          <Text className="font-rounded text-sm font-bold text-foreground">
            {formatDateLabel(selectedDate)}
          </Text>
          <Text className="font-rounded text-xs text-muted-foreground">
            共 {dayAppts.length} 筆
          </Text>
        </View>

        {/* 當日預約列表 */}
        {loading ? (
          <View className="items-center py-10">
            <ActivityIndicator color="#e8789a" />
          </View>
        ) : dayAppts.length === 0 ? (
          <View className="mx-5 bg-card rounded-2xl p-8 border border-border items-center gap-3">
            <CalendarDays size={36} color="#c4a0ae" />
            <Text className="font-rounded text-sm text-muted-foreground">此日無預約 🌸</Text>
          </View>
        ) : (
          <View className="px-5 gap-3">
            {dayAppts.map(item => <ApptCard key={item.id} item={item} />)}
          </View>
        )}
      </ScrollView>
      )}

      {/* 員工點線上預約：唯讀小視窗 */}
      <OnlineOrderInfoModal item={infoAppt} onClose={() => setInfoAppt(null)} />

      {/* 點空白處：先選「排新預約」還是「預留時間」 */}
      <Modal visible={!!slotPicker} transparent animationType="fade" onRequestClose={() => setSlotPicker(null)}>
        <Pressable className="flex-1 bg-black/40 items-center justify-center px-8" onPress={() => setSlotPicker(null)}>
          <Pressable className="bg-card w-full rounded-3xl p-6 gap-3" onPress={() => {}}
            style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 10 }}>
            <Text className="font-rounded text-base font-bold text-foreground text-center">
              {slotPicker ? `${slotPicker.staffName} · ${slotPicker.time}` : ''}
            </Text>
            <Pressable
              className="flex-row items-center justify-center gap-2 rounded-2xl active:opacity-80"
              style={{ height: 52, backgroundColor: '#e8789a' }}
              onPress={() => {
                if (!slotPicker) return;
                router.push(`/(app)/appointments/new?date=${slotPicker.dateStr}&time=${slotPicker.time}&staffId=${slotPicker.staffId}` as any);
                setSlotPicker(null);
              }}
            >
              <CalendarPlus size={18} color="#fff" />
              <Text className="font-rounded text-base font-semibold text-white">排新預約</Text>
            </Pressable>
            <Pressable
              className="flex-row items-center justify-center gap-2 rounded-2xl active:opacity-70"
              style={{ height: 52, backgroundColor: '#f5e6ec' }}
              onPress={() => {
                if (!slotPicker) return;
                setReserveTarget(slotPicker);
                setReserveLabel('');
                setReserveDurationMin('30');
                setSlotPicker(null);
              }}
            >
              <Coffee size={18} color="#c4667e" />
              <Text className="font-rounded text-base font-semibold" style={{ color: '#c4667e' }}>預留時間</Text>
            </Pressable>
            <Pressable className="items-center py-1 active:opacity-70" onPress={() => setSlotPicker(null)}>
              <Text className="font-rounded text-sm text-muted-foreground">取消</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 預留時間：填標籤 */}
      <Modal visible={!!reserveTarget} transparent animationType="fade" onRequestClose={() => setReserveTarget(null)}>
        <Pressable className="flex-1 bg-black/40 items-center justify-center px-8" onPress={() => setReserveTarget(null)}>
          <Pressable className="bg-card w-full rounded-3xl p-6 gap-4" onPress={() => {}}
            style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 10 }}>
            <Text className="font-rounded text-base font-bold text-foreground text-center">
              {reserveTarget ? `${reserveTarget.staffName} · ${reserveTarget.dateStr} ${reserveTarget.time}` : ''}
            </Text>
            <View className="flex-row flex-wrap gap-2 justify-center">
              {RESERVE_LABEL_PRESETS.map(p => (
                <Pressable
                  key={p}
                  className="px-3.5 py-1.5 rounded-full active:opacity-70"
                  style={{ backgroundColor: reserveLabel === p ? '#e8789a' : '#f5e6ec' }}
                  onPress={() => setReserveLabel(p)}
                >
                  <Text className="font-rounded text-sm font-medium" style={{ color: reserveLabel === p ? '#fff' : '#c4a0ae' }}>{p}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              className="bg-background border border-border rounded-2xl px-4 font-rounded text-base text-foreground"
              style={{ height: 48 }}
              placeholder="標籤／原因（例如：午休）"
              placeholderTextColor="#c4a0ae"
              value={reserveLabel}
              onChangeText={setReserveLabel}
            />
            <View className="flex-row flex-wrap gap-2 justify-center">
              {RESERVE_DURATION_PRESETS.map(d => (
                <Pressable
                  key={d}
                  className="px-3.5 py-1.5 rounded-full active:opacity-70"
                  style={{ backgroundColor: reserveDurationMin === String(d) ? '#e8789a' : '#f5e6ec' }}
                  onPress={() => setReserveDurationMin(String(d))}
                >
                  <Text className="font-rounded text-sm font-medium" style={{ color: reserveDurationMin === String(d) ? '#fff' : '#c4a0ae' }}>{d} 分鐘</Text>
                </Pressable>
              ))}
            </View>
            <View className="flex-row items-center gap-2">
              <TextInput
                className="flex-1 bg-background border border-border rounded-2xl px-4 font-rounded text-base text-foreground"
                style={{ height: 48 }}
                placeholder="自行輸入分鐘數"
                placeholderTextColor="#c4a0ae"
                keyboardType="number-pad"
                value={reserveDurationMin}
                onChangeText={setReserveDurationMin}
              />
              <Text className="font-rounded text-sm text-muted-foreground">分鐘</Text>
            </View>
            <Pressable
              className="items-center justify-center rounded-2xl active:opacity-80"
              style={{ height: 52, backgroundColor: '#e8789a' }}
              onPress={handleCreateReserve}
              disabled={savingReserve}
            >
              {savingReserve ? <ActivityIndicator color="#fff" /> : <Text className="font-rounded text-base font-semibold text-white">確認預留</Text>}
            </Pressable>
            <Pressable className="items-center py-1 active:opacity-70" onPress={() => setReserveTarget(null)}>
              <Text className="font-rounded text-sm text-muted-foreground">取消</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 刪除預留時間確認 */}
      <Modal visible={!!deleteReserveTarget} transparent animationType="fade" onRequestClose={() => setDeleteReserveTarget(null)}>
        <Pressable className="flex-1 bg-black/40 items-center justify-center px-8" onPress={() => setDeleteReserveTarget(null)}>
          <Pressable className="bg-card w-full rounded-3xl p-6 gap-4" onPress={() => {}}
            style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 10 }}>
            <View className="items-center gap-3">
              <View className="w-16 h-16 rounded-full items-center justify-center" style={{ backgroundColor: '#fff0f3' }}>
                <Trash2 size={32} color="#e85454" />
              </View>
              <Text className="font-rounded text-lg font-bold text-foreground">
                {deleteReserveTarget ? `刪除「${deleteReserveTarget.label}」？` : ''}
              </Text>
              <Text className="font-rounded text-sm text-muted-foreground text-center">
                {deleteReserveTarget ? `${deleteReserveTarget.reserved_date} ${deleteReserveTarget.start_time}–${deleteReserveTarget.end_time}` : ''}
              </Text>
            </View>
            <View className="flex-row gap-3">
              <Pressable className="flex-1 h-12 rounded-2xl border border-border items-center justify-center active:opacity-70"
                onPress={() => setDeleteReserveTarget(null)}>
                <Text className="font-rounded text-sm font-semibold text-muted-foreground">取消</Text>
              </Pressable>
              <Pressable className="flex-1 h-12 rounded-2xl items-center justify-center active:opacity-80"
                style={{ backgroundColor: '#e85454' }}
                disabled={deletingReserve}
                onPress={handleDeleteReserve}>
                {deletingReserve ? <ActivityIndicator color="#fff" size="small" /> : <Text className="font-rounded text-sm font-semibold text-white">確認刪除</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
