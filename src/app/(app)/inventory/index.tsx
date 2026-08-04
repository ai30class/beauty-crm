import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
  FlatList, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowLeft, Plus, Package, Search, AlertTriangle,
  XCircle, CheckCircle, ChevronRight, RefreshCcw, TrendingUp,
} from 'lucide-react-native';
import { getProducts } from '@/db/api';
import type { Product, StockStatus } from '@/types/types';

function getStockStatus(p: Product): StockStatus {
  if (p.stock === 0) return 'out';
  if (p.stock <= p.safety_stock) return 'warning';
  return 'normal';
}

const STATUS_CONFIG: Record<StockStatus, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  normal: {
    label: '正常',
    bg: '#e0f5ef',
    text: '#5dc0a0',
    icon: <CheckCircle size={12} color="#5dc0a0" />,
  },
  warning: {
    label: '警示',
    bg: '#fff8e0',
    text: '#d4a017',
    icon: <AlertTriangle size={12} color="#d4a017" />,
  },
  out: {
    label: '缺貨',
    bg: '#fce9f0',
    text: '#e85454',
    icon: <XCircle size={12} color="#e85454" />,
  },
};

function StatusBadge({ status }: { status: StockStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <View className="flex-row items-center gap-1 px-2 py-0.5 rounded-full" style={{ backgroundColor: cfg.bg }}>
      {cfg.icon}
      <Text className="font-rounded text-xs font-semibold" style={{ color: cfg.text }}>{cfg.label}</Text>
    </View>
  );
}

function ProductRow({ item, onPress, onRestock }: {
  item: Product;
  onPress: () => void;
  onRestock: () => void;
}) {
  const status = getStockStatus(item);
  return (
    <Pressable
      className="bg-card mx-5 mb-3 rounded-2xl border border-border active:opacity-80"
      style={{ shadowColor: '#e8789a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 1 }}
      onPress={onPress}
    >
      <View className="flex-row items-center p-4 gap-3">
        {/* 圖示 */}
        <View className="w-11 h-11 rounded-2xl items-center justify-center" style={{ backgroundColor: '#fce9f0' }}>
          <Package size={20} color="#e8789a" />
        </View>

        {/* 資訊 */}
        <View className="flex-1 gap-0.5">
          <Text className="font-rounded text-base font-semibold text-foreground" numberOfLines={1}>{item.name}</Text>
          <Text className="font-rounded text-xs text-muted-foreground">{item.spec || '—'}</Text>
          <View className="flex-row items-center gap-2 mt-1">
            <StatusBadge status={status} />
            <Text className="font-rounded text-xs text-muted-foreground">
              庫存 <Text className="font-bold text-foreground">{item.stock}</Text>
              {item.safety_stock > 0 && ` / 安全 ${item.safety_stock}`}
            </Text>
          </View>
        </View>

        {/* 補貨 + 箭頭 */}
        <View className="flex-row items-center gap-2">
          <Pressable
            className="flex-row items-center gap-1 px-3 py-1.5 rounded-xl active:opacity-70"
            style={{ backgroundColor: '#e8f0ff' }}
            onPress={onRestock}
          >
            <RefreshCcw size={12} color="#4a6cf7" />
            <Text className="font-rounded text-xs font-semibold" style={{ color: '#4a6cf7' }}>補貨</Text>
          </Pressable>
          <ChevronRight size={16} color="#c4a0ae" />
        </View>
      </View>
    </Pressable>
  );
}

export default function InventoryScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await getProducts();
        setProducts(data);
      } finally {
        setLoading(false);
      }
    })();
  }, []));

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.spec.toLowerCase().includes(search.toLowerCase())
  );

  // 排序：缺貨 → 警示 → 正常
  const sorted = [...filtered].sort((a, b) => {
    const order: Record<StockStatus, number> = { out: 0, warning: 1, normal: 2 };
    return order[getStockStatus(a)] - order[getStockStatus(b)];
  });

  const warningCount = products.filter(p => getStockStatus(p) !== 'normal').length;

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />

      {/* Header */}
      <View className="flex-row items-center px-5 pt-14 pb-3 bg-background">
        <Pressable
          className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2"
          onPress={() => router.back()}
        >
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Package size={20} color="#e8789a" style={{ marginRight: 8 }} />
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">保養品庫存</Text>
        <Pressable
          className="w-9 h-9 items-center justify-center rounded-full active:opacity-70 mr-1"
          style={{ backgroundColor: '#eef0ff' }}
          onPress={() => router.push('/(app)/inventory/report' as any)}
        >
          <TrendingUp size={18} color="#4a6cf7" />
        </Pressable>
        <Pressable
          className="w-9 h-9 items-center justify-center rounded-full bg-primary/10 active:opacity-70"
          onPress={() => router.push('/(app)/inventory/new' as any)}
        >
          <Plus size={20} color="#e8789a" />
        </Pressable>
      </View>

      {/* 警示摘要 */}
      {warningCount > 0 && (
        <View className="mx-5 mb-3 px-4 py-3 rounded-2xl flex-row items-center gap-2" style={{ backgroundColor: '#fff8e0' }}>
          <AlertTriangle size={16} color="#d4a017" />
          <Text className="font-rounded text-sm font-semibold" style={{ color: '#d4a017' }}>
            {warningCount} 個品項庫存偏低，請盡快補貨
          </Text>
        </View>
      )}

      {/* 搜尋框 */}
      <View className="mx-5 mb-4 flex-row items-center bg-card border border-border rounded-2xl px-4 gap-2" style={{ height: 46 }}>
        <Search size={16} color="#c4a0ae" />
        <TextInput
          className="flex-1 font-rounded text-sm text-foreground"
          placeholder="搜尋品名或規格..."
          placeholderTextColor="#c4a0ae"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')}>
            <XCircle size={16} color="#c4a0ae" />
          </Pressable>
        )}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#e8789a" />
        </View>
      ) : sorted.length === 0 ? (
        <ScrollView contentContainerClassName="flex-grow items-center justify-center px-8 gap-4">
          <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center">
            <Package size={38} color="#e8789a" />
          </View>
          <Text className="font-rounded text-base font-semibold text-muted-foreground text-center">
            {search ? '找不到符合的品項' : '尚未登記任何保養品'}
          </Text>
          {!search && (
            <Pressable
              className="bg-primary rounded-2xl px-6 py-3 active:opacity-80"
              onPress={() => router.push('/(app)/inventory/new' as any)}
            >
              <Text className="font-rounded text-white text-sm font-semibold">新增第一個品項</Text>
            </Pressable>
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={i => i.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerClassName="pt-1 pb-10"
          renderItem={({ item }) => (
            <ProductRow
              item={item}
              onPress={() => router.push(`/(app)/inventory/${item.id}` as any)}
              onRestock={() => router.push(`/(app)/inventory/restock?productId=${item.id}` as any)}
            />
          )}
        />
      )}
    </View>
  );
}
