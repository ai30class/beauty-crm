import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Package, RefreshCcw, ChevronDown } from 'lucide-react-native';
import { getProducts, restockProduct } from '@/db/api';
import type { Product } from '@/types/types';

export default function RestockScreen() {
  const { productId } = useLocalSearchParams<{ productId?: string }>();
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState(productId ?? '');
  const [qty, setQty] = useState('');
  const [costUnit, setCostUnit] = useState('');   // 單件進貨價
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    getProducts().then(data => {
      setProducts(data);
      setLoading(false);
    });
  }, []);

  const selected = products.find(p => p.id === selectedId);
  const qtyNum = parseInt(qty, 10);
  const costUnitNum = parseFloat(costUnit) || 0;
  const costTotal = isNaN(qtyNum) ? 0 : qtyNum * costUnitNum;

  const handleRestock = async () => {
    setError('');
    if (!selectedId) { setError('請選擇保養品'); return; }
    if (isNaN(qtyNum) || qtyNum <= 0) { setError('請輸入有效的補貨數量（正整數）'); return; }
    setSaving(true);
    try {
      await restockProduct(selectedId, qtyNum, costTotal, note);
      router.back();
    } catch (e: any) {
      setError(e.message ?? '補貨失敗');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color="#e8789a" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <StatusBar style="dark" backgroundColor="#fff5f7" />

      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2" onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <RefreshCcw size={18} color="#4a6cf7" style={{ marginRight: 8 }} />
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">補貨登記</Text>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-5 pb-12 gap-4" className="bg-background">
        {/* 選擇品項 */}
        <View className="gap-1.5">
          <Text className="font-rounded text-sm font-medium text-foreground">選擇保養品 *</Text>
          <Pressable
            className="flex-row items-center bg-card border border-border rounded-2xl px-4 gap-2 active:opacity-80"
            style={{ height: 52 }}
            onPress={() => setShowPicker(!showPicker)}
          >
            <Package size={16} color="#e8789a" />
            <Text className={`flex-1 font-rounded text-base ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>
              {selected ? `${selected.name}（現有庫存：${selected.stock} 件）` : '選擇品項...'}
            </Text>
            <ChevronDown size={16} color="#c4a0ae" />
          </Pressable>

          {showPicker && (
            <View className="bg-card border border-border rounded-2xl overflow-hidden mt-1">
              {products.map((p, i) => (
                <Pressable
                  key={p.id}
                  className={`px-4 py-3 active:bg-muted flex-row items-center justify-between ${i > 0 ? 'border-t border-border' : ''}`}
                  onPress={() => { setSelectedId(p.id); setShowPicker(false); }}
                >
                  <View>
                    <Text className={`font-rounded text-sm font-semibold ${selectedId === p.id ? 'text-primary' : 'text-foreground'}`}>{p.name}</Text>
                    <Text className="font-rounded text-xs text-muted-foreground">{p.spec || '—'}</Text>
                  </View>
                  <Text className="font-rounded text-xs text-muted-foreground">庫存 {p.stock}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* 補貨數量 */}
        <View className="gap-1.5">
          <Text className="font-rounded text-sm font-medium text-foreground">補貨數量 *</Text>
          <View className="flex-row items-center bg-card border border-border rounded-2xl px-4" style={{ height: 52 }}>
            <TextInput
              className="flex-1 font-rounded text-base text-foreground"
              placeholder="輸入補貨數量"
              placeholderTextColor="#c4a0ae"
              value={qty}
              onChangeText={v => { setQty(v); setError(''); }}
              keyboardType="numeric"
            />
            <Text className="font-rounded text-base text-muted-foreground">件</Text>
          </View>
        </View>

        {/* 單件進貨價（可選） */}
        <View className="gap-1.5">
          <Text className="font-rounded text-sm font-medium text-foreground">單件進貨價（選填）</Text>
          <View className="flex-row items-center bg-card border border-border rounded-2xl px-4" style={{ height: 52 }}>
            <Text className="font-rounded text-base text-muted-foreground mr-1">$</Text>
            <TextInput
              className="flex-1 font-rounded text-base text-foreground"
              placeholder="0"
              placeholderTextColor="#c4a0ae"
              value={costUnit}
              onChangeText={setCostUnit}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        {/* 備註 */}
        <View className="gap-1.5">
          <Text className="font-rounded text-sm font-medium text-foreground">備註（選填）</Text>
          <View className="bg-card border border-border rounded-2xl px-4 py-3">
            <TextInput
              className="font-rounded text-base text-foreground"
              placeholder="供應商、批號等"
              placeholderTextColor="#c4a0ae"
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={2}
              style={{ minHeight: 48, textAlignVertical: 'top' }}
            />
          </View>
        </View>

        {/* 補貨後預覽 */}
        {selected && !isNaN(qtyNum) && qtyNum > 0 && (
          <View className="bg-card border border-border rounded-2xl px-4 py-3 gap-2">
            <Text className="font-rounded text-xs text-muted-foreground">補貨確認</Text>
            <View className="flex-row justify-between">
              <Text className="font-rounded text-sm text-muted-foreground">補貨後庫存</Text>
              <Text className="font-rounded text-sm font-bold" style={{ color: '#5dc0a0' }}>
                {selected.stock} + {qtyNum} = {selected.stock + qtyNum} 件
              </Text>
            </View>
            {costTotal > 0 && (
              <View className="flex-row justify-between border-t border-border pt-2">
                <Text className="font-rounded text-sm text-muted-foreground">本次進貨成本</Text>
                <Text className="font-rounded text-sm font-bold" style={{ color: '#e8789a' }}>
                  ${costTotal.toLocaleString()}
                </Text>
              </View>
            )}
          </View>
        )}

        {error ? <Text className="font-rounded text-destructive text-sm">{error}</Text> : null}

        <Pressable
          className="rounded-2xl items-center justify-center active:opacity-80 mt-2"
          style={{ height: 56, backgroundColor: '#4a6cf7' }}
          onPress={handleRestock}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text className="font-rounded text-white text-base font-semibold">確認補貨</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
