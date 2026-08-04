import { useState } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Tag } from 'lucide-react-native';
import { createCoupon } from '@/db/api';
import type { CouponType } from '@/types/types';

const TYPE_OPTIONS: { type: CouponType; label: string; desc: string; color: string }[] = [
  { type: 'discount_pct', label: '百分比折扣', desc: '例：8折 → 填 80', color: '#8b9de8' },
  { type: 'discount_amt', label: '固定折抵金額', desc: '例：折抵 $100', color: '#5dc0a0' },
  { type: 'free_service', label: '免費服務體驗', desc: '免費兌換一次服務', color: '#e8789a' },
];

export default function NewCouponScreen() {
  const router = useRouter();
  const [type, setType] = useState<CouponType>('discount_pct');
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [minAmount, setMinAmount] = useState('0');
  const [quota, setQuota] = useState('');
  const [validDays, setValidDays] = useState('90');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setError('');
    if (!name.trim()) { setError('請輸入優惠券名稱'); return; }
    const v = parseFloat(value);
    if (isNaN(v) || v <= 0) { setError('請輸入有效的優惠值'); return; }
    if (type === 'discount_pct' && (v <= 0 || v > 100)) { setError('折扣百分比請填 1~100'); return; }
    const days = parseInt(validDays, 10);
    if (isNaN(days) || days <= 0) { setError('請輸入有效的有效天數'); return; }
    const minAmt = parseFloat(minAmount) || 0;
    const quotaNum = quota.trim() ? parseInt(quota, 10) : null;
    setSaving(true);
    try {
      await createCoupon({
        name: name.trim(), type, value: v,
        min_amount: minAmt, quota: quotaNum,
        valid_days: days, note: note.trim(), is_active: true,
      });
      router.back();
    } catch (e: any) {
      setError(e.message ?? '建立失敗');
    } finally {
      setSaving(false);
    }
  };

  const selectedColor = TYPE_OPTIONS.find(t => t.type === type)?.color ?? '#e8789a';

  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2"
          onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Tag size={18} color="#e8789a" style={{ marginRight: 8 }} />
        <Text className="font-rounded text-xl font-bold text-foreground">新增優惠券</Text>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-5 pb-12 gap-4" className="bg-background">
        {/* 類型選擇 */}
        <View className="gap-2">
          <Text className="font-rounded text-sm font-medium text-foreground">優惠類型 *</Text>
          {TYPE_OPTIONS.map(opt => (
            <Pressable key={opt.type}
              className="flex-row items-center bg-card border rounded-2xl px-4 py-3 gap-3 active:opacity-80"
              style={{ borderColor: type === opt.type ? opt.color : '#f0e0e8',
                backgroundColor: type === opt.type ? opt.color + '11' : undefined }}
              onPress={() => setType(opt.type)}
            >
              <View className="w-3 h-3 rounded-full border-2"
                style={{ borderColor: opt.color, backgroundColor: type === opt.type ? opt.color : 'transparent' }} />
              <View className="flex-1">
                <Text className="font-rounded text-base font-semibold text-foreground">{opt.label}</Text>
                <Text className="font-rounded text-xs text-muted-foreground">{opt.desc}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        <Field label="優惠券名稱 *" placeholder="例：新顧客首次優惠" value={name} onChangeText={setName} />

        {type !== 'free_service' && (
          <Field
            label={type === 'discount_pct' ? '折扣（% 值）*' : '折抵金額 *'}
            placeholder={type === 'discount_pct' ? '例：80（代表八折）' : '例：100'}
            value={value} onChangeText={setValue} keyboardType="numeric"
            prefix={type === 'discount_amt' ? '$' : undefined}
            suffix={type === 'discount_pct' ? '%' : undefined}
          />
        )}

        <Field label="最低消費門檻" placeholder="0（不限）" value={minAmount}
          onChangeText={setMinAmount} keyboardType="numeric" prefix="$"
          hint="消費滿此金額才可使用，0 表示不限" />

        <Field label="發行數量上限" placeholder="留空表示無限量"
          value={quota} onChangeText={setQuota} keyboardType="numeric" suffix="張"
          hint="達到上限後不可再發券" />

        <Field label="有效天數 *" placeholder="90" value={validDays}
          onChangeText={setValidDays} keyboardType="numeric" suffix="天"
          hint="從發行日起算的有效天數" />

        <Field label="備註" placeholder="例：限新顧客使用" value={note} onChangeText={setNote} />

        {error ? <Text className="font-rounded text-sm text-destructive">{error}</Text> : null}

        <Pressable
          className="bg-primary rounded-2xl h-14 items-center justify-center active:opacity-80 mt-2"
          onPress={handleSave} disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text className="font-rounded text-white text-base font-semibold">建立優惠券</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, placeholder, value, onChangeText, keyboardType = 'default', prefix, suffix, hint }: {
  label: string; placeholder: string; value: string;
  onChangeText: (v: string) => void; keyboardType?: 'default' | 'numeric';
  prefix?: string; suffix?: string; hint?: string;
}) {
  return (
    <View className="gap-1.5">
      <Text className="font-rounded text-sm font-medium text-foreground">{label}</Text>
      <View className="flex-row items-center bg-card border border-border rounded-2xl px-4" style={{ height: 52 }}>
        {prefix && <Text className="font-rounded text-base text-muted-foreground mr-2">{prefix}</Text>}
        <TextInput
          className="flex-1 font-rounded text-base text-foreground"
          placeholder={placeholder} placeholderTextColor="#c4a0ae"
          value={value} onChangeText={onChangeText} keyboardType={keyboardType}
        />
        {suffix && <Text className="font-rounded text-base text-muted-foreground ml-2">{suffix}</Text>}
      </View>
      {hint && <Text className="font-rounded text-xs text-muted-foreground">{hint}</Text>}
    </View>
  );
}
