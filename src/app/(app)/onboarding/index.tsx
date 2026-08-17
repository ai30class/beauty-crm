import { useState } from 'react';
import {
  View, Text, Pressable, TextInput, ActivityIndicator,
  ScrollView, KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Sparkles, CalendarDays, UserPlus, Ticket, TrendingUp, Link2, Store,
} from 'lucide-react-native';
import { markOnboardingCompleted, upsertShopProfile, DEFAULT_HOURS } from '@/db/api';

const TOTAL_PAGES = 4;

function Dots({ page }: { page: number }) {
  return (
    <View className="flex-row items-center justify-center gap-2 mb-6">
      {Array.from({ length: TOTAL_PAGES }, (_, i) => (
        <View
          key={i}
          className="rounded-full"
          style={{
            width: i === page ? 20 : 6,
            height: 6,
            backgroundColor: i === page ? '#e8789a' : '#f0d5dd',
          }}
        />
      ))}
    </View>
  );
}

function FeatureRow({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <View className="flex-row items-start gap-3 bg-card border border-border rounded-2xl p-4">
      <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">{icon}</View>
      <View className="flex-1">
        <Text className="font-rounded text-base font-semibold text-foreground">{title}</Text>
        <Text className="font-rounded text-sm text-muted-foreground mt-0.5">{desc}</Text>
      </View>
    </View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const [page, setPage] = useState(0);

  const [shopName, setShopName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const finish = async () => {
    try { await markOnboardingCompleted(); } finally { router.replace('/(app)/(tabs)/home' as any); }
  };

  const handleSkip = () => { finish(); };

  const handleNext = () => {
    if (page < TOTAL_PAGES - 1) { setPage(p => p + 1); return; }
    handleFinishSetup();
  };

  const handleFinishSetup = async () => {
    setError('');
    if (!shopName.trim()) { setError('請填寫商家名稱'); return; }
    setSaving(true);
    try {
      await upsertShopProfile({
        shop_name: shopName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        description: description.trim(),
        business_hours: DEFAULT_HOURS,
      });
      await finish();
    } catch (e: any) {
      setError(e.message ?? '儲存失敗，請重試');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />

      {/* 跳過按鈕 */}
      <View className="flex-row justify-end px-5 pt-14">
        <Pressable className="px-3 py-2 active:opacity-60" onPress={handleSkip}>
          <Text className="font-rounded text-sm text-muted-foreground">跳過</Text>
        </Pressable>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="flex-grow px-6 pb-6"
        contentInsetAdjustmentBehavior="automatic"
      >
        {page === 0 && (
          <View className="flex-1 items-center justify-center gap-5 py-10">
            <View className="w-20 h-20 rounded-full bg-primary/15 items-center justify-center">
              <Sparkles size={36} color="#e8789a" />
            </View>
            <Text className="font-rounded text-2xl font-bold text-foreground text-center">歡迎使用美業管家 🌸</Text>
            <Text className="font-rounded text-base text-muted-foreground text-center leading-6">
              一站式店務管理工具{'\n'}預約、顧客、財務，通通幫你管好
            </Text>
          </View>
        )}

        {page === 1 && (
          <View className="flex-1 justify-center gap-4 py-10">
            <Text className="font-rounded text-xl font-bold text-foreground text-center mb-2">日常核心操作</Text>
            <FeatureRow
              icon={<CalendarDays size={18} color="#e8789a" />}
              title="行事曆管理預約"
              desc="手動預約、線上預約統一在一個畫面查看與調整"
            />
            <FeatureRow
              icon={<UserPlus size={18} color="#e8789a" />}
              title="新增顧客與服務紀錄"
              desc="每次服務留下紀錄，累積顧客消費歷史"
            />
          </View>
        )}

        {page === 2 && (
          <View className="flex-1 justify-center gap-4 py-10">
            <Text className="font-rounded text-xl font-bold text-foreground text-center mb-2">進階經營功能</Text>
            <FeatureRow
              icon={<Ticket size={18} color="#e8789a" />}
              title="套票管理、優惠券發放"
              desc="次數卡、儲值卡、優惠券，留住熟客"
            />
            <FeatureRow
              icon={<TrendingUp size={18} color="#e8789a" />}
              title="月度財務報表"
              desc="收入、支出、員工業績一目了然"
            />
            <FeatureRow
              icon={<Link2 size={18} color="#e8789a" />}
              title="專屬線上預約連結"
              desc="分享給顧客，免登入即可線上預約"
            />
          </View>
        )}

        {page === 3 && (
          <View className="flex-1 justify-center gap-4 py-6">
            <View className="items-center gap-2 mb-2">
              <View className="w-14 h-14 rounded-full bg-primary/15 items-center justify-center">
                <Store size={26} color="#e8789a" />
              </View>
              <Text className="font-rounded text-xl font-bold text-foreground text-center">填寫商家基本資訊</Text>
              <Text className="font-rounded text-sm text-muted-foreground text-center">
                完成後會自動產生你的專屬線上預約連結
              </Text>
            </View>

            <View>
              <Text className="font-rounded text-xs text-muted-foreground mb-1">商家名稱 *</Text>
              <TextInput
                className="bg-card border border-border rounded-xl px-4 h-12 font-rounded text-base text-foreground"
                placeholder="請輸入商家名稱"
                placeholderTextColor="#c4a0ae"
                value={shopName}
                onChangeText={setShopName}
              />
            </View>
            <View>
              <Text className="font-rounded text-xs text-muted-foreground mb-1">聯絡電話</Text>
              <TextInput
                className="bg-card border border-border rounded-xl px-4 h-12 font-rounded text-base text-foreground"
                placeholder="02-xxxx-xxxx / 09xx-xxx-xxx"
                placeholderTextColor="#c4a0ae"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>
            <View>
              <Text className="font-rounded text-xs text-muted-foreground mb-1">店面地址</Text>
              <TextInput
                className="bg-card border border-border rounded-xl px-4 h-12 font-rounded text-base text-foreground"
                placeholder="例：台北市大安區忠孝東路四段 1 號"
                placeholderTextColor="#c4a0ae"
                value={address}
                onChangeText={setAddress}
              />
            </View>
            <View>
              <Text className="font-rounded text-xs text-muted-foreground mb-1">店家簡介</Text>
              <TextInput
                className="bg-card border border-border rounded-xl px-4 py-3 font-rounded text-base text-foreground"
                placeholder="簡短介紹你的店，顯示於線上預約頁面"
                placeholderTextColor="#c4a0ae"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                style={{ minHeight: 72 }}
              />
            </View>
            <Text className="font-rounded text-xs text-muted-foreground">
              營業時間先用預設值，之後可以在「商家資訊設定」調整
            </Text>
            {error ? <Text className="font-rounded text-xs text-destructive">{error}</Text> : null}
          </View>
        )}
      </ScrollView>

      <View className="px-6 pb-8 pt-2">
        <Dots page={page} />
        <Pressable
          className="bg-primary rounded-2xl items-center justify-center active:opacity-80"
          style={{ height: 56 }}
          onPress={handleNext}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text className="font-rounded text-base font-semibold text-white">
                {page < TOTAL_PAGES - 1 ? '下一步' : '開始使用'}
              </Text>
          }
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
