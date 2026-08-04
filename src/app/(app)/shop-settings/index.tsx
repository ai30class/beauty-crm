import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  ActivityIndicator, KeyboardAvoidingView, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowLeft, Store, Phone, MapPin, FileText, Clock, ChevronDown, ChevronUp,
  Plus, Trash2, Ban,
} from 'lucide-react-native';
import { getShopProfile, upsertShopProfile, DEFAULT_HOURS, getShopBlockedSlots, createShopBlockedSlot, deleteShopBlockedSlot } from '@/db/api';
import type { BusinessHours, DayHours, ShopBlockedSlot } from '@/types/types';

// ── 常數 ──────────────────────────────────────────────────────────────────────

const DAY_KEYS: (keyof BusinessHours)[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS: Record<keyof BusinessHours, string> = {
  mon: '週一', tue: '週二', wed: '週三', thu: '週四',
  fri: '週五', sat: '週六', sun: '週日',
};

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

// ── 時間選擇器（小型捲動選單） ───────────────────────────────────────────────
function TimeSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ position: 'relative' }}>
      <Pressable
        className="flex-row items-center bg-background border border-border rounded-xl px-3 py-2 gap-1 active:opacity-70"
        onPress={() => setOpen(o => !o)}
      >
        <Text className="font-rounded text-sm text-foreground">{value}</Text>
        {open ? <ChevronUp size={12} color="#c4a0ae" /> : <ChevronDown size={12} color="#c4a0ae" />}
      </Pressable>
      {open && (
        <View
          className="absolute z-50 bg-card border border-border rounded-xl overflow-hidden"
          style={{ top: 40, left: 0, width: 90, maxHeight: 200, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 8 }}
        >
          <ScrollView nestedScrollEnabled>
            {TIME_OPTIONS.map(t => (
              <Pressable
                key={t}
                className="px-3 py-2 active:bg-muted"
                style={{ backgroundColor: t === value ? '#fce9f0' : 'transparent' }}
                onPress={() => { onChange(t); setOpen(false); }}
              >
                <Text className="font-rounded text-sm" style={{ color: t === value ? '#e8789a' : '#333' }}>{t}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ── 單日營業時間列 ─────────────────────────────────────────────────────────────
function DayRow({
  label, hours, onChange,
}: {
  label: string;
  hours: DayHours;
  onChange: (h: DayHours) => void;
}) {
  return (
    <View className="flex-row items-center py-3 border-b border-border gap-3">
      <Text className="font-rounded text-sm font-medium text-foreground w-10">{label}</Text>
      <Switch
        value={hours.open}
        onValueChange={v => onChange({ ...hours, open: v })}
        trackColor={{ false: '#f0e0e8', true: '#e8789a' }}
        thumbColor="#fff"
        style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
      />
      {hours.open ? (
        <View className="flex-1 flex-row items-center gap-2">
          <TimeSelector value={hours.start} onChange={v => onChange({ ...hours, start: v })} />
          <Text className="font-rounded text-xs text-muted-foreground">至</Text>
          <TimeSelector value={hours.end} onChange={v => onChange({ ...hours, end: v })} />
        </View>
      ) : (
        <Text className="font-rounded text-sm text-muted-foreground flex-1">公休</Text>
      )}
    </View>
  );
}

// ── 主頁面 ────────────────────────────────────────────────────────────────────
export default function ShopSettingsScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // 商家基本資訊
  const [shopName, setShopName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');

  // 營業時間
  const [hours, setHours] = useState<BusinessHours>(DEFAULT_HOURS);

  // 全店封閉時段
  const [blockedSlots, setBlockedSlots] = useState<ShopBlockedSlot[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newStart, setNewStart] = useState('12:00');
  const [newEnd, setNewEnd] = useState('13:00');
  const [newDays, setNewDays] = useState<string[]>([]);
  const [addingSlot, setAddingSlot] = useState(false);
  const [showAddSlot, setShowAddSlot] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const profile = await getShopProfile();
        if (profile) {
          setShopName(profile.shop_name);
          setPhone(profile.phone);
          setAddress(profile.address);
          setDescription(profile.description);
          setHours({ ...DEFAULT_HOURS, ...profile.business_hours });
        }
        const bs = await getShopBlockedSlots();
        setBlockedSlots(bs);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleDay = (d: string) =>
    setNewDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const handleAddSlot = async () => {
    if (!newStart || !newEnd || newStart >= newEnd) { setError('請選擇正確的開始與結束時間'); return; }
    setAddingSlot(true);
    try {
      await createShopBlockedSlot({ label: newLabel.trim(), start_time: newStart, end_time: newEnd, applies_to: newDays });
      const bs = await getShopBlockedSlots();
      setBlockedSlots(bs);
      setNewLabel(''); setNewStart('12:00'); setNewEnd('13:00'); setNewDays([]); setShowAddSlot(false);
    } catch (e: any) {
      setError(e.message ?? '新增失敗');
    } finally {
      setAddingSlot(false);
    }
  };

  const handleDeleteSlot = async (slotId: string) => {
    await deleteShopBlockedSlot(slotId);
    setBlockedSlots(prev => prev.filter(s => s.id !== slotId));
  };

  const updateDay = (key: keyof BusinessHours, val: DayHours) => {
    setHours(prev => ({ ...prev, [key]: val }));
  };

  const handleSave = async () => {
    setError('');
    setSuccess(false);
    if (!shopName.trim()) { setError('請填寫商家名稱'); return; }
    setSaving(true);
    try {
      await upsertShopProfile({
        shop_name: shopName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        description: description.trim(),
        business_hours: hours,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (e: any) {
      setError(e.message ?? '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#e8789a" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <StatusBar style="dark" backgroundColor="#fff5f7" />

      {/* Header */}
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background border-b border-border">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2" onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">商家資訊設定</Text>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="px-5 pb-16 gap-5"
        className="bg-background"
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* ── 基本資訊 ── */}
        <View className="mt-5">
          <View className="flex-row items-center gap-2 mb-3">
            <Store size={16} color="#e8789a" />
            <Text className="font-rounded text-base font-bold text-foreground">基本資訊</Text>
          </View>

          <View className="bg-card border border-border rounded-2xl overflow-hidden">
            {/* 商家名稱 */}
            <View className="px-4 py-3 border-b border-border">
              <Text className="font-rounded text-xs text-muted-foreground mb-1">商家名稱 *</Text>
              <TextInput
                className="font-rounded text-base text-foreground"
                placeholder="請輸入商家名稱"
                placeholderTextColor="#c4a0ae"
                value={shopName}
                onChangeText={setShopName}
                returnKeyType="next"
              />
            </View>

            {/* 電話 */}
            <View className="px-4 py-3 border-b border-border flex-row items-center gap-2">
              <Phone size={14} color="#c4a0ae" />
              <View className="flex-1">
                <Text className="font-rounded text-xs text-muted-foreground mb-1">聯絡電話</Text>
                <TextInput
                  className="font-rounded text-base text-foreground"
                  placeholder="02-xxxx-xxxx / 09xx-xxx-xxx"
                  placeholderTextColor="#c4a0ae"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* 地址 */}
            <View className="px-4 py-3 border-b border-border flex-row items-center gap-2">
              <MapPin size={14} color="#c4a0ae" />
              <View className="flex-1">
                <Text className="font-rounded text-xs text-muted-foreground mb-1">店面地址</Text>
                <TextInput
                  className="font-rounded text-base text-foreground"
                  placeholder="例：台北市大安區忠孝東路四段 1 號"
                  placeholderTextColor="#c4a0ae"
                  value={address}
                  onChangeText={setAddress}
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* 簡介 */}
            <View className="px-4 py-3 flex-row items-start gap-2">
              <FileText size={14} color="#c4a0ae" style={{ marginTop: 18 }} />
              <View className="flex-1">
                <Text className="font-rounded text-xs text-muted-foreground mb-1">店家簡介</Text>
                <TextInput
                  className="font-rounded text-base text-foreground"
                  placeholder="簡短介紹你的店，顯示於線上預約頁面"
                  placeholderTextColor="#c4a0ae"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  style={{ minHeight: 72 }}
                />
              </View>
            </View>
          </View>
        </View>

        {/* ── 營業時間 ── */}
        <View>
          <View className="flex-row items-center gap-2 mb-3">
            <Clock size={16} color="#e8789a" />
            <Text className="font-rounded text-base font-bold text-foreground">營業時間</Text>
          </View>
          <View className="bg-card border border-border rounded-2xl px-4">
            {DAY_KEYS.map((key, i) => (
              <DayRow
                key={key}
                label={DAY_LABELS[key]}
                hours={hours[key]}
                onChange={val => updateDay(key, val)}
              />
            ))}
            {/* 最後一列移除 border-b */}
          </View>
          <Text className="font-rounded text-xs text-muted-foreground mt-2 px-1">
            💡 關閉當天開關即代表公休，線上預約系統將自動封鎖該日
          </Text>
        </View>

        {/* 錯誤 / 成功提示 */}
        {error ? (
          <View className="bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
            <Text className="font-rounded text-sm text-destructive">{error}</Text>
          </View>
        ) : null}
        {success ? (
          <View className="rounded-xl px-4 py-3" style={{ backgroundColor: '#e0f5ef', borderWidth: 1, borderColor: '#b2e0d4' }}>
            <Text className="font-rounded text-sm font-semibold" style={{ color: '#3da870' }}>✓ 商家資訊已儲存</Text>
          </View>
        ) : null}

        {/* ── 全店封閉時段 ─────────────────────────────────── */}
        <View className="mx-5 mb-4 bg-card rounded-2xl p-4 border border-border">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center gap-2">
              <Ban size={16} color="#e8789a" />
              <Text className="font-rounded text-base font-semibold text-foreground">封閉時段設定</Text>
            </View>
            <Pressable className="active:opacity-70" onPress={() => setShowAddSlot(v => !v)}>
              <Plus size={20} color="#e8789a" />
            </Pressable>
          </View>
          <Text className="font-rounded text-xs text-muted-foreground mb-3">
            設定後，線上預約頁面該時段將自動標示為不可預約（如午休、下午茶時間）
          </Text>

          {/* 新增表單 */}
          {showAddSlot && (
            <View className="bg-background rounded-xl p-3 mb-3 border border-border gap-2">
              <TextInput
                className="font-rounded text-sm text-foreground bg-card border border-border rounded-xl px-3 py-2"
                placeholder="說明（如：午休）"
                placeholderTextColor="#c4a0ae"
                value={newLabel}
                onChangeText={setNewLabel}
              />
              <View className="flex-row items-center gap-2">
                <Text className="font-rounded text-xs text-muted-foreground w-8">開始</Text>
                <TimeSelector value={newStart} onChange={setNewStart} />
                <Text className="font-rounded text-xs text-muted-foreground">至</Text>
                <TimeSelector value={newEnd} onChange={setNewEnd} />
              </View>
              {/* 適用星期 */}
              <View className="flex-row flex-wrap gap-1 mt-1">
                {DAY_KEYS.map(d => (
                  <Pressable
                    key={d}
                    onPress={() => toggleDay(d)}
                    className="px-2 py-1 rounded-full border active:opacity-70"
                    style={{ borderColor: newDays.includes(d) ? '#e8789a' : '#e8d5dc', backgroundColor: newDays.includes(d) ? '#fce9f0' : 'transparent' }}
                  >
                    <Text className="font-rounded text-xs" style={{ color: newDays.includes(d) ? '#e8789a' : '#c4a0ae' }}>
                      {DAY_LABELS[d]}
                    </Text>
                  </Pressable>
                ))}
                <Text className="font-rounded text-xs text-muted-foreground self-center ml-1">（不選=每天）</Text>
              </View>
              <Pressable
                className="bg-primary rounded-xl items-center justify-center active:opacity-80 mt-1"
                style={{ height: 38 }}
                onPress={handleAddSlot}
                disabled={addingSlot}
              >
                {addingSlot ? <ActivityIndicator color="#fff" size="small" /> : <Text className="font-rounded text-white text-sm font-semibold">新增封閉時段</Text>}
              </Pressable>
            </View>
          )}

          {/* 已設定清單 */}
          {blockedSlots.length === 0 ? (
            <Text className="font-rounded text-sm text-muted-foreground text-center py-2">尚未設定封閉時段</Text>
          ) : (
            blockedSlots.map((s, i) => (
              <View key={s.id} className={`flex-row items-center py-2.5 ${i > 0 ? 'border-t border-border' : ''}`}>
                <View className="flex-1">
                  <Text className="font-rounded text-sm font-semibold text-foreground">{s.label || '封閉時段'}</Text>
                  <Text className="font-rounded text-xs text-muted-foreground">
                    {s.start_time} – {s.end_time}
                    {s.applies_to.length > 0 ? `　${s.applies_to.map(d => DAY_LABELS[d as keyof BusinessHours]).join('、')}` : '　每天'}
                  </Text>
                </View>
                <Pressable className="w-8 h-8 items-center justify-center active:opacity-70" onPress={() => handleDeleteSlot(s.id)}>
                  <Trash2 size={15} color="#e85454" />
                </Pressable>
              </View>
            ))
          )}
        </View>

        {/* 儲存按鈕 */}
        <Pressable
          className="mx-5 mb-8 bg-primary rounded-2xl items-center justify-center active:opacity-80"
          style={{ height: 56 }}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text className="font-rounded text-white text-base font-semibold">儲存設定</Text>
          }
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
