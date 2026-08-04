import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator, Switch, TextInput
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowLeft, Pencil, Trash2, Plus, Phone, Cake, FileText,
  Scissors, Calendar, DollarSign, CreditCard, Hash, MinusCircle, Ban, ChevronDown, ChevronUp
} from 'lucide-react-native';
import {
  getCustomerById, getServiceRecordsByCustomer,
  getAppointmentsByCustomer, deleteCustomer, deleteServiceRecord,
  getPackagesByCustomer, updateCustomer
} from '@/db/api';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { Customer, ServiceRecord, Appointment, ServicePackage } from '@/types/types';

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllRecords, setShowAllRecords] = useState(false);

  // 預約時段限制
  const [restricted, setRestricted] = useState(false);
  const [allowedHours, setAllowedHours] = useState<{ start: string; end: string }[]>([]);
  const [savingRestrict, setSavingRestrict] = useState(false);
  const [showAddHour, setShowAddHour] = useState(false);
  const [newHourStart, setNewHourStart] = useState('09:00');
  const [newHourEnd, setNewHourEnd] = useState('12:00');

  const TIME_OPTS: string[] = [];
  for (let h = 0; h < 24; h++) for (const m of [0, 30]) TIME_OPTS.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [c, r, a, p] = await Promise.all([
        getCustomerById(id),
        getServiceRecordsByCustomer(id),
        getAppointmentsByCustomer(id),
        getPackagesByCustomer(id),
      ]);
      setCustomer(c);
      setRecords(r);
      setAppointments(a);
      setPackages(p);
      if (c) {
        setRestricted(c.booking_restricted ?? false);
        setAllowedHours(Array.isArray(c.booking_allowed_hours) ? c.booking_allowed_hours : []);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // 儲存限制設定
  const saveRestriction = async (newRestricted: boolean, newHours: { start: string; end: string }[]) => {
    if (!id) return;
    setSavingRestrict(true);
    try {
      await updateCustomer(id, { booking_restricted: newRestricted, booking_allowed_hours: newHours });
    } finally {
      setSavingRestrict(false);
    }
  };

  const toggleRestricted = async (v: boolean) => {
    setRestricted(v);
    await saveRestriction(v, allowedHours);
  };

  const addAllowedHour = async () => {
    if (newHourStart >= newHourEnd) return;
    const updated = [...allowedHours, { start: newHourStart, end: newHourEnd }]
      .sort((a, b) => a.start.localeCompare(b.start));
    setAllowedHours(updated);
    setShowAddHour(false);
    await saveRestriction(restricted, updated);
  };

  const removeAllowedHour = async (idx: number) => {
    const updated = allowedHours.filter((_, i) => i !== idx);
    setAllowedHours(updated);
    await saveRestriction(restricted, updated);
  };

  const handleDelete = async () => {
    if (!id) return;
    await deleteCustomer(id);
    router.back();
  };

  const handleDeleteRecord = async (recordId: string) => {
    await deleteServiceRecord(recordId);
    load();
  };

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#e8789a" />
      </View>
    );
  }

  if (!customer) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="font-rounded text-muted-foreground">找不到顧客資料</Text>
      </View>
    );
  }

  const totalSpent = records.reduce((sum, r) => sum + Number(r.amount), 0);
  const nextAppt = appointments.find(a => a.status === 'pending' && new Date(a.appointment_time) >= new Date());
  const activePackages = packages.filter(p => p.is_active);

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      {/* Header */}
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2" onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">{customer.name}</Text>
        <Pressable
          className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-1"
          onPress={() => router.push(`/(app)/customers/edit?id=${id}` as any)}
        >
          <Pencil size={18} color="#e8789a" />
        </Pressable>
        {/* 刪除確認對話框 */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Pressable
              className="w-9 h-9 items-center justify-center rounded-full active:bg-muted"
              onPress={() => {}}
            >
              <Trash2 size={18} color="#e85454" />
            </Pressable>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>確認刪除顧客？</AlertDialogTitle>
              <AlertDialogDescription>
                刪除「{customer.name}」後，所有相關服務記錄與預約將一併移除，此操作無法復原。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                <Text className="font-rounded text-sm font-semibold text-foreground">取消</Text>
              </AlertDialogCancel>
              <AlertDialogAction onPress={handleDelete}
                style={{ backgroundColor: '#e85454' }}>
                <Text className="font-rounded text-sm font-semibold text-white">確認刪除</Text>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </View>

      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-12">
        {/* 基本資訊卡片 */}
        <View className="mx-5 mb-4 bg-card rounded-2xl p-4 border border-border"
          style={{ shadowColor: '#e8789a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2 }}>
          <View className="items-center mb-4">
            <View className="w-16 h-16 rounded-full bg-primary/20 items-center justify-center mb-2">
              <Text className="font-rounded text-primary text-2xl font-bold">{customer.name.charAt(0)}</Text>
            </View>
            <Text className="font-rounded text-xl font-bold text-foreground">{customer.name}</Text>
            {nextAppt && (
              <View className="mt-1 px-3 py-1 rounded-full bg-accent">
                <Text className="font-rounded text-xs text-accent-foreground">
                  下次預約：{new Date(nextAppt.appointment_time).toLocaleDateString('zh-TW')}
                </Text>
              </View>
            )}
          </View>
          <View className="gap-2">
            <InfoRow icon={<Phone size={14} color="#e8789a" />} label="電話" value={customer.phone} />
            <InfoRow icon={<Cake size={14} color="#e8789a" />} label="生日" value={customer.birthday ?? '未設定'} />
            <InfoRow icon={<DollarSign size={14} color="#e8789a" />} label="累計消費" value={`$${totalSpent.toLocaleString()}`} />
            {customer.notes && (
              <InfoRow icon={<FileText size={14} color="#e8789a" />} label="備註" value={customer.notes} />
            )}
          </View>
        </View>

        {/* ── 預約時段限制卡片 ───────────────────────────── */}
        <View className="mx-5 mb-4 bg-card rounded-2xl p-4 border border-border">
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center gap-2">
              <Ban size={15} color="#e8789a" />
              <Text className="font-rounded text-base font-semibold text-foreground">預約時段限制</Text>
            </View>
            <View className="flex-row items-center gap-2">
              {savingRestrict && <ActivityIndicator size="small" color="#e8789a" />}
              <Switch
                value={restricted}
                onValueChange={toggleRestricted}
                trackColor={{ false: '#f0e0e8', true: '#e8789a' }}
                thumbColor="#fff"
                style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
              />
            </View>
          </View>
          <Text className="font-rounded text-xs text-muted-foreground mb-3">
            {restricted ? '僅允許下列時段進行線上預約' : '開啟後可設定此顧客僅能在特定時段預約'}
          </Text>

          {restricted && (
            <>
              {allowedHours.map((h, i) => (
                <View key={i} className={`flex-row items-center py-2 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <Text className="font-rounded text-sm text-foreground flex-1">
                    {h.start} – {h.end}
                  </Text>
                  <Pressable className="w-8 h-8 items-center justify-center active:opacity-70" onPress={() => removeAllowedHour(i)}>
                    <Trash2 size={14} color="#e85454" />
                  </Pressable>
                </View>
              ))}

              {showAddHour ? (
                <View className="bg-background rounded-xl p-3 mt-2 border border-border gap-2">
                  <View className="flex-row items-center gap-2">
                    <Text className="font-rounded text-xs text-muted-foreground w-8">開始</Text>
                    <View style={{ position: 'relative' }}>
                      <Pressable
                        className="flex-row items-center bg-card border border-border rounded-xl px-3 py-2 gap-1 active:opacity-70"
                        onPress={() => {}}
                      >
                        <Text className="font-rounded text-sm text-foreground">{newHourStart}</Text>
                      </Pressable>
                      <ScrollView className="absolute top-10 left-0 bg-card border border-border rounded-xl" style={{ width: 90, maxHeight: 160, zIndex: 50 }}>
                        {TIME_OPTS.map(t => (
                          <Pressable key={t} className="px-3 py-2 active:bg-muted" onPress={() => setNewHourStart(t)}>
                            <Text className="font-rounded text-sm text-foreground">{t}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                    <Text className="font-rounded text-xs text-muted-foreground">至</Text>
                    <View style={{ position: 'relative' }}>
                      <Pressable className="flex-row items-center bg-card border border-border rounded-xl px-3 py-2 gap-1 active:opacity-70" onPress={() => {}}>
                        <Text className="font-rounded text-sm text-foreground">{newHourEnd}</Text>
                      </Pressable>
                      <ScrollView className="absolute top-10 left-0 bg-card border border-border rounded-xl" style={{ width: 90, maxHeight: 160, zIndex: 50 }}>
                        {TIME_OPTS.map(t => (
                          <Pressable key={t} className="px-3 py-2 active:bg-muted" onPress={() => setNewHourEnd(t)}>
                            <Text className="font-rounded text-sm text-foreground">{t}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                  <View className="flex-row gap-2 mt-1">
                    <Pressable className="flex-1 border border-border rounded-xl items-center py-2 active:opacity-70" onPress={() => setShowAddHour(false)}>
                      <Text className="font-rounded text-sm text-muted-foreground">取消</Text>
                    </Pressable>
                    <Pressable className="flex-1 bg-primary rounded-xl items-center py-2 active:opacity-80" onPress={addAllowedHour}>
                      <Text className="font-rounded text-sm text-white font-semibold">確認新增</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  className="flex-row items-center gap-1 mt-2 self-start active:opacity-70"
                  onPress={() => setShowAddHour(true)}
                >
                  <Plus size={14} color="#e8789a" />
                  <Text className="font-rounded text-sm text-primary">新增允許時段</Text>
                </Pressable>
              )}
            </>
          )}
        </View>

        {/* 套票 / 儲值卡 */}
        <View className="mx-5 mb-4 bg-card rounded-2xl p-4 border border-border">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="font-rounded text-base font-semibold text-foreground">
              套票 / 儲值卡{' '}
              <Text className="text-muted-foreground font-normal text-sm">({activePackages.length} 個有效)</Text>
            </Text>
            <View className="flex-row gap-2">
              <Pressable
                className="flex-row items-center gap-1 active:opacity-70"
                onPress={() => router.push(`/(app)/packages/use?customerId=${id}` as any)}
              >
                <MinusCircle size={15} color="#8b9de8" />
                <Text className="font-rounded text-sm" style={{ color: '#8b9de8' }}>使用</Text>
              </Pressable>
              <Pressable
                className="flex-row items-center gap-1 active:opacity-70"
                onPress={() => router.push(`/(app)/packages/new?customerId=${id}` as any)}
              >
                <Plus size={15} color="#e8789a" />
                <Text className="font-rounded text-sm text-primary">新增</Text>
              </Pressable>
            </View>
          </View>
          {packages.length === 0 ? (
            <View className="items-center py-5">
              <CreditCard size={28} color="#c4a0ae" />
              <Text className="font-rounded text-sm text-muted-foreground mt-2">尚無套票</Text>
            </View>
          ) : (
            packages.slice(0, 3).map((pkg, i) => {
              const isSession = pkg.package_type === 'session';
              const remaining = isSession
                ? `${(pkg.total_sessions ?? 0) - pkg.used_sessions} / ${pkg.total_sessions} 次`
                : `$${Number(pkg.remaining_amount ?? 0).toLocaleString()}`;
              return (
                <View key={pkg.id} className={`py-2.5 flex-row items-center ${i > 0 ? 'border-t border-border' : ''}`}>
                  {isSession
                    ? <Hash size={14} color="#e8789a" />
                    : <CreditCard size={14} color="#8b9de8" />
                  }
                  <Text className="font-rounded text-sm text-foreground flex-1 ml-2" numberOfLines={1}>{pkg.name}</Text>
                  <Text
                    className="font-rounded text-xs font-semibold"
                    style={{ color: pkg.is_active ? '#5dc0a0' : '#c4a0ae' }}
                  >
                    {pkg.is_active ? remaining : '已失效'}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        {/* 服務記錄 */}
        <View className="mx-5 mb-4 bg-card rounded-2xl p-4 border border-border">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="font-rounded text-base font-semibold text-foreground">
              服務記錄 <Text className="text-muted-foreground font-normal text-sm">({records.length})</Text>
            </Text>
            <Pressable
              className="flex-row items-center gap-1 active:opacity-70"
              onPress={() => router.push(`/(app)/service-records/new?customerId=${id}` as any)}
            >
              <Plus size={15} color="#e8789a" />
              <Text className="font-rounded text-sm text-primary">新增</Text>
            </Pressable>
          </View>
          {records.length === 0 ? (
            <View className="items-center py-6">
              <Scissors size={32} color="#c4a0ae" />
              <Text className="font-rounded text-sm text-muted-foreground mt-2">尚無服務記錄</Text>
            </View>
          ) : (
            <>
              {(showAllRecords ? records : records.slice(0, 3)).map((r, i) => (
                <Pressable
                  key={r.id}
                  className={`py-3 active:bg-muted/30 -mx-1 px-1 rounded-xl ${i > 0 ? 'border-t border-border' : ''}`}
                  onPress={() => router.push(`/(app)/service-records/${r.id}` as any)}
                >
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1">
                      <Text className="font-rounded text-sm font-semibold text-foreground">{r.service_name}</Text>
                      <Text className="font-rounded text-xs text-muted-foreground mt-0.5">{r.service_date}</Text>
                      {r.notes && (
                        <Text className="font-rounded text-xs text-muted-foreground mt-0.5" numberOfLines={1}>
                          {r.notes}
                        </Text>
                      )}
                      {(r.before_photo_path || r.after_photo_path) && (
                        <Text className="font-rounded text-xs mt-0.5" style={{ color: '#a8d5ba' }}>📷 附有照片</Text>
                      )}
                    </View>
                    <View className="flex-row items-center gap-2">
                      <Text className="font-rounded text-sm font-bold text-primary">${Number(r.amount).toLocaleString()}</Text>
                      <Pressable className="active:opacity-60" onPress={() => handleDeleteRecord(r.id)}>
                        <Trash2 size={14} color="#c4a0ae" />
                      </Pressable>
                    </View>
                  </View>
                </Pressable>
              ))}
              {records.length > 3 && (
                <Pressable
                  className="mt-2 py-2 items-center border-t border-border active:opacity-70"
                  onPress={() => setShowAllRecords(v => !v)}
                >
                  <Text className="font-rounded text-sm text-primary font-medium">
                    {showAllRecords ? '收起 ▲' : `查看全部 ${records.length} 筆 ▼`}
                  </Text>
                </Pressable>
              )}
            </>
          )}
        </View>

        {/* 預約記錄 */}
        <View className="mx-5 mb-4 bg-card rounded-2xl p-4 border border-border">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="font-rounded text-base font-semibold text-foreground">
              預約記錄 <Text className="text-muted-foreground font-normal text-sm">({appointments.length})</Text>
            </Text>
            <Pressable
              className="flex-row items-center gap-1 active:opacity-70"
              onPress={() => router.push(`/(app)/appointments/new?customerId=${id}` as any)}
            >
              <Plus size={15} color="#e8789a" />
              <Text className="font-rounded text-sm text-primary">預約</Text>
            </Pressable>
          </View>
          {appointments.length === 0 ? (
            <View className="items-center py-6">
              <Calendar size={32} color="#c4a0ae" />
              <Text className="font-rounded text-sm text-muted-foreground mt-2">尚無預約記錄</Text>
            </View>
          ) : (
            appointments.slice(0, 5).map((a, i) => {
              const dt = new Date(a.appointment_time);
              return (
                <Pressable
                  key={a.id}
                  className={`py-3 flex-row items-center active:bg-muted/30 -mx-1 px-1 rounded-xl ${i > 0 ? 'border-t border-border' : ''}`}
                  onPress={() => router.push(`/(app)/appointments/${a.id}` as any)}
                >
                  <View className="flex-1">
                    <Text className="font-rounded text-sm font-semibold text-foreground">
                      {dt.toLocaleDateString('zh-TW')} {String(dt.getHours()).padStart(2,'0')}:{String(dt.getMinutes()).padStart(2,'0')}
                    </Text>
                    {a.notes && <Text className="font-rounded text-xs text-muted-foreground">{a.notes}</Text>}
                  </View>
                  <View className={`px-2 py-0.5 rounded-full ${a.status === 'pending' ? 'bg-primary/15' : a.status === 'completed' ? 'bg-secondary' : 'bg-muted'}`}>
                    <Text className={`font-rounded text-xs ${a.status === 'pending' ? 'text-primary' : 'text-muted-foreground'}`}>
                      {a.status === 'pending' ? '待服務' : a.status === 'completed' ? '已完成' : '已取消'}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View className="flex-row items-center gap-2">
      {icon}
      <Text className="font-rounded text-xs text-muted-foreground w-14">{label}</Text>
      <Text className="font-rounded text-sm text-foreground flex-1">{value}</Text>
    </View>
  );
}
