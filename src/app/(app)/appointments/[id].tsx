import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  KeyboardAvoidingView, ActivityIndicator, Modal
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Trash2, Clock, CheckCircle, XCircle, Clock3, AlertTriangle, FileWarning } from 'lucide-react-native';
import DateTimePicker from 'react-native-ui-datepicker';
import {
  getAppointmentById, updateAppointment, deleteAppointment, incrementCustomerNoShow, getStaffForPicker, getAccountType,
  getServiceTemplateById, getLatestConsentByFormType,
} from '@/db/api';
import TimeOfDayPicker from '@/components/TimeOfDayPicker';
import { manualDurationMin } from '@/lib/schedule';
import { getRequiredConsentFormTypes, CONSENT_FORM_TITLE } from '@/lib/consentForms';
import type { Appointment, StaffRosterEntry, ConsentFormType } from '@/types/types';
import { useDeletePinGate } from '@/lib/deletePinGate';

const STATUS_OPTIONS: { value: Appointment['status']; label: string; color: string; bg: string; icon: React.ReactNode }[] = [
  { value: 'pending',   label: '待服務', color: '#e8789a', bg: '#fce9f0', icon: <Clock3 size={14} color="#e8789a" /> },
  { value: 'completed', label: '已完成', color: '#5dc0a0', bg: '#e0f5ef', icon: <CheckCircle size={14} color="#5dc0a0" /> },
  { value: 'cancelled', label: '已取消', color: '#c4a0ae', bg: '#f5eaef', icon: <XCircle size={14} color="#c4a0ae" /> },
];

export default function AppointmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [appt, setAppt] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [isStaff, setIsStaff] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { gate, gateModal } = useDeletePinGate();
  const [markNoShow, setMarkNoShow] = useState(false);

  // 編輯狀態
  const [apptDate, setApptDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<Appointment['status']>('pending');
  const [staffList, setStaffList] = useState<StaffRosterEntry[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  // 服務時長（分鐘）：舊預約沒記錄，顯示成舊規則算出來的值；只有使用者動過它才會寫回資料庫
  const [duration, setDuration] = useState(60);
  const [durationChanged, setDurationChanged] = useState(false);

  // 同意書提醒（migration 00091，見顧客報到後、操作前要簽署的規則）：這筆預約選的服務項目
  // 屬於紋繡／接睫毛／除毛任一類，且這位顧客還沒簽過對應的同意書時，跳出提醒
  const [consentMissingTypes, setConsentMissingTypes] = useState<ConsentFormType[]>([]);
  const [consentServiceTemplateId, setConsentServiceTemplateId] = useState<string | null>(null);

  // 同意書提醒的檢查邏輯獨立成一個函式：初次載入跑一次，簽完同意書返回這頁時（useFocusEffect）
  // 要再跑一次，不然畫面會停留在「簽署前」的舊提醒，讓人以為還沒簽
  const checkConsent = useCallback(async (a: Appointment) => {
    if (!a.service_template_id) { setConsentMissingTypes([]); return; }
    setConsentServiceTemplateId(a.service_template_id);
    const tpl = await getServiceTemplateById(a.service_template_id).catch(() => null);
    const required = getRequiredConsentFormTypes(tpl?.consent_form_type);
    if (required.length === 0) { setConsentMissingTypes([]); return; }
    const missing: ConsentFormType[] = [];
    for (const t of required) {
      const latest = await getLatestConsentByFormType(a.customer_id, t).catch(() => null);
      if (!latest) { missing.push(t); continue; }
      // 只有紋繡類要比對「同一個方向」；沒設分組（雙方任一邊是空的）一律當作沒簽過，要重簽
      if (t === 'tattoo' && (!latest.consent_group || latest.consent_group !== (tpl?.consent_group ?? null))) {
        missing.push(t);
      }
    }
    setConsentMissingTypes(missing);
  }, []);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const [a, staff, accountType] = await Promise.all([
        getAppointmentById(id),
        getStaffForPicker(),
        getAccountType().catch(() => 'merchant' as const),
      ]);
      setStaffList(staff);
      setIsStaff(accountType === 'staff');
      if (a) {
        setAppt(a);
        const d = new Date(a.appointment_time);
        setApptDate(d);
        setNotes(a.notes ?? '');
        setStatus(a.status);
        setSelectedStaffId(a.staff_id);
        setDuration(manualDurationMin(a));
        await checkConsent(a);
      }
      setLoading(false);
    })();
  }, [id, checkConsent]);

  // 從簽署同意書畫面按返回、回到這一頁時重新檢查一次
  useFocusEffect(useCallback(() => {
    if (appt) checkConsent(appt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appt?.id]));

  const formatDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const handleSave = async () => {
    if (!id) return;
    setError('');
    setSaving(true);
    try {
      await updateAppointment(id, {
        appointment_time: apptDate.toISOString(),
        notes: notes.trim() || null,
        status,
        staff_id: selectedStaffId,
        ...(durationChanged ? { duration_minutes: duration } : {}),
      });
      router.back();
    } catch (e: any) {
      setError(e.message ?? '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  // 直接用網址進來（沒有上一頁）時 router.back() 不會有反應，改回預約列表
  const leaveScreen = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/appointments' as any);
  };

  const handleDelete = async () => {
    if (!id) return;
    await deleteAppointment(id);
    leaveScreen();
  };

  // 標記完成並前往新增服務記錄
  const handleMarkCompleteAndRecord = async () => {
    if (!id || !appt) return;
    setSaving(true);
    try {
      await updateAppointment(id, { status: 'completed' });
      router.replace(
        `/(app)/service-records/new?customerId=${appt.customer_id}&fromAppointment=1` as any
      );
    } catch (e: any) {
      setError(e.message ?? '操作失敗');
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

  if (!appt) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="font-rounded text-muted-foreground">找不到預約資料</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      {/* Header */}
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2" onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <View className="flex-1">
          <Text className="font-rounded text-xl font-bold text-foreground">編輯預約</Text>
          <Text className="font-rounded text-sm text-muted-foreground">{appt.customer?.name}</Text>
        </View>
        {/* 員工帳號不能刪預約（只能取消），不顯示；資料庫也擋 */}
        {!isStaff && (
          <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted" onPress={() => gate(() => setShowDeleteConfirm(true))}>
            <Trash2 size={18} color="#e85454" />
          </Pressable>
        )}
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-5 pb-12 gap-4" className="bg-background">

        {/* 同意書提醒：報到後、操作前要簽署（Emma 9/23 決定） */}
        {consentMissingTypes.length > 0 && (
          <Pressable
            className="rounded-2xl px-4 py-3 flex-row items-center gap-3 active:opacity-80"
            style={{ backgroundColor: '#faecd8', borderWidth: 1, borderColor: '#f0d09a' }}
            onPress={() => router.push(
              `/(app)/consents/new?customerId=${appt.customer_id}&types=${consentMissingTypes.join(',')}&serviceTemplateId=${consentServiceTemplateId}` as any
            )}
          >
            <FileWarning size={20} color="#b5732a" />
            <View className="flex-1">
              <Text className="font-rounded text-sm font-semibold" style={{ color: '#9a6400' }}>
                尚未簽署：{consentMissingTypes.map(t => CONSENT_FORM_TITLE[t]).join('、')}
              </Text>
              <Text className="font-rounded text-xs" style={{ color: '#b5732a' }}>操作前請先完成簽署，點一下前往</Text>
            </View>
          </Pressable>
        )}

        {/* 狀態切換 */}
        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-2">狀態</Text>
          <View className="flex-row gap-2">
            {STATUS_OPTIONS.map(opt => (
              <Pressable
                key={opt.value}
                className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl active:opacity-70"
                style={{ backgroundColor: status === opt.value ? opt.bg : '#f9f1f4', borderWidth: 1.5, borderColor: status === opt.value ? opt.color : 'transparent' }}
                onPress={() => setStatus(opt.value)}
              >
                {opt.icon}
                <Text className="font-rounded text-xs font-semibold" style={{ color: status === opt.value ? opt.color : '#c4a0ae' }}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* 服務人員 */}
        {staffList.length > 0 && (
          <View>
            <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">服務人員</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
              <View className="flex-row gap-2 px-1 pb-1">
                <Pressable
                  className="rounded-xl px-3 py-2 active:opacity-70"
                  style={{ backgroundColor: selectedStaffId === null ? '#e8789a' : '#f5e6ec' }}
                  onPress={() => setSelectedStaffId(null)}
                >
                  <Text className="font-rounded text-sm font-medium" style={{ color: selectedStaffId === null ? '#fff' : '#c4a0ae' }}>
                    不指定
                  </Text>
                </Pressable>
                {staffList.map(s => (
                  <Pressable
                    key={s.id}
                    className="rounded-xl px-3 py-2 active:opacity-70"
                    style={{
                      backgroundColor: selectedStaffId === s.id ? s.color : s.color + '22',
                      borderWidth: 1.5,
                      borderColor: selectedStaffId === s.id ? s.color : s.color + '44',
                    }}
                    onPress={() => setSelectedStaffId(s.id)}
                  >
                    <Text className="font-rounded text-sm font-medium" style={{ color: selectedStaffId === s.id ? '#fff' : s.color }}>
                      {s.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* 預約日期 */}
        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">預約日期</Text>
          <Pressable
            className="bg-card border border-border rounded-2xl px-4 items-start justify-center active:opacity-80"
            style={{ height: 52 }}
            onPress={() => setShowDatePicker(!showDatePicker)}
          >
            <Text className="font-rounded text-base text-foreground">{formatDate(apptDate)}</Text>
          </Pressable>
          {showDatePicker && (
            <View className="bg-card border border-border rounded-2xl mt-2 overflow-hidden">
              <DateTimePicker locale="zh-tw"
                mode="single"
                date={apptDate}
                onChange={(params) => {
                  if (params.date) {
                    const nd = params.date as Date;
                    setApptDate(new Date(nd.getFullYear(), nd.getMonth(), nd.getDate(), apptDate.getHours(), apptDate.getMinutes()));
                  }
                  setShowDatePicker(false);
                }}
              />
            </View>
          )}
        </View>

        {/* 預約時間 */}
        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">預約時間</Text>
          <TimeOfDayPicker
            hour={apptDate.getHours()}
            minute={apptDate.getMinutes()}
            onChange={(h, m) => setApptDate(prev => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate(), h, m))}
          />
        </View>

        {/* 服務時長 */}
        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">服務時長</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {Array.from(new Set([30, 60, 90, 120, 150, 180, 210, 240, 300, 360, duration]))
                .sort((x, y) => x - y)
                .map(m => {
                  const active = duration === m;
                  return (
                    <Pressable
                      key={m}
                      className="px-3.5 py-2 rounded-full border active:opacity-70"
                      style={{ borderColor: active ? '#e8789a' : '#e0d0d8', backgroundColor: active ? '#fce9f0' : '#fff' }}
                      onPress={() => { setDuration(m); setDurationChanged(true); }}
                    >
                      <Text className="font-rounded text-sm" style={{ color: active ? '#e8789a' : '#c4a0ae' }}>{m} 分</Text>
                    </Pressable>
                  );
                })}
            </View>
          </ScrollView>
          {(() => {
            const end = new Date(apptDate.getTime() + duration * 60000);
            const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            const nextDay = end.getDate() !== apptDate.getDate();
            return (
              <Text className="font-rounded text-xs text-muted-foreground mt-1.5">
                預計 {hm(apptDate)}～{nextDay ? '隔天 ' : ''}{hm(end)}
              </Text>
            );
          })()}
        </View>

        {/* 備註 */}
        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">備註</Text>
          <TextInput
            className="bg-card border border-border rounded-2xl px-4 py-3 font-rounded text-base text-foreground"
            placeholder="備註（選填）"
            placeholderTextColor="#c4a0ae"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {error ? <Text className="font-rounded text-destructive text-sm">{error}</Text> : null}

        {/* 儲存按鈕 */}
        <Pressable
          className="bg-primary rounded-2xl items-center justify-center active:opacity-80"
          style={{ height: 56 }}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text className="font-rounded text-white text-base font-semibold">儲存修改</Text>}
        </Pressable>

        {/* 快速完成並記錄收入 */}
        {status === 'pending' && (
          <Pressable
            className="rounded-2xl items-center justify-center active:opacity-80 flex-row gap-2"
            style={{ height: 56, backgroundColor: '#e0f5ef', borderWidth: 1.5, borderColor: '#5dc0a0' }}
            onPress={handleMarkCompleteAndRecord}
            disabled={saving}
          >
            <CheckCircle size={18} color="#5dc0a0" />
            <Text className="font-rounded text-base font-semibold" style={{ color: '#5dc0a0' }}>完成服務並記錄收入</Text>
          </Pressable>
        )}

        {/* 取消預約 */}
        {status !== 'cancelled' && (
          <Pressable
            className="rounded-2xl items-center justify-center active:opacity-80 flex-row gap-2"
            style={{ height: 52, backgroundColor: '#fff0f3', borderWidth: 1.5, borderColor: '#f0b0b8' }}
            onPress={() => setShowCancelConfirm(true)}
            disabled={saving}
          >
            <XCircle size={18} color="#e85454" />
            <Text className="font-rounded text-base font-semibold" style={{ color: '#e85454' }}>取消此預約</Text>
          </Pressable>
        )}
      </ScrollView>

      {/* 取消確認 Modal */}
      <Modal
        visible={showCancelConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCancelConfirm(false)}
      >
        <Pressable
          className="flex-1 bg-black/40 items-center justify-center px-8"
          onPress={() => setShowCancelConfirm(false)}
        >
          <Pressable
            className="bg-card w-full rounded-3xl p-6 gap-4"
            style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 10 }}
            onPress={() => {/* 阻止冒泡 */}}
          >
            {/* 圖示 */}
            <View className="items-center gap-3">
              <View className="w-16 h-16 rounded-full items-center justify-center" style={{ backgroundColor: '#fff0f3' }}>
                <AlertTriangle size={32} color="#e85454" />
              </View>
              <Text className="font-rounded text-lg font-bold text-foreground">確認取消預約？</Text>
              <Text className="font-rounded text-sm text-muted-foreground text-center">
                取消後此預約將無法復原，{'\n'}請確認是否要取消。
              </Text>
            </View>

            {/* 同時標記未到場 */}
            <Pressable
              className="flex-row items-center gap-2.5 active:opacity-70"
              onPress={() => setMarkNoShow(v => !v)}
            >
              <View
                className="w-5 h-5 rounded-md border-2 items-center justify-center"
                style={{ borderColor: markNoShow ? '#e85454' : '#d0b0be', backgroundColor: markNoShow ? '#e85454' : 'transparent' }}
              >
                {markNoShow && <Text className="text-white text-xs font-bold">✓</Text>}
              </View>
              <Text className="font-rounded text-xs text-muted-foreground flex-1">
                同時標記為未到場（列入顧客未到場次數統計）
              </Text>
            </Pressable>

            {/* 按鈕 */}
            <View className="flex-row gap-3 mt-2">
              <Pressable
                className="flex-1 h-12 rounded-2xl border border-border items-center justify-center active:opacity-70"
                onPress={() => setShowCancelConfirm(false)}
              >
                <Text className="font-rounded text-sm font-semibold text-muted-foreground">再想想</Text>
              </Pressable>
              <Pressable
                className="flex-1 h-12 rounded-2xl items-center justify-center active:opacity-80"
                style={{ backgroundColor: '#e85454' }}
                disabled={saving}
                onPress={async () => {
                  setShowCancelConfirm(false);
                  setStatus('cancelled');
                  if (!id) return;
                  setSaving(true);
                  try {
                    await updateAppointment(id, { status: 'cancelled' });
                    if (markNoShow && appt?.customer_id) {
                      await incrementCustomerNoShow(appt.customer_id).catch(() => {});
                    }
                    setSaving(false);
                    leaveScreen();
                  } catch (e: any) {
                    setError(e.message ?? '取消失敗');
                    setSaving(false);
                  }
                }}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text className="font-rounded text-sm font-semibold text-white">確認取消</Text>
                }
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 刪除確認 Modal */}
      <Modal
        visible={showDeleteConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteConfirm(false)}
      >
        <Pressable
          className="flex-1 bg-black/40 items-center justify-center px-8"
          onPress={() => setShowDeleteConfirm(false)}
        >
          <Pressable
            className="bg-card w-full rounded-3xl p-6 gap-4"
            style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 10 }}
            onPress={() => {/* 阻止冒泡 */}}
          >
            <View className="items-center gap-3">
              <View className="w-16 h-16 rounded-full items-center justify-center" style={{ backgroundColor: '#fff0f3' }}>
                <Trash2 size={32} color="#e85454" />
              </View>
              <Text className="font-rounded text-lg font-bold text-foreground">確認刪除預約？</Text>
              <Text className="font-rounded text-sm text-muted-foreground text-center">
                刪除後無法復原，{'\n'}確定要刪除此預約嗎？
              </Text>
            </View>
            <View className="flex-row gap-3 mt-2">
              <Pressable
                className="flex-1 h-12 rounded-2xl border border-border items-center justify-center active:opacity-70"
                onPress={() => setShowDeleteConfirm(false)}
              >
                <Text className="font-rounded text-sm font-semibold text-muted-foreground">取消</Text>
              </Pressable>
              <Pressable
                className="flex-1 h-12 rounded-2xl items-center justify-center active:opacity-80"
                style={{ backgroundColor: '#e85454' }}
                disabled={saving}
                onPress={async () => {
                  setShowDeleteConfirm(false);
                  await handleDelete();
                }}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text className="font-rounded text-sm font-semibold text-white">確認刪除</Text>
                }
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      {gateModal}
    </KeyboardAvoidingView>
  );
}
