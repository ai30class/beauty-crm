import { View, Text, Pressable } from 'react-native';
import type { UnifiedAppointment, StaffRosterEntry, StaffReservedSlot, Holiday, DayHours } from '@/types/types';
import { isStaffFree, dayOpenRange, minutesToHHMM } from '@/lib/schedule';

// 整週空檔一覽：橫軸 7 天、縱軸每 30 分鐘一列。
// 格子＝「從這個時間開始，連續 durationMin 分鐘」有幾位設計師有空（只選一位設計師時顯示 ✓）。
// 點有空的格子 → onPick，由排班表開「選設計師／排新預約」小視窗。
// 只看預約、預留時間、休假、營業時間與店休；不含線上預約專用的封閉時段（那些只影響顧客預約頁）。

const CELL_H = 30;
const LABEL_W = 34;

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function FreeSlotGrid({
  weekDays, staffPool, durationMin, appts, reserved, holidays, hoursFor,
  startMin, endMin, today, onPick,
}: {
  weekDays: Date[];
  staffPool: StaffRosterEntry[];
  durationMin: number;
  appts: UnifiedAppointment[];
  reserved: StaffReservedSlot[];
  holidays: Holiday[];
  hoursFor: (d: Date) => DayHours | undefined;
  startMin: number;
  endMin: number;
  today: string;
  onPick: (dateStr: string, time: string, freeStaff: StaffRosterEntry[]) => void;
}) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const rows: number[] = [];
  for (let m = startMin; m < endMin; m += 30) rows.push(m);
  const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六'];
  const single = staffPool.length === 1;

  return (
    <View className="px-5">
      {/* 星期＋日期標題 */}
      <View className="flex-row mb-1" style={{ gap: 2 }}>
        <View style={{ width: LABEL_W }} />
        {weekDays.map(d => {
          const ds = toDateStr(d);
          return (
            <View key={ds} style={{ flex: 1 }}>
              <Text className="font-rounded text-center" style={{ fontSize: 10, color: ds === today ? '#e8789a' : '#c4a0ae', fontWeight: ds === today ? '700' : '400' }}>
                週{weekdayLabels[d.getDay()]}
              </Text>
              <Text className="font-rounded text-center" style={{ fontSize: 11, color: ds === today ? '#e8789a' : '#7a6a70', fontWeight: ds === today ? '700' : '400' }}>
                {d.getDate()}
              </Text>
            </View>
          );
        })}
      </View>

      {rows.map(m => (
        <View key={m} className="flex-row" style={{ gap: 2, marginBottom: 2 }}>
          <View style={{ width: LABEL_W, height: CELL_H, justifyContent: 'center' }}>
            <Text className="font-rounded" style={{ fontSize: 10, color: '#c4a0ae' }}>{minutesToHHMM(m)}</Text>
          </View>
          {weekDays.map(d => {
            const ds = toDateStr(d);
            const range = dayOpenRange(hoursFor(d), startMin, endMin);
            const shopClosed = !range || holidays.some(h => h.holiday_date === ds && !h.staff_id);
            const cellStyle = { flex: 1, height: CELL_H, borderRadius: 6, alignItems: 'center' as const, justifyContent: 'center' as const };
            if (shopClosed) {
              return (
                <View key={ds} style={{ ...cellStyle, backgroundColor: '#f5f0f2' }}>
                  {m === startMin && <Text className="font-rounded" style={{ fontSize: 10, color: '#c4a0ae' }}>休</Text>}
                </View>
              );
            }
            const inHours = m >= range.open && m + durationMin <= range.close;
            const inPast = ds < today || (ds === today && m < nowMin);
            const freeStaff = inHours && !inPast
              ? staffPool.filter(s => isStaffFree(s, ds, m, durationMin, appts, reserved, holidays))
              : [];
            if (freeStaff.length === 0) {
              return <View key={ds} style={{ ...cellStyle, backgroundColor: inHours && !inPast ? '#fdf1f5' : '#f5f0f2' }} />;
            }
            const ratio = freeStaff.length / staffPool.length;
            return (
              <Pressable
                key={ds}
                style={({ pressed }) => ({
                  ...cellStyle,
                  backgroundColor: ratio >= 1 ? '#bfe8d6' : '#dff3ea',
                  opacity: pressed ? 0.7 : 1,
                })}
                onPress={() => onPick(ds, minutesToHHMM(m), freeStaff)}
              >
                <Text className="font-rounded" style={{ fontSize: 12, fontWeight: '700', color: '#2ea87e' }}>
                  {single ? '✓' : freeStaff.length}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
