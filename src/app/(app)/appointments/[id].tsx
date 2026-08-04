import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  KeyboardAvoidingView, ActivityIndicator, Modal
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Trash2, Clock, CheckCircle, XCircle, Clock3, AlertTriangle } from 'lucide-react-native';
import DateTimePicker from 'react-native-ui-datepicker';
import { getAppointmentById, updateAppointment, deleteAppointment } from '@/db/api';
import type { Appointment } from '@/types/types';

const REMINDER_OPTIONS = [
  { label: '15 分鐘前', value: 15 },
  { label: '30 分鐘前', value: 30 },
  { label: '1 小時前', value: 60 },
  { label: '2 小時前', value: 120 },
  { label: '1 天前', value: 1440 },
];

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // 編輯狀態
  const [apptDate, setApptDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [reminderMinutes, setReminderMinutes] = useState(30);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<Appointment['status']>('pending');

  useEffect(() => {
    (async () => {
      if (!id) return;
      const a = await getAppointmentById(id);
      if (a) {
        setAppt(a);
        setApptDate(new Date(a.appointment_time));
        setReminderMinutes(a.reminder_minutes);
        setNotes(a.notes ?? '');
        setStatus(a.status);
      }
      setLoading(false);
    })();
  }, [id]);

  const formatDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const handleSave = async () => {
    if (!id) return;
    setError('');
    setSaving(true);
    try {
      await updateAppointment(id, {
        appointment_time: apptDate.toISOString(),
        reminder_minutes: reminderMinutes,
        notes: notes.trim() || null,
        status,
      });
      router.back();
    } catch (e: any) {
      setError(e.message ?? '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    await deleteAppointment(id);
    router.back();
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
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted" onPress={() => setShowDeleteConfirm(true)}>
          <Trash2 size={18} color="#e85454" />
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-5 pb-12 gap-4" className="bg-background">

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
              <DateTimePicker
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
          <View className="bg-card border border-border rounded-2xl px-4 flex-row items-center gap-2" style={{ height: 52 }}>
            <Clock size={16} color="#c4a0ae" />
            <TextInput
              className="font-rounded text-base text-foreground w-14 text-center"
              placeholder="HH"
              placeholderTextColor="#c4a0ae"
              value={String(apptDate.getHours()).padStart(2, '0')}
              onChangeText={(v) => {
                const h = parseInt(v, 10);
                if (!isNaN(h) && h >= 0 && h <= 23)
                  setApptDate(new Date(apptDate.getFullYear(), apptDate.getMonth(), apptDate.getDate(), h, apptDate.getMinutes()));
              }}
              keyboardType="numeric"
              maxLength={2}
            />
            <Text className="font-rounded text-base text-muted-foreground">:</Text>
            <TextInput
              className="font-rounded text-base text-foreground w-14 text-center"
              placeholder="MM"
              placeholderTextColor="#c4a0ae"
              value={String(apptDate.getMinutes()).padStart(2, '0')}
              onChangeText={(v) => {
                const m = parseInt(v, 10);
                if (!isNaN(m) && m >= 0 && m <= 59)
                  setApptDate(new Date(apptDate.getFullYear(), apptDate.getMonth(), apptDate.getDate(), apptDate.getHours(), m));
              }}
              keyboardType="numeric"
              maxLength={2}
            />
          </View>
        </View>

        {/* 提醒時間 */}
        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">提醒時間</Text>
          <View className="flex-row flex-wrap gap-2">
            {REMINDER_OPTIONS.map(opt => (
              <Pressable
                key={opt.value}
                className="px-4 py-2 rounded-full active:opacity-70"
                style={{ backgroundColor: reminderMinutes === opt.value ? '#e8789a' : '#f5e6ec' }}
                onPress={() => setReminderMinutes(opt.value)}
              >
                <Text className="font-rounded text-sm font-medium" style={{ color: reminderMinutes === opt.value ? '#fff' : '#c4a0ae' }}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
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
                    router.back();
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
    </KeyboardAvoidingView>
  );
}
