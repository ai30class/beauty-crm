import { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, Modal } from 'react-native';
import { Clock } from 'lucide-react-native';

// 點一下跳出選單選「幾點幾分」（小時 00–23、分鐘每 5 分鐘一格；目前的分鐘若不是 5 的倍數也會保留）。
// 用選的、不用打字：手機上不用叫出鍵盤，也不會有「兩位數打不出來、原本的數字刪不掉」的問題。
const ITEM_H = 44;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export default function TimeOfDayPicker({
  hour, minute, onChange,
}: {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const hourRef = useRef<ScrollView>(null);
  const minRef = useRef<ScrollView>(null);

  const minutes = Array.from({ length: 12 }, (_, i) => i * 5);
  if (!minutes.includes(minute)) minutes.push(minute);
  minutes.sort((a, b) => a - b);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      hourRef.current?.scrollTo({ y: Math.max(0, (hour - 2) * ITEM_H), animated: false });
      minRef.current?.scrollTo({ y: Math.max(0, (minutes.indexOf(minute) - 2) * ITEM_H), animated: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cell = (selected: boolean) => ({
    height: ITEM_H,
    backgroundColor: selected ? '#fce9f0' : 'transparent',
  });

  return (
    <>
      <Pressable
        className="bg-card border border-border rounded-2xl px-4 flex-row items-center justify-between active:opacity-80"
        style={{ height: 52 }}
        onPress={() => setOpen(true)}
      >
        <Text className="font-rounded text-base text-foreground">{pad(hour)}:{pad(minute)}</Text>
        <Clock size={16} color="#e8789a" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 bg-black/40 items-center justify-center px-8" onPress={() => setOpen(false)}>
          <Pressable className="bg-card w-full rounded-3xl p-5 gap-3" onPress={() => { /* 阻止冒泡 */ }}>
            <Text className="font-rounded text-base font-bold text-foreground text-center">選擇預約時間</Text>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="font-rounded text-xs text-muted-foreground text-center mb-1">時</Text>
                <View className="border border-border rounded-2xl overflow-hidden" style={{ height: ITEM_H * 5 }}>
                  <ScrollView ref={hourRef} showsVerticalScrollIndicator>
                    {HOURS.map(h => (
                      <Pressable key={h} className="items-center justify-center active:bg-muted" style={cell(h === hour)}
                        onPress={() => onChange(h, minute)}>
                        <Text className="font-rounded text-base" style={{ color: h === hour ? '#e8789a' : '#333', fontWeight: h === hour ? '700' : '400' }}>{pad(h)}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>
              <View className="flex-1">
                <Text className="font-rounded text-xs text-muted-foreground text-center mb-1">分</Text>
                <View className="border border-border rounded-2xl overflow-hidden" style={{ height: ITEM_H * 5 }}>
                  <ScrollView ref={minRef} showsVerticalScrollIndicator>
                    {minutes.map(m => (
                      <Pressable key={m} className="items-center justify-center active:bg-muted" style={cell(m === minute)}
                        onPress={() => onChange(hour, m)}>
                        <Text className="font-rounded text-base" style={{ color: m === minute ? '#e8789a' : '#333', fontWeight: m === minute ? '700' : '400' }}>{pad(m)}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>
            </View>
            <Pressable className="h-12 rounded-2xl bg-primary items-center justify-center active:opacity-80" onPress={() => setOpen(false)}>
              <Text className="font-rounded text-sm font-semibold text-white">完成 {pad(hour)}:{pad(minute)}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
