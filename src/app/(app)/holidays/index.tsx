import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Plus, Trash2, CalendarX, ChevronDown, User2, Ban } from 'lucide-react-native';
import DateTimePicker from 'react-native-ui-datepicker';
import {
  getAllHolidays, createHoliday, deleteHoliday, getStaffForPicker,
  getMyStaffPermissions, getMyStaffLink, getShopBlockedSlots, createShopBlockedSlot, deleteShopBlockedSlot,
} from '@/db/api';
import type { Holiday, StaffRosterEntry, ShopBlockedSlot } from '@/types/types';
import TimeSelector from '@/components/TimeSelector';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_LABELS: Record<(typeof DAY_KEYS)[number], string> = {
  mon: '週一', tue: '週二', wed: '週三', thu: '週四', fri: '週五', sat: '週六', sun: '週日',
};

function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function HolidaysScreen() {
  const router = useRouter();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [staffList, setStaffList] = useState<StaffRosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [pickedDate, setPickedDate] = useState<Date>(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [note, setNote] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null); // null = 全店
  const [showStaffPicker, setShowStaffPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 員工帳號：只能管理「自己的」休假與封鎖時段（商家要開「可管理自己的休假與封鎖時段」開關）；
  // 整家店的公休（全店）永遠只有商家能改，員工只讀。商家帳號畫面不變。
  const [isStaff, setIsStaff] = useState(false);
  const [canOwnTimeOff, setCanOwnTimeOff] = useState(true);
  const [myStaffId, setMyStaffId] = useState<string | null>(null);
  const canEdit = !isStaff || canOwnTimeOff;

  // 員工自己的封鎖時段（不開放線上預約）
  const [blockedSlots, setBlockedSlots] = useState<ShopBlockedSlot[]>([]);
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [slotStart, setSlotStart] = useState('12:00');
  const [slotEnd, setSlotEnd] = useState('13:00');
  const [slotMode, setSlotMode] = useState<'every' | 'once'>('every');
  const [slotDays, setSlotDays] = useState<string[]>([]);
  const [slotDate, setSlotDate] = useState<Date>(new Date());
  const [showSlotDatePicker, setShowSlotDatePicker] = useState(false);
  const [savingSlot, setSavingSlot] = useState(false);
  const [slotError, setSlotError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [h, s, perms] = await Promise.all([getAllHolidays(), getStaffForPicker(), getMyStaffPermissions()]);
      setHolidays(h);
      setStaffList(s);
      setIsStaff(perms.isStaff);
      setCanOwnTimeOff(!perms.isStaff || perms.canManageOwnTimeOff);
      if (perms.isStaff) {
        const link = await getMyStaffLink().catch(() => null);
        setMyStaffId(link?.staffId ?? null);
        if (link) {
          const all = await getShopBlockedSlots().catch(() => [] as ShopBlockedSlot[]);
          setBlockedSlots(all.filter(b => b.staff_id === link.staffId));
        }
      }
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAdd = async () => {
    setError('');
    const dateStr = toLocalDateStr(pickedDate);
    // 員工只能替自己新增休假，對象固定是自己
    const targetStaffId = isStaff ? myStaffId : selectedStaffId;
    if (isStaff && !targetStaffId) { setError('找不到您的員工資料，請重新登入'); return; }
    const conflict = holidays.find(h =>
      h.holiday_date === dateStr &&
      (h.staff_id === targetStaffId || (h.staff_id === null && targetStaffId === null))
    );
    if (conflict) { setError('該日期已設定相同的公休紀錄'); return; }
    setSaving(true);
    try {
      await createHoliday(dateStr, note.trim() || undefined, targetStaffId);
      setNote(''); setSelectedStaffId(null); setShowAdd(false); load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    await deleteHoliday(id); load();
  };

  const toggleSlotDay = (d: string) =>
    setSlotDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const handleAddSlot = async () => {
    setSlotError('');
    if (!myStaffId) { setSlotError('找不到您的員工資料，請重新登入'); return; }
    if (slotStart >= slotEnd) { setSlotError('請選擇正確的開始與結束時間'); return; }
    setSavingSlot(true);
    try {
      await createShopBlockedSlot({
        // 個人封鎖時段不開放自訂文字：顧客帳號讀得到這張表，避免員工把私事寫進去
        label: '個人封鎖',
        start_time: slotStart,
        end_time: slotEnd,
        applies_to: slotMode === 'once' ? [] : slotDays,
        specific_date: slotMode === 'once' ? toLocalDateStr(slotDate) : null,
        staff_id: myStaffId,
      });
      setShowAddSlot(false); setSlotStart('12:00'); setSlotEnd('13:00');
      setSlotMode('every'); setSlotDays([]); setSlotDate(new Date());
      load();
    } catch (e: any) { setSlotError(e.message ?? '新增失敗'); }
    finally { setSavingSlot(false); }
  };

  const handleDeleteSlot = async (id: string) => {
    await deleteShopBlockedSlot(id); load();
  };

  // 依月份分組
  const grouped = holidays.reduce<Record<string, Holiday[]>>((acc, h) => {
    const key = h.holiday_date.slice(0, 7);
    if (!acc[key]) acc[key] = [];
    acc[key].push(h);
    return acc;
  }, {});
  const months = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const selectedStaffName = selectedStaffId
    ? (staffList.find(s => s.id === selectedStaffId)?.name ?? '—')
    : '全店公休';

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2" onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">{isStaff ? '我的休假與封鎖時段' : '公休日管理'}</Text>
        {canEdit && (
        <Pressable
          className="flex-row items-center gap-1 bg-primary/10 px-3 py-2 rounded-full active:opacity-70"
          onPress={() => setShowAdd(!showAdd)}
        >
          <Plus size={16} color="#e8789a" />
          <Text className="font-rounded text-sm text-primary font-medium">{isStaff ? '新增休假' : '新增'}</Text>
        </Pressable>
        )}
      </View>

      <ScrollView contentContainerClassName="px-5 pb-24 gap-4">

        {/* 新增公休 */}
        {isStaff && !canOwnTimeOff && (
          <View className="bg-card rounded-2xl p-4 border border-border">
            <Text className="font-rounded text-sm text-muted-foreground">
              目前只能查看。要自己設定休假與封鎖時段，請商家在員工管理幫您開啟「可管理自己的休假與封鎖時段」。整家店的公休日一律由商家設定。
            </Text>
          </View>
        )}

        {canEdit && showAdd && (
          <View className="bg-card rounded-2xl p-4 border border-primary/30 gap-3">
            <Text className="font-rounded text-sm font-semibold text-foreground">{isStaff ? '設定我的休假日期' : '設定公休日期'}</Text>

            {/* 人員選擇（員工帳號只能設定自己，不顯示） */}
            {!isStaff && <View>
              <Text className="font-rounded text-xs text-muted-foreground mb-1.5">適用對象</Text>
              <Pressable
                className="bg-background border border-border rounded-xl px-4 h-11 flex-row items-center justify-between active:opacity-80"
                onPress={() => setShowStaffPicker(!showStaffPicker)}
              >
                <View className="flex-row items-center gap-2">
                  <User2 size={14} color="#e8789a" />
                  <Text className="font-rounded text-sm text-foreground">{selectedStaffName}</Text>
                </View>
                <ChevronDown size={14} color="#c4a0ae" />
              </Pressable>
              {showStaffPicker && (
                <View className="bg-background border border-border rounded-xl mt-1 overflow-hidden">
                  {/* 全店選項 */}
                  <Pressable
                    className="px-4 py-3 flex-row items-center border-b border-border active:bg-muted"
                    onPress={() => { setSelectedStaffId(null); setShowStaffPicker(false); }}
                  >
                    <View className="w-6 h-6 rounded-full bg-primary/15 items-center justify-center mr-2">
                      <Text className="font-rounded text-xs text-primary">全</Text>
                    </View>
                    <Text className="font-rounded text-sm text-foreground flex-1">全店公休</Text>
                    {selectedStaffId === null && <Text className="font-rounded text-xs text-primary">✓</Text>}
                  </Pressable>
                  {staffList.map(s => (
                    <Pressable
                      key={s.id}
                      className="px-4 py-3 flex-row items-center border-b border-border last:border-0 active:bg-muted"
                      onPress={() => { setSelectedStaffId(s.id); setShowStaffPicker(false); }}
                    >
                      <View className="w-6 h-6 rounded-full items-center justify-center mr-2" style={{ backgroundColor: s.color + '33' }}>
                        <Text className="font-rounded text-xs font-bold" style={{ color: s.color }}>{s.name.charAt(0)}</Text>
                      </View>
                      <Text className="font-rounded text-sm text-foreground flex-1">{s.name}</Text>
                      {selectedStaffId === s.id && <Text className="font-rounded text-xs text-primary">✓</Text>}
                    </Pressable>
                  ))}
                </View>
              )}
            </View>}

            {/* 日期選擇 */}
            <Pressable
              className="bg-background border border-border rounded-xl px-4 h-11 flex-row items-center justify-between active:opacity-80"
              onPress={() => setShowPicker(!showPicker)}
            >
              <Text className="font-rounded text-base text-foreground">{toLocalDateStr(pickedDate)}</Text>
              <CalendarX size={16} color="#e8789a" />
            </Pressable>

            {showPicker && (
              <View className="bg-background border border-border rounded-xl overflow-hidden">
                <DateTimePicker locale="zh-tw"
                  mode="single"
                  date={pickedDate}
                  onChange={(params) => {
                    if (params.date) setPickedDate(params.date as Date);
                    setShowPicker(false);
                  }}
                />
              </View>
            )}

            <TextInput
              className="bg-background border border-border rounded-xl px-4 h-11 font-rounded text-base text-foreground"
              placeholder="備註（選填，如：農曆春節）"
              placeholderTextColor="#c4a0ae"
              value={note}
              onChangeText={setNote}
            />

            {error ? <Text className="font-rounded text-xs text-destructive">{error}</Text> : null}

            <View className="flex-row gap-2">
              <Pressable className="flex-1 bg-primary rounded-xl py-2.5 items-center active:opacity-80" onPress={handleAdd} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text className="font-rounded text-sm text-white font-medium">確認新增</Text>}
              </Pressable>
              <Pressable className="flex-1 bg-muted rounded-xl py-2.5 items-center active:opacity-70"
                onPress={() => { setShowAdd(false); setNote(''); setError(''); setSelectedStaffId(null); }}>
                <Text className="font-rounded text-sm text-muted-foreground">取消</Text>
              </Pressable>
            </View>
          </View>
        )}

        {loading ? (
          <View className="py-20 items-center"><ActivityIndicator color="#e8789a" /></View>
        ) : holidays.length === 0 ? (
          <View className="items-center py-20 gap-3">
            <CalendarX size={48} color="#c4a0ae" />
            <Text className="font-rounded text-base text-muted-foreground">尚未設定公休日</Text>
          </View>
        ) : (
          months.map(monthKey => {
            const [y, m] = monthKey.split('-');
            return (
              <View key={monthKey} className="bg-card rounded-2xl p-4 border border-border">
                <Text className="font-rounded text-sm font-semibold text-muted-foreground mb-3">
                  {y} 年 {Number(m)} 月
                </Text>
                {grouped[monthKey].map((h, i) => {
                  const d = new Date(h.holiday_date + 'T00:00:00');
                  const weekDay = ['日','一','二','三','四','五','六'][d.getDay()];
                  // 員工帳號讀不到 staff 表，embed 是 null，改用同店名單補名字與顏色
                  const staffInfo = (h.staff as { name: string; color: string } | null | undefined)
                    ?? (h.staff_id ? staffList.find(s => s.id === h.staff_id) : null);
                  // 商家：全部可刪；員工：只能刪自己的（全店公休與同事的休假只讀）
                  const canDeleteThis = !isStaff || (canOwnTimeOff && h.staff_id !== null && h.staff_id === myStaffId);
                  return (
                    <View key={h.id} className={`flex-row items-center py-2.5 ${i > 0 ? 'border-t border-border' : ''}`}>
                      <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center mr-3">
                        <Text className="font-rounded text-sm font-bold text-primary">{d.getDate()}</Text>
                        <Text className="font-rounded text-primary" style={{ fontSize: 9 }}>週{weekDay}</Text>
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <Text className="font-rounded text-sm text-foreground font-medium">{h.holiday_date}</Text>
                          {/* 人員標籤 */}
                          {staffInfo ? (
                            <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: staffInfo.color + '22' }}>
                              <Text className="font-rounded text-xs font-medium" style={{ color: staffInfo.color }}>{staffInfo.name}</Text>
                            </View>
                          ) : (
                            <View className="px-2 py-0.5 rounded-full bg-primary/10">
                              <Text className="font-rounded text-xs text-primary">全店</Text>
                            </View>
                          )}
                        </View>
                        {h.note && <Text className="font-rounded text-xs text-muted-foreground">{h.note}</Text>}
                      </View>
                      {canDeleteThis && (
                      <Pressable className="w-8 h-8 items-center justify-center rounded-full active:bg-muted"
                        onPress={() => handleDelete(h.id)}>
                        <Trash2 size={15} color="#e85454" />
                      </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
            );
          })
        )}

        {/* 員工：我的封鎖時段（這段時間顧客在線上預約頁選不到我；不會影響其他設計師） */}
        {isStaff && (
          <View className="bg-card rounded-2xl p-4 border border-border gap-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Ban size={16} color="#e8789a" />
                <Text className="font-rounded text-base font-semibold text-foreground">我的封鎖時段</Text>
              </View>
              {canOwnTimeOff && (
                <Pressable className="active:opacity-70" onPress={() => setShowAddSlot(v => !v)}>
                  <Plus size={20} color="#e8789a" />
                </Pressable>
              )}
            </View>
            <Text className="font-rounded text-xs text-muted-foreground">
              設定後，顧客在線上預約頁選您時，這段時間會顯示為不可預約（如每週三下午不接客）。不影響其他設計師，也不會擋掉您在店裡直接排的預約。
            </Text>

            {canOwnTimeOff && showAddSlot && (
              <View className="bg-background rounded-xl p-3 border border-border gap-2">
                <View className="flex-row items-center gap-2">
                  <Text className="font-rounded text-xs text-muted-foreground w-8">開始</Text>
                  <TimeSelector value={slotStart} onChange={setSlotStart} />
                  <Text className="font-rounded text-xs text-muted-foreground">至</Text>
                  <TimeSelector value={slotEnd} onChange={setSlotEnd} />
                </View>
                <View className="flex-row gap-2 mt-1">
                  {(['every', 'once'] as const).map(mode => (
                    <Pressable
                      key={mode}
                      className="flex-1 py-2 rounded-xl items-center active:opacity-70"
                      style={{ backgroundColor: slotMode === mode ? '#e8789a' : '#f5e6ec' }}
                      onPress={() => setSlotMode(mode)}
                    >
                      <Text className="font-rounded text-xs font-medium" style={{ color: slotMode === mode ? '#fff' : '#c4a0ae' }}>
                        {mode === 'every' ? '每週固定' : '只有某一天'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {slotMode === 'every' ? (
                  <View className="flex-row flex-wrap gap-1 mt-1">
                    {DAY_KEYS.map(d => (
                      <Pressable
                        key={d}
                        onPress={() => toggleSlotDay(d)}
                        className="px-2 py-1 rounded-full border active:opacity-70"
                        style={{ borderColor: slotDays.includes(d) ? '#e8789a' : '#e8d5dc', backgroundColor: slotDays.includes(d) ? '#fce9f0' : 'transparent' }}
                      >
                        <Text className="font-rounded text-xs" style={{ color: slotDays.includes(d) ? '#e8789a' : '#c4a0ae' }}>{DAY_LABELS[d]}</Text>
                      </Pressable>
                    ))}
                    <Text className="font-rounded text-xs text-muted-foreground self-center ml-1">（不選=每天）</Text>
                  </View>
                ) : (
                  <View className="mt-1">
                    <Pressable
                      className="flex-row items-center justify-between bg-card border border-border rounded-xl px-3 h-10 active:opacity-70"
                      onPress={() => setShowSlotDatePicker(v => !v)}
                    >
                      <Text className="font-rounded text-sm text-foreground">{toLocalDateStr(slotDate)}</Text>
                      <ChevronDown size={14} color="#c4a0ae" />
                    </Pressable>
                    {showSlotDatePicker && (
                      <View className="bg-card border border-border rounded-xl mt-2 overflow-hidden">
                        <DateTimePicker locale="zh-tw"
                          mode="single"
                          date={slotDate}
                          minDate={new Date()}
                          onChange={(params) => {
                            if (params.date) setSlotDate(params.date as Date);
                            setShowSlotDatePicker(false);
                          }}
                        />
                      </View>
                    )}
                  </View>
                )}
                {slotError ? <Text className="font-rounded text-xs text-destructive">{slotError}</Text> : null}
                <Pressable
                  className="bg-primary rounded-xl items-center justify-center active:opacity-80 mt-1"
                  style={{ height: 38 }}
                  onPress={handleAddSlot}
                  disabled={savingSlot}
                >
                  {savingSlot ? <ActivityIndicator color="#fff" size="small" /> : <Text className="font-rounded text-white text-sm font-semibold">新增封鎖時段</Text>}
                </Pressable>
              </View>
            )}

            {blockedSlots.length === 0 ? (
              <Text className="font-rounded text-sm text-muted-foreground text-center py-2">尚未設定封鎖時段</Text>
            ) : (
              blockedSlots.map((b, i) => (
                <View key={b.id} className={`flex-row items-center py-2.5 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <View className="flex-1">
                    <Text className="font-rounded text-sm font-semibold text-foreground">{b.start_time} – {b.end_time}</Text>
                    <Text className="font-rounded text-xs text-muted-foreground">
                      {b.specific_date
                        ? `${b.specific_date}（單次）`
                        : b.applies_to.length > 0
                          ? b.applies_to.map(d => DAY_LABELS[d as keyof typeof DAY_LABELS] ?? d).join('、')
                          : '每天'}
                    </Text>
                  </View>
                  {canOwnTimeOff && (
                    <Pressable className="w-8 h-8 items-center justify-center active:opacity-70" onPress={() => handleDeleteSlot(b.id)}>
                      <Trash2 size={15} color="#e85454" />
                    </Pressable>
                  )}
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
