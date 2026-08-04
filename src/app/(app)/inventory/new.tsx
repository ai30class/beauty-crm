import { useState } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Package } from 'lucide-react-native';
import { createProduct } from '@/db/api';

export default function NewProductScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [spec, setSpec] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [stock, setStock] = useState('');
  const [safetyStock, setSafetyStock] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    setLoading(true);
    try {
      await createProduct({
        name: name.trim(),
        spec: spec.trim(),
        cost_price: cost,
        sell_price: sell,
        stock: stockNum,
        safety_stock: safetyNum,
      });
      router.back();
    } catch (e: any) {
      setError(e.message?.includes('unique') ? '此品名已存在，請使用其他名稱' : (e.message ?? '儲存失敗'));
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
        <Package size={18} color="#e8789a" style={{ marginRight: 8 }} />
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">新增保養品</Text>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-5 pb-12 gap-4" className="bg-background">
        <Field label="品名 *" placeholder="例：玫瑰精華液" value={name} onChangeText={setName} />
        <Field label="規格 / 容量" placeholder="例：50ml" value={spec} onChangeText={setSpec} />
        <Field label="進貨單價 *" placeholder="0" value={costPrice} onChangeText={setCostPrice} keyboardType="numeric" prefix="$" />
        <Field label="售價 *" placeholder="0" value={sellPrice} onChangeText={setSellPrice} keyboardType="numeric" prefix="$" />
        <Field label="現有庫存數量 *" placeholder="0" value={stock} onChangeText={setStock} keyboardType="numeric" suffix="件" />
        <Field label="安全庫存數量 *" placeholder="0" value={safetyStock} onChangeText={setSafetyStock} keyboardType="numeric" suffix="件"
          hint="低於此數量時顯示警示" />

        {error ? <Text className="font-rounded text-destructive text-sm">{error}</Text> : null}

        <Pressable
          className="bg-primary rounded-2xl items-center justify-center active:opacity-80 mt-2"
          style={{ height: 56 }}
          onPress={handleSave}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text className="font-rounded text-white text-base font-semibold">儲存品項</Text>}
        </Pressable>
      </ScrollView>
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
