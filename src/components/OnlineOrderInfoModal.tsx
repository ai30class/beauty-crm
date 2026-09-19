import { View, Text, Pressable, Modal } from 'react-native';
import { Globe } from 'lucide-react-native';
import type { UnifiedAppointment } from '@/types/types';

// 員工帳號對線上預約（online_orders）只有「排班用的唯讀資料」（migration 00071：
// 時間／姓名／服務／設計師／狀態），「線上預約訂單」頁讀不到資料，
// 所以員工點線上預約時改跳這個唯讀小視窗，資料直接用預約列表已經載入的那筆。
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

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function formatWhen(iso: string, durationMin: number) {
  const dt = new Date(iso);
  const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const end = new Date(dt.getTime() + durationMin * 60000);
  const date = `${dt.getMonth() + 1}/${dt.getDate()}（週${WEEKDAYS[dt.getDay()]}）`;
  return durationMin > 0 ? `${date} ${hm(dt)}～${hm(end)}` : `${date} ${hm(dt)}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start">
      <Text className="font-rounded text-sm text-muted-foreground" style={{ width: 64 }}>{label}</Text>
      <Text className="font-rounded text-sm text-foreground flex-1">{value}</Text>
    </View>
  );
}

export default function OnlineOrderInfoModal({ item, onClose }: { item: UnifiedAppointment | null; onClose: () => void }) {
  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40 items-center justify-center px-8" onPress={onClose}>
        <Pressable className="bg-card w-full rounded-3xl p-6 gap-4" onPress={() => { /* 阻止冒泡 */ }}>
          {item ? (
            <>
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
              <Text className="font-rounded text-xs text-muted-foreground text-center">
                線上預約的修改與取消由商家處理
              </Text>
              <Pressable className="h-12 rounded-2xl bg-primary items-center justify-center active:opacity-80" onPress={onClose}>
                <Text className="font-rounded text-sm font-semibold text-white">關閉</Text>
              </Pressable>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
