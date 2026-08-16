import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  KeyboardAvoidingView, ActivityIndicator, FlatList, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Tag, Search, CheckCircle, AlertTriangle } from 'lucide-react-native';
import { searchCustomers, getCustomerCoupons, useCoupon } from '@/db/api';
import type { Customer, CustomerCoupon } from '@/types/types';

function couponValueText(type: string, value: number) {
  if (type === 'discount_pct') return `${value}% OFF`;
  if (type === 'discount_amt') return `折抵 $${value}`;
  return '免費體驗';
}

const TYPE_COLORS: Record<string, string> = {
  discount_pct: '#8b9de8', discount_amt: '#5dc0a0', free_service: '#e8789a',
};

export default function RedeemCouponScreen() {
  const router = useRouter();
  const [searchQ, setSearchQ] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerCoupons, setCustomerCoupons] = useState<CustomerCoupon[]>([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const [selectedCC, setSelectedCC] = useState<CustomerCoupon | null>(null);
  const [usedAmount, setUsedAmount] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
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
    setCustomers([]);
    setSearchQ('');
    setLoadingCoupons(true);
    try {
      const all = await getCustomerCoupons(c.id);
      setCustomerCoupons(all.filter(cc => !cc.is_used));
    } finally {
      setLoadingCoupons(false);
    }
  };

  const handleRedeem = async () => {
    if (!selectedCC) return;
    setSaving(true);
    setError('');
    try {
      const amt = parseFloat(usedAmount) || 0;
      await useCoupon(selectedCC.id, amt);
      setCustomerCoupons(prev => prev.filter(cc => cc.id !== selectedCC.id));
      setSelectedCC(null);
      setShowConfirm(false);
      setUsedAmount('');
    } catch (e: any) {
      setError(e.message ?? '核銷失敗');
    } finally {
      setSaving(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2"
          onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Tag size={18} color="#5dc0a0" style={{ marginRight: 8 }} />
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">核銷優惠券</Text>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-5 pb-12 gap-3" className="flex-1">
        {/* 搜尋顧客 */}
        <Text className="font-rounded text-sm font-medium text-foreground">搜尋顧客</Text>
        <View className="flex-row items-center bg-card border border-border rounded-2xl px-4 gap-2" style={{ height: 48 }}>
          <Search size={16} color="#c4a0ae" />
          <TextInput
            className="flex-1 font-rounded text-base text-foreground"
            placeholder="輸入姓名或電話" placeholderTextColor="#c4a0ae"
            value={searchQ} onChangeText={handleSearch}
          />
          {searching && <ActivityIndicator size="small" color="#e8789a" />}
        </View>

        {/* 搜尋結果 */}
        {customers.map(c => (
          <Pressable key={c.id}
            className="bg-card border border-border rounded-2xl px-4 py-3 flex-row items-center gap-3 active:opacity-80"
            onPress={() => handleSelectCustomer(c)}
          >
            <View className="w-9 h-9 rounded-full bg-primary/10 items-center justify-center">
              <Text className="font-rounded text-sm font-bold text-primary">{c.name.charAt(0)}</Text>
            </View>
            <View className="flex-1">
              <Text className="font-rounded text-sm font-semibold text-foreground">{c.name}</Text>
              <Text className="font-rounded text-xs text-muted-foreground">{c.phone}</Text>
            </View>
          </Pressable>
        ))}

        {/* 已選顧客 + 持有券 */}
        {selectedCustomer && (
          <View className="gap-3">
            <View className="bg-card border border-border rounded-2xl px-4 py-3 flex-row items-center gap-2">
              <CheckCircle size={16} color="#5dc0a0" />
              <Text className="font-rounded text-sm text-foreground">
                顧客：<Text className="font-bold">{selectedCustomer.name}</Text>（{selectedCustomer.phone}）
              </Text>
            </View>

            <Text className="font-rounded text-sm font-medium text-foreground">持有的未使用優惠券</Text>

            {loadingCoupons ? (
              <View className="py-8 items-center"><ActivityIndicator color="#e8789a" /></View>
            ) : customerCoupons.length === 0 ? (
              <View className="bg-card border border-border rounded-2xl p-6 items-center gap-2">
                <Tag size={32} color="#c4a0ae" />
                <Text className="font-rounded text-sm text-muted-foreground">此顧客目前沒有可用的優惠券</Text>
              </View>
            ) : (
              customerCoupons.map(cc => {
                const type = cc.coupon?.type ?? '';
                const color = TYPE_COLORS[type] ?? '#e8789a';
                const isExpired = cc.expire_date < today;
                const isSelected = selectedCC?.id === cc.id;
                return (
                  <Pressable key={cc.id}
                    className="bg-card border rounded-2xl p-4 gap-2 active:opacity-80"
                    style={{ borderColor: isSelected ? color : isExpired ? '#ddd' : '#f0e0e8',
                      opacity: isExpired ? 0.5 : 1 }}
                    onPress={() => { if (!isExpired) setSelectedCC(isSelected ? null : cc); }}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: color + '22' }}>
                        <Text className="font-rounded text-xs font-semibold" style={{ color }}>
                          {couponValueText(type, cc.coupon?.value ?? 0)}
                        </Text>
                      </View>
                      {isExpired && (
                        <View className="px-2 py-0.5 rounded-full bg-muted">
                          <Text className="font-rounded text-xs text-muted-foreground">已過期</Text>
                        </View>
                      )}
                      {isSelected && <CheckCircle size={16} color={color} />}
                    </View>
                    <Text className="font-rounded text-base font-semibold text-foreground">{cc.coupon?.name ?? '優惠券'}</Text>
                    <Text className="font-rounded text-xs text-muted-foreground">到期日：{cc.expire_date}</Text>
                    {(cc.coupon?.min_amount ?? 0) > 0 && (
                      <Text className="font-rounded text-xs text-muted-foreground">最低消費：${cc.coupon.min_amount}</Text>
                    )}
                  </Pressable>
                );
              })
            )}

            {selectedCC && (
              <Pressable
                className="bg-primary rounded-2xl h-14 items-center justify-center active:opacity-80"
                onPress={() => setShowConfirm(true)}
              >
                <Text className="font-rounded text-white text-base font-semibold">核銷此優惠券</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>

      {/* 核銷確認 Modal */}
      <Modal visible={showConfirm} transparent animationType="fade" onRequestClose={() => setShowConfirm(false)}>
        <Pressable className="flex-1 bg-black/40 items-center justify-center px-8" onPress={() => setShowConfirm(false)}>
          <Pressable className="bg-card w-full rounded-3xl p-6 gap-4" onPress={() => {}}>
            <View className="items-center gap-2">
              <View className="w-16 h-16 rounded-full items-center justify-center" style={{ backgroundColor: '#e8f5ef' }}>
                <Tag size={28} color="#5dc0a0" />
              </View>
              <Text className="font-rounded text-lg font-bold text-foreground">確認核銷</Text>
              <Text className="font-rounded text-sm text-muted-foreground text-center">
                {selectedCC?.coupon?.name}
              </Text>
            </View>
            {selectedCC?.coupon?.type === 'discount_amt' && (
              <View className="gap-1.5">
                <Text className="font-rounded text-sm font-medium text-foreground">實際折抵金額</Text>
                <View className="flex-row items-center bg-background border border-border rounded-2xl px-4" style={{ height: 48 }}>
                  <Text className="font-rounded text-base text-muted-foreground mr-2">$</Text>
                  <TextInput
                    className="flex-1 font-rounded text-base text-foreground"
                    placeholder={String(selectedCC?.coupon?.value ?? 0)}
                    placeholderTextColor="#c4a0ae"
                    value={usedAmount} onChangeText={setUsedAmount}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            )}
            {error ? <Text className="font-rounded text-sm text-destructive text-center">{error}</Text> : null}
            <View className="flex-row gap-3">
              <Pressable className="flex-1 h-12 rounded-2xl border border-border items-center justify-center active:opacity-70"
                onPress={() => setShowConfirm(false)}>
                <Text className="font-rounded text-sm font-semibold text-muted-foreground">取消</Text>
              </Pressable>
              <Pressable
                className="flex-1 h-12 rounded-2xl items-center justify-center active:opacity-80"
                style={{ backgroundColor: '#5dc0a0' }}
                onPress={handleRedeem} disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" /> : (
                  <Text className="font-rounded text-sm font-semibold text-white">確認核銷</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}
