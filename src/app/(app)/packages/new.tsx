import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  KeyboardAvoidingView, ActivityIndicator
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, CreditCard, Hash } from 'lucide-react-native';
import DateTimePicker from 'react-native-ui-datepicker';
import { createServicePackage, getCustomerById } from '@/db/api';
import type { PackageType } from '@/types/types';

const COLLECT_OPTIONS: { key: 'cash' | 'card' | 'line_pay'; label: string; color: string }[] = [
  { key: 'cash',     label: '💵 現金',     color: '#5dc0a0' },
  { key: 'card',     label: '💳 刷卡',     color: '#8b9de8' },
  { key: 'line_pay', label: '📱 LINE Pay', color: '#06c755' },
];

const TYPE_OPTIONS: { type: PackageType; label: string; desc: string; icon: React.ReactNode }[] = [
  { type: 'session',      label: '次數套票', desc: '購買固定次數，逐次扣除', icon: <Hash size={18} color="#e8789a" /> },
  { type: 'stored_value', label: '儲值卡',   desc: '儲入金額，按消費扣款',   icon: <CreditCard size={18} color="#8b9de8" /> },
];

export default function NewPackageScreen() {
  const { customerId } = useLocalSearchParams<{ customerId: string }>();
  const router = useRouter();

  const [customerName, setCustomerName] = useState('');
  const [packageType, setPackageType] = useState<PackageType>('session');
  const [name, setName] = useState('');
  const [totalSessions, setTotalSessions] = useState('10');
  const [initialAmount, setInitialAmount] = useState('');
  const [purchaseDate, setPurchaseDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [expireDate, setExpireDate] = useState<Date | null>(null);
  const [showExpirePicker, setShowExpirePicker] = useState(false);
  const [notes, setNotes] = useState('');
  const [purchasePaymentMethod, setPurchasePaymentMethod] = useState<'cash' | 'card' | 'line_pay'>('cash');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!customerId) return;
    (async () => {
      const c = await getCustomerById(customerId);
      if (c) setCustomerName(c.name);
    })();
  }, [customerId]);

  const fmtDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const handleSave = async () => {
    setError('');
    if (!name.trim()) { setError('請輸入套票名稱'); return; }
    if (!customerId) { setError('缺少顧客資料'); return; }

    if (packageType === 'session') {
      const n = parseInt(totalSessions, 10);
      if (isNaN(n) || n <= 0) { setError('請輸入有效次數'); return; }
    } else {
      const a = parseFloat(initialAmount);
      if (isNaN(a) || a <= 0) { setError('請輸入有效儲值金額'); return; }
    }

    setLoading(true);
    try {
      const amt = parseFloat(initialAmount);
      await createServicePackage({
        customer_id: customerId,
        package_type: packageType,
        name: name.trim(),
        total_sessions: packageType === 'session' ? parseInt(totalSessions, 10) : null,
        initial_amount: packageType === 'stored_value' ? amt : (amt > 0 ? amt : null),
        remaining_amount: packageType === 'stored_value' ? amt : null,
        purchase_date: fmtDate(purchaseDate),
        expire_date: expireDate ? fmtDate(expireDate) : null,
        notes: notes.trim() || null,
        is_active: true,
        purchase_payment_method: purchasePaymentMethod,
      });
      router.back();
    } catch (e: any) {
      setError(e.message ?? '儲存失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2" onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">新增套票 / 儲值卡</Text>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-5 pb-12 gap-4" className="bg-background">

        {/* 顧客（唯讀） */}
        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">顧客</Text>
          <View className="bg-muted border border-border rounded-2xl px-4 justify-center" style={{ height: 52 }}>
            <Text className="font-rounded text-base text-muted-foreground">{customerName || '—'}</Text>
          </View>
        </View>

        {/* 類型選擇 */}
        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">類型 *</Text>
          <View className="flex-row gap-3">
            {TYPE_OPTIONS.map(opt => (
              <Pressable
                key={opt.type}
                className="flex-1 rounded-2xl p-4 border-2 active:opacity-80"
                style={{ borderColor: packageType === opt.type ? '#e8789a' : '#f0dde5', backgroundColor: packageType === opt.type ? '#fce9f0' : '#fff' }}
                onPress={() => setPackageType(opt.type)}
              >
                {opt.icon}
                <Text className="font-rounded text-sm font-semibold text-foreground mt-2">{opt.label}</Text>
                <Text className="font-rounded text-xs text-muted-foreground mt-0.5">{opt.desc}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* 套票名稱 */}
        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">套票名稱 *</Text>
          <TextInput
            className="bg-card border border-border rounded-2xl px-4 font-rounded text-base text-foreground"
            style={{ height: 52 }}
            placeholder="例：剪髮10次套票、護膚儲值卡"
            placeholderTextColor="#c4a0ae"
            value={name}
            onChangeText={setName}
          />
        </View>

        {/* 依類型顯示 */}
        {packageType === 'session' ? (
          <>
            <View>
              <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">總次數 *</Text>
              <View className="flex-row items-center bg-card border border-border rounded-2xl px-4" style={{ height: 52 }}>
                <TextInput
                  className="flex-1 font-rounded text-base text-foreground"
                  placeholder="10"
                  placeholderTextColor="#c4a0ae"
                  value={totalSessions}
                  onChangeText={setTotalSessions}
                  keyboardType="numeric"
                />
                <Text className="font-rounded text-sm text-muted-foreground">次</Text>
              </View>
            </View>
            <View>
              <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">套票金額（選填，計入收入）</Text>
              <View className="flex-row items-center bg-card border border-border rounded-2xl px-4" style={{ height: 52 }}>
                <Text className="font-rounded text-base text-muted-foreground mr-2">$</Text>
                <TextInput
                  className="flex-1 font-rounded text-base text-foreground"
                  placeholder="0"
                  placeholderTextColor="#c4a0ae"
                  value={initialAmount}
                  onChangeText={setInitialAmount}
                  keyboardType="numeric"
                />
              </View>
            </View>
          </>
        ) : (
          <View>
            <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">儲值金額 *</Text>
            <View className="flex-row items-center bg-card border border-border rounded-2xl px-4" style={{ height: 52 }}>
              <Text className="font-rounded text-base text-muted-foreground mr-2">$</Text>
              <TextInput
                className="flex-1 font-rounded text-base text-foreground"
                placeholder="0"
                placeholderTextColor="#c4a0ae"
                value={initialAmount}
                onChangeText={setInitialAmount}
                keyboardType="numeric"
              />
            </View>
          </View>
        )}

        {/* 收款方式 */}
        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-2">收款方式</Text>
          <View className="flex-row gap-2">
            {COLLECT_OPTIONS.map(opt => (
              <Pressable
                key={opt.key}
                className="flex-1 rounded-xl py-2.5 items-center border active:opacity-70"
                style={{
                  backgroundColor: purchasePaymentMethod === opt.key ? opt.color + '22' : '#fafafa',
                  borderColor: purchasePaymentMethod === opt.key ? opt.color : '#e8dce8',
                }}
                onPress={() => setPurchasePaymentMethod(opt.key)}
              >
                <Text className="font-rounded text-sm font-semibold" style={{ color: purchasePaymentMethod === opt.key ? opt.color : '#b0a0b0' }}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* 購買日期 */}
        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">購買日期</Text>
          <Pressable
            className="bg-card border border-border rounded-2xl px-4 justify-center active:opacity-80"
            style={{ height: 52 }}
            onPress={() => setShowDatePicker(!showDatePicker)}
          >
            <Text className="font-rounded text-base text-foreground">{fmtDate(purchaseDate)}</Text>
          </Pressable>
          {showDatePicker && (
            <View className="bg-card border border-border rounded-2xl mt-2 overflow-hidden">
              <DateTimePicker locale="zh-tw"
                mode="single" date={purchaseDate}
                onChange={(p) => { if (p.date) setPurchaseDate(p.date as Date); setShowDatePicker(false); }}
              />
            </View>
          )}
        </View>

        {/* 到期日（選填） */}
        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">到期日（選填）</Text>
          <Pressable
            className="bg-card border border-border rounded-2xl px-4 justify-center active:opacity-80"
            style={{ height: 52 }}
            onPress={() => setShowExpirePicker(!showExpirePicker)}
          >
            <Text className="font-rounded text-base text-foreground">
              {expireDate ? fmtDate(expireDate) : '不設到期日'}
            </Text>
          </Pressable>
          {showExpirePicker && (
            <View className="bg-card border border-border rounded-2xl mt-2 overflow-hidden">
              <DateTimePicker locale="zh-tw"
                mode="single" date={expireDate ?? new Date()}
                onChange={(p) => { if (p.date) setExpireDate(p.date as Date); setShowExpirePicker(false); }}
              />
            </View>
          )}
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
            multiline numberOfLines={3} textAlignVertical="top"
          />
        </View>

        {error ? <Text className="font-rounded text-destructive text-sm">{error}</Text> : null}

        <Pressable
          className="bg-primary rounded-2xl items-center justify-center active:opacity-80 mt-2"
          style={{ height: 56 }}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text className="font-rounded text-white text-base font-semibold">建立套票</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
