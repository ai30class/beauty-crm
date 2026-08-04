import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  KeyboardAvoidingView, ActivityIndicator, Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Package, Trash2, AlertTriangle } from 'lucide-react-native';
import { getProducts, updateProduct, deleteProduct } from '@/db/api';
import type { Product } from '@/types/types';

export default function EditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showDelete, setShowDelete] = useState(false);

  const [name, setName] = useState('');
  const [spec, setSpec] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [stock, setStock] = useState('');
  const [safetyStock, setSafetyStock] = useState('');

  useEffect(() => {
    (async () => {
      const all = await getProducts();
      const p = all.find(x => x.id === id) ?? null;
      if (p) {
        setProduct(p);
        setName(p.name);
        setSpec(p.spec);
        setCostPrice(String(p.cost_price));
        setSellPrice(String(p.sell_price));
        setStock(String(p.stock));
        setSafetyStock(String(p.safety_stock));
      }
      setLoading(false);
    })();
  }, [id]);

  const handleSave = async () => {
    setError('');
    if (!name.trim()) { setError('請輸入品名'); return; }
    const cost = parseFloat(costPrice);
    const sell = parseFloat(sellPrice);
    const stockNum = parseInt(stock, 10);
    const safetyNum = parseInt(safetyStock, 10);
    if (isNaN(cost) || cost < 0) { setError('請輸入有效進貨單價'); return; }
    if (isNaN(sell) || sell < 0) { setError('請輸入有效售價'); return; }
    if (isNaN(stockNum) || stockNum < 0) { setError('請輸入有效庫存數量'); return; }
    if (isNaN(safetyNum) || safetyNum < 0) { setError('請輸入有效安全庫存數量'); return; }
    setSaving(true);
    try {
      await updateProduct(id!, {
        name: name.trim(),
        spec: spec.trim(),
        cost_price: cost,
        sell_price: sell,
        stock: stockNum,
        safety_stock: safetyNum,
      });
      router.back();
    } catch (e: any) {
      setError(e.message?.includes('unique') ? '此品名已存在' : (e.message ?? '儲存失敗'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setShowDelete(false);
    setSaving(true);
    try {
      await deleteProduct(id!);
      router.back();
    } catch (e: any) {
      setError('刪除失敗：此品項可能有關聯的服務記錄');
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

  if (!product) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-8">
        <Text className="font-rounded text-base text-muted-foreground">找不到此品項</Text>
        <Pressable className="mt-4 bg-primary rounded-2xl px-6 py-3" onPress={() => router.back()}>
          <Text className="font-rounded text-white text-sm">返回</Text>
        </Pressable>
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
        <Package size={18} color="#e8789a" style={{ marginRight: 8 }} />
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">編輯保養品</Text>
        <Pressable
          className="w-9 h-9 items-center justify-center rounded-full active:opacity-70"
          style={{ backgroundColor: '#fce9f0' }}
          onPress={() => setShowDelete(true)}
        >
          <Trash2 size={18} color="#e85454" />
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-5 pb-12 gap-4" className="bg-background">
        <Field label="品名 *" placeholder="例：玫瑰精華液" value={name} onChangeText={setName} />
        <Field label="規格 / 容量" placeholder="例：50ml" value={spec} onChangeText={setSpec} />
        <Field label="進貨單價 *" placeholder="0" value={costPrice} onChangeText={setCostPrice} keyboardType="numeric" prefix="$" />
        <Field label="售價 *" placeholder="0" value={sellPrice} onChangeText={setSellPrice} keyboardType="numeric" prefix="$" />
        <Field label="庫存數量 *" placeholder="0" value={stock} onChangeText={setStock} keyboardType="numeric" suffix="件" />
        <Field label="安全庫存數量 *" placeholder="0" value={safetyStock} onChangeText={setSafetyStock} keyboardType="numeric" suffix="件"
          hint="低於此數量時顯示警示" />

        {error ? <Text className="font-rounded text-destructive text-sm">{error}</Text> : null}

        <Pressable
          className="bg-primary rounded-2xl items-center justify-center active:opacity-80 mt-2"
          style={{ height: 56 }}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text className="font-rounded text-white text-base font-semibold">儲存修改</Text>}
        </Pressable>
      </ScrollView>

      {/* 刪除確認 Modal */}
      <Modal visible={showDelete} transparent animationType="fade" onRequestClose={() => setShowDelete(false)}>
        <Pressable className="flex-1 bg-black/40 items-center justify-center px-8" onPress={() => setShowDelete(false)}>
          <Pressable
            className="bg-card w-full rounded-3xl p-6 gap-4"
            style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 10 }}
            onPress={() => {/* 阻止冒泡 */}}
          >
            <View className="items-center gap-3">
              <View className="w-16 h-16 rounded-full items-center justify-center" style={{ backgroundColor: '#fce9f0' }}>
                <AlertTriangle size={32} color="#e85454" />
              </View>
              <Text className="font-rounded text-lg font-bold text-foreground">確認刪除？</Text>
              <Text className="font-rounded text-sm text-muted-foreground text-center">
                刪除後無法復原，且若已有服務記錄使用此品項將無法刪除。
              </Text>
            </View>
            <View className="flex-row gap-3 mt-2">
              <Pressable
                className="flex-1 h-12 rounded-2xl border border-border items-center justify-center active:opacity-70"
                onPress={() => setShowDelete(false)}
              >
                <Text className="font-rounded text-sm font-semibold text-muted-foreground">取消</Text>
              </Pressable>
              <Pressable
                className="flex-1 h-12 rounded-2xl items-center justify-center active:opacity-80"
                style={{ backgroundColor: '#e85454' }}
                onPress={handleDelete}
              >
                <Text className="font-rounded text-sm font-semibold text-white">確認刪除</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Field({
  label, placeholder, value, onChangeText, keyboardType = 'default',
  prefix, suffix, hint,
}: {
  label: string; placeholder: string; value: string;
  onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'numeric';
  prefix?: string; suffix?: string; hint?: string;
}) {
  return (
    <View className="gap-1.5">
      <Text className="font-rounded text-sm font-medium text-foreground">{label}</Text>
      <View className="flex-row items-center bg-card border border-border rounded-2xl px-4" style={{ height: 52 }}>
        {prefix && <Text className="font-rounded text-base text-muted-foreground mr-2">{prefix}</Text>}
        <TextInput
          className="flex-1 font-rounded text-base text-foreground"
          placeholder={placeholder}
          placeholderTextColor="#c4a0ae"
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
        />
        {suffix && <Text className="font-rounded text-base text-muted-foreground ml-2">{suffix}</Text>}
      </View>
      {hint && <Text className="font-rounded text-xs text-muted-foreground">{hint}</Text>}
    </View>
  );
}
