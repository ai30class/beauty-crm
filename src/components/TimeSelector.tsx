import { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, Modal } from 'react-native';
import { ChevronDown } from 'lucide-react-native';

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

// ── 時間選擇器（跳出視窗選單，避免巢狀捲動在網頁版滾不動、蓋住下一列） ───────
const TIME_ITEM_HEIGHT = 44;

export default function TimeSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!open) return;
    const idx = TIME_OPTIONS.indexOf(value);
    if (idx < 0) return;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, (idx - 2) * TIME_ITEM_HEIGHT), animated: false });
    });
  }, [open, value]);

  return (
    <>
      <Pressable
        className="flex-row items-center bg-background border border-border rounded-xl px-3 py-2 gap-1 active:opacity-70"
        onPress={() => setOpen(true)}
      >
        <Text className="font-rounded text-sm text-foreground">{value}</Text>
        <ChevronDown size={12} color="#c4a0ae" />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 bg-black/30 items-center justify-center px-10" onPress={() => setOpen(false)}>
          <Pressable
            className="bg-card rounded-3xl overflow-hidden border border-border"
            style={{ width: 160, maxHeight: TIME_ITEM_HEIGHT * 6 }}
            onPress={() => {/* 阻止冒泡 */}}
          >
            <ScrollView ref={scrollRef} showsVerticalScrollIndicator>
              {TIME_OPTIONS.map(t => (
                <Pressable
                  key={t}
                  className="px-4 items-center justify-center active:bg-muted"
                  style={{ height: TIME_ITEM_HEIGHT, backgroundColor: t === value ? '#fce9f0' : 'transparent' }}
                  onPress={() => { onChange(t); setOpen(false); }}
                >
                  <Text
                    className="font-rounded text-base"
                    style={{ color: t === value ? '#e8789a' : '#333', fontWeight: t === value ? '700' : '400' }}
                  >
                    {t}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
