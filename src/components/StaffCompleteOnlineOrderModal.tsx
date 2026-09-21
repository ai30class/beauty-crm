import { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TextInput, ActivityIndicator, KeyboardAvoidingView } from 'react-native';
import { CheckCircle, X } from 'lucide-react-native';
import { PAYMENT_META } from '@/lib/payments';
import { getOnlineOrderForCompletion, getStaffForPicker, staffCompleteOnlineOrder } from '@/db/api';
import type { OnlineOrderForCompletion } from '@/db/api';
import type { StaffRosterEntry } from '@/types/types';

// 員工替線上預約「完成服務並記錄收入」的簡化版結帳視窗（migration 00087）。
// 員工讀不到線上訂單與別人的服務記錄，所以資料與儲存都走專用函式；
// 只有金額、付款方式、備註、服務人員——套票扣款、保養品用量、協作分帳、施術照片由商家事後處理。
// 收入與抽成記在「預約指定的設計師」，預約沒指定才由完成的人選。
const METHODS = ['cash', 'card', 'bank_transfer', 'line_pay', 'mobile_pay'] as const;
type StaffPayMethod = (typeof METHODS)[number];

const DEPOSIT_METHOD_LABEL: Record<string, string> = { line_pay: 'LINE Pay', bank_transfer: '銀行轉帳' };

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default function StaffCompleteOnlineOrderModal({ orderId, onClose, onDone }: {
  /** 線上預約訂單 id（不含 online- 前綴）；null 代表關閉 */
  orderId: string | null;
  onClose: () => void;
  /** 記帳成功後呼叫，讓畫面重新載入 */
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<OnlineOrderForCompletion | null>(null);
  const [staffList, setStaffList] = useState<StaffRosterEntry[]>([]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<StaffPayMethod>('cash');
  const [notes, setNotes] = useState('');
  const [staffId, setStaffId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    setLoading(true);
    setOrder(null);
    setError('');
    setNotes('');
    setMethod('cash');
    (async () => {
      try {
        const [o, staff] = await Promise.all([getOnlineOrderForCompletion(orderId), getStaffForPicker()]);
        if (cancelled) return;
        setStaffList(staff);
        if (!o) {
          setError('這筆預約目前不能完成：可能已經完成、已取消、還沒確認收款，或你沒有這個權限。');
        } else {
          setOrder(o);
          setAmount(String(o.total_amount));
          setStaffId(o.staff_id);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? '載入失敗，請稍後再試。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  const amt = Number(amount);
  const amountValid = amount.trim() !== '' && !Number.isNaN(amt) && amt >= 0;
  const deposit = order ? Math.min(order.deposit_amount, amountValid ? amt : 0) : 0;
  const balance = amountValid ? Math.max(amt - deposit, 0) : 0;
  const assignedStaff = order?.staff_id ? staffList.find(s => s.id === order.staff_id) : null;

  const handleSave = async () => {
    if (!order || !orderId) return;
    if (!amountValid) { setError('請輸入正確的金額'); return; }
    if (!order.staff_id && !staffId) { setError('這筆預約沒有指定設計師，請選擇這次服務的設計師'); return; }
    setSaving(true);
    setError('');
    try {
      await staffCompleteOnlineOrder({
        orderId,
        amount: amt,
        paymentMethod: method,
        notes: notes.trim(),
        staffId: order.staff_id ? null : staffId,
      });
      onDone();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? '儲存失敗，請稍後再試。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!orderId} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/30" onPress={onClose} />
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
        className="bg-background rounded-t-3xl"
        style={{ paddingBottom: 34, maxHeight: '90%' }}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-5 pt-5 pb-4 gap-4">
          <View className="flex-row items-center justify-between mb-1">
            <Text className="font-rounded text-lg font-bold text-foreground">完成服務並記錄收入</Text>
            <Pressable onPress={onClose} className="w-8 h-8 items-center justify-center rounded-full active:bg-muted">
              <X size={20} color="#c4a0ae" />
            </Pressable>
          </View>

          {loading ? (
            <View className="py-10 items-center"><ActivityIndicator color="#e8789a" /></View>
          ) : !order ? (
            <View className="gap-4">
              <Text className="font-rounded text-sm text-center" style={{ color: '#e85454' }}>{error || '載入中…'}</Text>
              <Pressable className="h-12 rounded-2xl bg-primary items-center justify-center active:opacity-80" onPress={onClose}>
                <Text className="font-rounded text-sm font-semibold text-white">關閉</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View className="bg-muted/40 rounded-2xl px-4 py-3 gap-1">
                <Text className="font-rounded text-xs text-muted-foreground">顧客</Text>
                <Text className="font-rounded text-sm font-semibold text-foreground">{order.customer_name}</Text>
                <Text className="font-rounded text-xs text-muted-foreground mt-1">服務</Text>
                <Text className="font-rounded text-sm text-foreground">{order.service_name}</Text>
              </View>

              <View>
                <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">服務金額（總額）</Text>
                <TextInput
                  className="bg-card border border-border rounded-2xl px-4 font-rounded text-base text-foreground"
                  style={{ height: 52 }}
                  value={amount}
                  onChangeText={v => setAmount(v.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor="#c4a0ae"
                />
                {order.deposit_amount > 0 && (
                  <View className="mt-2 gap-0.5">
                    <Text className="font-rounded text-xs text-muted-foreground">
                      已收訂金（{DEPOSIT_METHOD_LABEL[order.deposit_method ?? ''] ?? '訂金'}）：− {money(deposit)}
                    </Text>
                    <Text className="font-rounded text-xs font-semibold text-foreground">
                      現場實收（尾款）：{money(balance)}
                    </Text>
                  </View>
                )}
              </View>

              <View>
                <Text className="font-rounded text-sm font-medium text-foreground mb-2">
                  {deposit > 0 ? '尾款付款方式 *' : '付款方式 *'}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {METHODS.map(key => {
                    const meta = PAYMENT_META[key];
                    const active = method === key;
                    return (
                      <Pressable
                        key={key}
                        className="rounded-xl py-2.5 px-3 items-center border active:opacity-70"
                        style={{ backgroundColor: active ? meta.color + '22' : '#fafafa', borderColor: active ? meta.color : '#e8dce8' }}
                        onPress={() => setMethod(key)}
                      >
                        <Text className="font-rounded text-sm font-semibold" style={{ color: active ? meta.color : '#b0a0b0' }}>{meta.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View>
                <Text className="font-rounded text-sm font-medium text-foreground mb-2">服務人員（收入與抽成記在這位）</Text>
                {order.staff_id ? (
                  <Text className="font-rounded text-sm text-foreground">{assignedStaff?.name ?? '預約指定的設計師'}（預約已指定）</Text>
                ) : (
                  <View className="flex-row flex-wrap gap-2">
                    {staffList.filter(s => s.is_active).map(s => {
                      const active = staffId === s.id;
                      return (
                        <Pressable
                          key={s.id}
                          className="px-3 py-2 rounded-full border active:opacity-70"
                          style={{ borderColor: active ? s.color : '#e0d0d8', backgroundColor: active ? s.color + '18' : '#fff' }}
                          onPress={() => setStaffId(s.id)}
                        >
                          <Text className="font-rounded text-sm" style={{ color: active ? s.color : '#c4a0ae' }}>{s.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>

              <View>
                <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">備註（選填）</Text>
                <TextInput
                  className="bg-card border border-border rounded-2xl px-4 py-3 font-rounded text-base text-foreground"
                  placeholder="備註（選填）"
                  placeholderTextColor="#c4a0ae"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  style={{ minHeight: 64, textAlignVertical: 'top' }}
                />
              </View>

              <Text className="font-rounded text-xs text-muted-foreground">
                套票扣款、保養品用量、協作分帳與施術照片這裡沒有，需要的話請店家事後補。
              </Text>

              {error ? <Text className="font-rounded text-xs text-center" style={{ color: '#e85454' }}>{error}</Text> : null}

              <Pressable
                className="h-14 rounded-2xl items-center justify-center flex-row gap-2 active:opacity-80"
                style={{ backgroundColor: '#5dc0a0', opacity: saving ? 0.7 : 1 }}
                disabled={saving}
                onPress={handleSave}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : (<><CheckCircle size={18} color="#fff" /><Text className="font-rounded text-base font-semibold text-white">完成服務並記錄收入</Text></>)}
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
