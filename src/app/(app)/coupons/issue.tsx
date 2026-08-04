import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  KeyboardAvoidingView, ActivityIndicator, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Ticket, Search, CheckCircle, ChevronRight } from 'lucide-react-native';
import { searchCustomers, getCoupons, issueCouponToCustomer } from '@/db/api';
import type { Customer, Coupon } from '@/types/types';

type Step = 'customer' | 'coupon' | 'confirm';

function couponValueText(c: Coupon) {
  if (c.type === 'discount_pct') return `${c.value}% OFF`;
  if (c.type === 'discount_amt') return `折抵 $${c.value}`;
  return '免費體驗';
}

const TYPE_COLORS: Record<string, string> = {
  discount_pct: '#8b9de8', discount_amt: '#5dc0a0', free_service: '#e8789a',
};

export default function IssueCouponScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('customer');
  const [searchQ, setSearchQ] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async (q: string) => {
    setSearchQ(q);
    if (!q.trim()) { setCustomers([]); return; }
    setSearching(true);
    try { setCustomers(await searchCustomers(q)); }
    finally { setSearching(false); }
  };

  const handleSelectCustomer = async (c: Customer) => {
    setSelectedCustomer(c);
    setStep('coupon');
    const data = await getCoupons();
    setCoupons(data.filter(cp => cp.is_active));
  };

  const handleIssue = async () => {
    if (!selectedCustomer || !selectedCoupon) return;
    setSaving(true);
    setError('');
    try {
      await issueCouponToCustomer(
        selectedCoupon.id, selectedCustomer.id,
        selectedCustomer.name, selectedCustomer.phone,
        selectedCoupon.valid_days,
      );
      setDone(true);
    } catch (e: any) {
      setError(e.message ?? '發券失敗');
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-8 gap-6">
        <Text style={{ fontSize: 64 }}>🎉</Text>
        <Text className="font-rounded text-2xl font-bold text-foreground text-center">發券成功！</Text>
        <Text className="font-rounded text-base text-muted-foreground text-center">
          已成功將「{selectedCoupon?.name}」發放給 {selectedCustomer?.name}
        </Text>
        <Pressable className="bg-primary rounded-2xl px-10 py-3 active:opacity-80" onPress={() => router.back()}>
          <Text className="font-rounded text-white font-semibold">返回</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2"
          onPress={() => step === 'customer' ? router.back() : step === 'coupon' ? setStep('customer') : setStep('coupon')}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Ticket size={18} color="#e8789a" style={{ marginRight: 8 }} />
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">
          {step === 'customer' ? '選擇顧客' : step === 'coupon' ? '選擇優惠券' : '確認發券'}
        </Text>
      </View>

      {/* Step 1: 選顧客 */}
      {step === 'customer' && (
        <View className="flex-1 px-5 gap-3">
          <View className="flex-row items-center bg-card border border-border rounded-2xl px-4 gap-2" style={{ height: 48 }}>
            <Search size={16} color="#c4a0ae" />
            <TextInput
              className="flex-1 font-rounded text-base text-foreground"
              placeholder="搜尋顧客姓名或電話" placeholderTextColor="#c4a0ae"
              value={searchQ} onChangeText={handleSearch}
            />
            {searching && <ActivityIndicator size="small" color="#e8789a" />}
          </View>
          <FlatList
            data={customers}
            keyExtractor={c => c.id}
            contentContainerClassName="gap-2 pb-12"
            ListEmptyComponent={searchQ ? (
              <Text className="font-rounded text-sm text-muted-foreground text-center py-8">找不到符合的顧客</Text>
            ) : (
              <Text className="font-rounded text-sm text-muted-foreground text-center py-8">輸入姓名或電話來搜尋顧客</Text>
            )}
            renderItem={({ item: c }) => (
              <Pressable
                className="bg-card border border-border rounded-2xl px-4 py-3 flex-row items-center gap-3 active:opacity-80"
                onPress={() => handleSelectCustomer(c)}
              >
                <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
                  <Text className="font-rounded text-base font-bold text-primary">{c.name.charAt(0)}</Text>
                </View>
                <View className="flex-1">
                  <Text className="font-rounded text-base font-semibold text-foreground">{c.name}</Text>
                  <Text className="font-rounded text-xs text-muted-foreground">{c.phone}</Text>
                </View>
                <ChevronRight size={16} color="#c4a0ae" />
              </Pressable>
            )}
          />
        </View>
      )}

      {/* Step 2: 選優惠券 */}
      {step === 'coupon' && (
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="px-5 pb-12 gap-3">
          <View className="bg-card border border-border rounded-2xl px-4 py-3 flex-row items-center gap-2">
            <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center">
              <Text className="font-rounded text-sm font-bold text-primary">{selectedCustomer?.name.charAt(0)}</Text>
            </View>
            <Text className="font-rounded text-sm text-foreground">發券給：<Text className="font-bold">{selectedCustomer?.name}</Text></Text>
          </View>
          {coupons.length === 0 ? (
            <Text className="font-rounded text-sm text-muted-foreground text-center py-8">目前沒有啟用中的優惠券</Text>
          ) : coupons.map(c => {
            const color = TYPE_COLORS[c.type] ?? '#e8789a';
            const isSelected = selectedCoupon?.id === c.id;
            return (
              <Pressable key={c.id}
                className="bg-card border rounded-2xl p-4 gap-2 active:opacity-80"
                style={{ borderColor: isSelected ? color : '#f0e0e8',
                  backgroundColor: isSelected ? color + '11' : undefined }}
                onPress={() => setSelectedCoupon(c)}
              >
                <View className="flex-row items-center gap-2">
                  <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: color + '22' }}>
                    <Text className="font-rounded text-xs font-semibold" style={{ color }}>{couponValueText(c)}</Text>
                  </View>
                  {c.min_amount > 0 && (
                    <Text className="font-rounded text-xs text-muted-foreground">滿 ${c.min_amount}</Text>
                  )}
                  {isSelected && <CheckCircle size={16} color={color} style={{ marginLeft: 'auto' }} />}
                </View>
                <Text className="font-rounded text-base font-semibold text-foreground">{c.name}</Text>
                <Text className="font-rounded text-xs text-muted-foreground">有效 {c.valid_days} 天・剩餘 {c.quota != null ? `${(c.quota ?? 0) - c.issued}` : '無限'} 張</Text>
              </Pressable>
            );
          })}
          {selectedCoupon && (
            <Pressable
              className="bg-primary rounded-2xl h-14 items-center justify-center active:opacity-80 mt-2"
              onPress={() => setStep('confirm')}
            >
              <Text className="font-rounded text-white text-base font-semibold">下一步：確認發券</Text>
            </Pressable>
          )}
        </ScrollView>
      )}

      {/* Step 3: 確認 */}
      {step === 'confirm' && selectedCustomer && selectedCoupon && (
        <View className="flex-1 px-5 justify-center gap-6">
          <View className="bg-card border border-border rounded-3xl p-6 gap-4">
            <Text className="font-rounded text-lg font-bold text-foreground text-center">確認發券資訊</Text>
            <View className="gap-3">
              <InfoRow label="顧客" value={`${selectedCustomer.name}（${selectedCustomer.phone}）`} />
              <InfoRow label="優惠券" value={selectedCoupon.name} />
              <InfoRow label="優惠內容" value={couponValueText(selectedCoupon)} />
              {selectedCoupon.min_amount > 0 && (
                <InfoRow label="使用門檻" value={`消費滿 $${selectedCoupon.min_amount}`} />
              )}
              <InfoRow label="有效期限" value={`發行後 ${selectedCoupon.valid_days} 天內`} />
            </View>
          </View>
          {error ? <Text className="font-rounded text-sm text-destructive text-center">{error}</Text> : null}
          <Pressable
            className="bg-primary rounded-2xl h-14 items-center justify-center active:opacity-80"
            onPress={handleIssue} disabled={saving}
          >
            {saving ? <ActivityIndicator color="#fff" /> : (
              <Text className="font-rounded text-white text-base font-semibold">🎁 確認發送</Text>
            )}
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between items-center">
      <Text className="font-rounded text-sm text-muted-foreground">{label}</Text>
      <Text className="font-rounded text-sm font-semibold text-foreground flex-1 text-right ml-4">{value}</Text>
    </View>
  );
}
