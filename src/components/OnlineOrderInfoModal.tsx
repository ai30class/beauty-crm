import { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, ActivityIndicator } from 'react-native';
import DateTimePicker from 'react-native-ui-datepicker';
import { Globe } from 'lucide-react-native';
import TimeOfDayPicker from '@/components/TimeOfDayPicker';
import { staffRescheduleOnlineOrder } from '@/db/api';
import type { UnifiedAppointment } from '@/types/types';

// 員工帳號對線上預約（online_orders）只有「排班用的唯讀資料」（migration 00071：
// 時間／姓名／服務／設計師／狀態），「線上預約訂單」頁讀不到資料，
// 所以員工點線上預約時改跳這個小視窗，資料直接用預約列表已經載入的那筆。
// 員工可以在這裡「調整時間」（migration 00086 的專用函式，只能改時間），
// 取消與其他修改仍由商家處理。
const STATUS_LABELS: Record<string, string> = {
  pending: '待服務',
  confirmed: '已確認',
  paid: '已付訂金',
  pending_payment: '待付款',
  pending_transfer_confirm: '待確認匯款',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
};

// 已完成／已取消／已退款不能再改時間（跟商家「調整預約」視窗、00086 函式的規則一致）
const LOCKED_STATUSES = ['completed', 'cancelled', 'refunded'];

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function formatWhen(iso: string, durationMin: number) {
  const dt = new Date(iso);
  const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const end = new Date(dt.getTime() + durationMin * 60000);
  const date = `${dt.getMonth() + 1}/${dt.getDate()}（週${WEEKDAYS[dt.getDay()]}）`;
  return durationMin > 0 ? `${date} ${hm(dt)}～${hm(end)}` : `${date} ${hm(dt)}`;
}

const formatDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start">
      <Text className="font-rounded text-sm text-muted-foreground" style={{ width: 64 }}>{label}</Text>
      <Text className="font-rounded text-sm text-foreground flex-1">{value}</Text>
    </View>
  );
}

export default function OnlineOrderInfoModal({ item, onClose, onChanged }: {
  item: UnifiedAppointment | null;
  onClose: () => void;
  /** 有傳才會顯示「調整時間」；改完時間後呼叫，讓畫面重新載入 */
  onChanged?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [apptDate, setApptDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 換一筆預約（或關掉再開）就回到唯讀畫面
  useEffect(() => {
    if (item) {
      setApptDate(new Date(item.appointment_time));
      setEditing(false);
      setShowDatePicker(false);
      setError('');
    }
  }, [item?.id]);

  const canReschedule = !!item && !!onChanged && !LOCKED_STATUSES.includes(item.status);

  const handleSave = async () => {
    if (!item) return;
    setSaving(true);
    setError('');
    try {
      await staffRescheduleOnlineOrder(item.id.replace(/^online-/, ''), apptDate.toISOString());
      onChanged?.();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40 items-center justify-center px-8" onPress={onClose}>
        <Pressable className="bg-card w-full rounded-3xl p-6" style={{ maxHeight: '90%' }} onPress={() => { /* 阻止冒泡 */ }}>
          {item ? (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4">
              <View className="items-center gap-2">
                <View className="w-14 h-14 rounded-full items-center justify-center" style={{ backgroundColor: '#eef0ff' }}>
                  <Globe size={26} color="#4a6cf7" />
                </View>
                <Text className="font-rounded text-lg font-bold text-foreground">線上預約</Text>
              </View>
              <View className="gap-2.5">
                <Row label="時間" value={formatWhen(item.appointment_time, item.duration_minutes)} />
                <Row label="顧客" value={item.customer_name && item.customer_name !== '—' ? item.customer_name : '（未提供）'} />
                <Row label="服務" value={item.service_name || '—'} />
                <Row label="設計師" value={item.staff_name ?? '未指定'} />
                <Row label="狀態" value={STATUS_LABELS[item.status] ?? item.status} />
              </View>

              {editing ? (
                <View className="gap-3">
                  <View>
                    <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">新的日期</Text>
                    <Pressable
                      className="bg-card border border-border rounded-2xl px-4 items-start justify-center active:opacity-80"
                      style={{ height: 48 }}
                      onPress={() => setShowDatePicker(v => !v)}
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
                  <View>
                    <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">新的時間</Text>
                    <TimeOfDayPicker
                      hour={apptDate.getHours()}
                      minute={apptDate.getMinutes()}
                      onChange={(h, m) => setApptDate(prev => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate(), h, m))}
                    />
                  </View>
                  {error ? <Text className="font-rounded text-xs text-center" style={{ color: '#e85454' }}>{error}</Text> : null}
                  <View className="flex-row gap-3">
                    <Pressable
                      className="flex-1 h-12 rounded-2xl border border-border items-center justify-center active:opacity-70"
                      disabled={saving}
                      onPress={() => { setEditing(false); setShowDatePicker(false); setError(''); setApptDate(new Date(item.appointment_time)); }}
                    >
                      <Text className="font-rounded text-sm font-semibold text-muted-foreground">取消</Text>
                    </Pressable>
                    <Pressable
                      className="flex-1 h-12 rounded-2xl bg-primary items-center justify-center active:opacity-80"
                      disabled={saving}
                      onPress={handleSave}
                    >
                      {saving
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text className="font-rounded text-sm font-semibold text-white">儲存新時間</Text>}
                    </Pressable>
                  </View>
                </View>
              ) : (
                <>
                  <Text className="font-rounded text-xs text-muted-foreground text-center">
                    {canReschedule ? '可以調整時間；取消與其他修改由商家處理' : '線上預約的修改與取消由商家處理'}
                  </Text>
                  {canReschedule && (
                    <Pressable className="h-12 rounded-2xl bg-primary items-center justify-center active:opacity-80" onPress={() => setEditing(true)}>
                      <Text className="font-rounded text-sm font-semibold text-white">調整時間</Text>
                    </Pressable>
                  )}
                  <Pressable
                    className={canReschedule
                      ? 'h-12 rounded-2xl border border-border items-center justify-center active:opacity-70'
                      : 'h-12 rounded-2xl bg-primary items-center justify-center active:opacity-80'}
                    onPress={onClose}
                  >
                    <Text className={canReschedule
                      ? 'font-rounded text-sm font-semibold text-muted-foreground'
                      : 'font-rounded text-sm font-semibold text-white'}>關閉</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
