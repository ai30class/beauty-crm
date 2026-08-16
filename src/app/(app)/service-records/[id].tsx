import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Share } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Share2, Scissors, DollarSign, CalendarDays, FileText, Package, User } from 'lucide-react-native';
import { getServiceRecordById, getPhotoUrl, getProductUsageByRecord } from '@/db/api';
import type { ServiceRecord, ProductUsage } from '@/types/types';

export default function ServiceRecordDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [record, setRecord] = useState<ServiceRecord | null>(null);
  const [usages, setUsages] = useState<ProductUsage[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      const [r, u] = await Promise.all([
        getServiceRecordById(id),
        getProductUsageByRecord(id),
      ]);
      setRecord(r);
      setUsages(u);
      setLoading(false);
    })();
  }, [id]));

  const beforeUrl = getPhotoUrl(record?.before_photo_path ?? null);
  const afterUrl = getPhotoUrl(record?.after_photo_path ?? null);
  const hasPhotos = !!(beforeUrl || afterUrl);

  const productTotal = usages.reduce((sum, u) => sum + Number(u.sell_amount ?? 0), 0);

  const handleShare = async () => {
    if (!record) return;
    const productLines = usages.length > 0
      ? '\n🧴 ' + usages.map(u => `${u.product?.name ?? '—'} ×${u.quantity} $${Number(u.sell_amount).toLocaleString()}`).join('、')
      : '';
    const text = `🌸 服務記錄\n👤 ${record.customer?.name ?? ''}\n✂️ ${record.service_name}\n💰 $${Number(record.amount).toLocaleString()}${productLines}\n📅 ${record.service_date}${record.notes ? '\n📝 ' + record.notes : ''}`;
    await Share.share({ message: text });
  };

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color="#e8789a" />
      </View>
    );
  }

  if (!record) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="font-rounded text-muted-foreground">找不到記錄</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2" onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">服務記錄詳情</Text>
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted" onPress={handleShare}>
          <Share2 size={20} color="#e8789a" />
        </Pressable>
      </View>

      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="px-5 pb-12 gap-4">
        {/* 顧客與服務資訊卡 */}
        <View className="bg-card rounded-2xl p-4 border border-border gap-3">
          <View className="flex-row items-center gap-2">
            <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center">
              <Scissors size={16} color="#e8789a" />
            </View>
            <View className="flex-1">
              <Text className="font-rounded text-xs text-muted-foreground">服務項目</Text>
              <Text className="font-rounded text-base font-semibold text-foreground">{record.service_name}</Text>
            </View>
          </View>
          <View className="flex-row items-center gap-2">
            <View className="w-8 h-8 rounded-full bg-green-100 items-center justify-center">
              <DollarSign size={16} color="#5dc0a0" />
            </View>
            <View className="flex-1">
              <Text className="font-rounded text-xs text-muted-foreground">金額</Text>
              <Text className="font-rounded text-base font-semibold text-foreground">${Number(record.amount).toLocaleString()}</Text>
            </View>
          </View>
          <View className="flex-row items-center gap-2">
            <View className="w-8 h-8 rounded-full bg-blue-100 items-center justify-center">
              <CalendarDays size={16} color="#8b9de8" />
            </View>
            <View className="flex-1">
              <Text className="font-rounded text-xs text-muted-foreground">服務日期</Text>
              <Text className="font-rounded text-base font-semibold text-foreground">{record.service_date}</Text>
            </View>
          </View>
          {record.staff ? (
            <View className="flex-row items-center gap-2">
              <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: record.staff.color + '22' }}>
                <User size={16} color={record.staff.color} />
              </View>
              <View className="flex-1">
                <Text className="font-rounded text-xs text-muted-foreground">服務人員</Text>
                <Text className="font-rounded text-base font-semibold text-foreground">{record.staff.name}</Text>
              </View>
            </View>
          ) : null}
          {record.notes ? (
            <View className="flex-row items-start gap-2">
              <View className="w-8 h-8 rounded-full bg-amber-50 items-center justify-center mt-0.5">
                <FileText size={16} color="#e8a87c" />
              </View>
              <View className="flex-1">
                <Text className="font-rounded text-xs text-muted-foreground">備註</Text>
                <Text className="font-rounded text-sm text-foreground">{record.notes}</Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* 保養品使用明細 */}
        {usages.length > 0 && (
          <View className="bg-card rounded-2xl p-4 border border-border gap-3">
            <View className="flex-row items-center gap-2 mb-1">
              <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: '#fce9f0' }}>
                <Package size={16} color="#e8789a" />
              </View>
              <Text className="font-rounded text-base font-semibold text-foreground">保養品使用明細</Text>
            </View>
            {usages.map((u, i) => (
              <View key={u.id} className={`flex-row items-center justify-between ${i > 0 ? 'border-t border-border pt-2' : ''}`}>
                <View className="flex-1">
                  <Text className="font-rounded text-sm font-semibold text-foreground">{u.product?.name ?? '—'}</Text>
                  {u.product?.spec ? (
                    <Text className="font-rounded text-xs text-muted-foreground">{u.product.spec}</Text>
                  ) : null}
                </View>
                <View className="items-end gap-0.5">
                  <Text className="font-rounded text-xs text-muted-foreground">×{u.quantity} 件</Text>
                  <Text className="font-rounded text-sm font-semibold" style={{ color: '#e8789a' }}>
                    ${Number(u.sell_amount ?? 0).toLocaleString()}
                  </Text>
                </View>
              </View>
            ))}
            <View className="border-t border-border pt-2 flex-row justify-between items-center">
              <Text className="font-rounded text-sm text-muted-foreground">保養品小計</Text>
              <Text className="font-rounded text-base font-bold" style={{ color: '#5dc0a0' }}>
                ${productTotal.toLocaleString()}
              </Text>
            </View>
          </View>
        )}

        {/* 施術前後照片對比 */}
        {hasPhotos && (
          <View className="bg-card rounded-2xl p-4 border border-border">
            <Text className="font-rounded text-base font-semibold text-foreground mb-3">施術前後對比</Text>
            <View className="flex-row gap-3">
              <PhotoCompare label="施術前" url={beforeUrl} />
              <PhotoCompare label="施術後" url={afterUrl} />
            </View>
          </View>
        )}

        {/* 分享按鈕 */}
        <Pressable
          className="flex-row items-center justify-center gap-2 border-2 rounded-2xl active:opacity-80"
          style={{ height: 52, borderColor: '#e8789a' }}
          onPress={handleShare}
        >
          <Share2 size={18} color="#e8789a" />
          <Text className="font-rounded text-base font-semibold text-primary">分享服務記錄</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function PhotoCompare({ label, url }: { label: string; url: string | null }) {
  return (
    <View className="flex-1">
      <Text className="font-rounded text-xs text-muted-foreground text-center mb-1.5">{label}</Text>
      {url ? (
        <View className="rounded-2xl overflow-hidden" style={{ aspectRatio: 1 }}>
          <Image source={{ uri: url }} style={{ flex: 1 }} contentFit="cover"
            placeholder={{ blurhash: 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.' }} transition={300} />
        </View>
      ) : (
        <View className="rounded-2xl bg-muted/50 items-center justify-center" style={{ aspectRatio: 1 }}>
          <Text className="font-rounded text-xs text-muted-foreground">未上傳</Text>
        </View>
      )}
    </View>
  );
}
