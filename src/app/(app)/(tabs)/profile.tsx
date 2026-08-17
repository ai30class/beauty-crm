import { View, Text, Pressable, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/client/supabase';
import { useRouter } from 'expo-router';
import { useSession } from '@/ctx';
import { User, Mail, LogOut, ChevronRight, Scissors, Users2, CalendarOff, ShoppingBag, Users, TrendingDown, Package, Store, Cake, Trophy, BarChart2, Tag, TrendingUp, UserX } from 'lucide-react-native';

export default function ProfileTab() {
  const router = useRouter();
  const { session } = useSession();
  const email = session?.user?.email ?? '—';

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/');
  };

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-24">
        <View className="px-5 pt-14 pb-4">
          <Text className="font-rounded text-2xl font-bold text-foreground">個人中心</Text>
        </View>

        {/* 頭像卡片 */}
        <View className="mx-5 bg-card rounded-2xl p-5 mb-5 items-center border border-border"
          style={{ shadowColor: '#e8789a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2 }}>
          <View className="w-20 h-20 rounded-full bg-primary/20 items-center justify-center mb-3">
            <User size={36} color="#e8789a" />
          </View>
          <Text className="font-rounded text-lg font-bold text-foreground mb-1">我的帳號</Text>
          <View className="flex-row items-center gap-1">
            <Mail size={13} color="#c4a0ae" />
            <Text className="font-rounded text-sm text-muted-foreground">{email}</Text>
          </View>
        </View>

        {/* 線上預約管理 */}
        <View className="mx-5 mb-4 bg-card rounded-2xl overflow-hidden border border-border">
          <Text className="font-rounded text-xs font-semibold text-muted-foreground px-5 pt-4 pb-2">線上預約系統</Text>
          <Pressable
            className="flex-row items-center px-5 py-4 border-t border-border active:bg-muted"
            onPress={() => router.push('/(app)/online-orders' as any)}
          >
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#e8f0ff' }}>
              <ShoppingBag size={16} color="#4a6cf7" />
            </View>
            <View className="flex-1">
              <Text className="font-rounded text-base text-foreground">線上預約訂單</Text>
              <Text className="font-rounded text-xs text-muted-foreground mt-0.5">查看顧客線上預約與訂金狀態</Text>
            </View>
            <ChevronRight size={16} color="#c4a0ae" />
          </Pressable>
          <Pressable
            className="flex-row items-center px-5 py-4 border-t border-border active:bg-muted"
            onPress={() => router.push('/(app)/staff-management' as any)}
          >
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#f0e8ff' }}>
              <Users2 size={16} color="#9b59b6" />
            </View>
            <View className="flex-1">
              <Text className="font-rounded text-base text-foreground">服務人員管理</Text>
              <Text className="font-rounded text-xs text-muted-foreground mt-0.5">新增人員、設定顏色標籤</Text>
            </View>
            <ChevronRight size={16} color="#c4a0ae" />
          </Pressable>
          <Pressable
            className="flex-row items-center px-5 py-4 border-t border-border active:bg-muted"
            onPress={() => router.push('/(app)/holidays' as any)}
          >
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#fff0e8' }}>
              <CalendarOff size={16} color="#e8783a" />
            </View>
            <View className="flex-1">
              <Text className="font-rounded text-base text-foreground">公休日管理</Text>
              <Text className="font-rounded text-xs text-muted-foreground mt-0.5">設定公休日，自動封鎖預約</Text>
            </View>
            <ChevronRight size={16} color="#c4a0ae" />
          </Pressable>
          {/* 設計師排班表 */}
          <Pressable
            className="flex-row items-center px-5 py-4 border-t border-border active:bg-muted"
            onPress={() => router.push('/(app)/staff-schedule' as any)}
          >
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#fce9f0' }}>
              <Users size={16} color="#e8789a" />
            </View>
            <View className="flex-1">
              <Text className="font-rounded text-base text-foreground">設計師排班表</Text>
              <Text className="font-rounded text-xs text-muted-foreground mt-0.5">今日及未來預約一覽，供設計師參考</Text>
            </View>
            <ChevronRight size={16} color="#c4a0ae" />
          </Pressable>
        </View>

        {/* 數據分析 */}
        <View className="mx-5 mb-4 bg-card rounded-2xl overflow-hidden border border-border">
          <Text className="font-rounded text-xs font-semibold text-muted-foreground px-5 pt-4 pb-2">數據分析</Text>
          <Pressable
            className="flex-row items-center px-5 py-4 border-t border-border active:bg-muted"
            onPress={() => router.push('/(app)/analytics/birthdays' as any)}
          >
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#fce9f0' }}>
              <Cake size={16} color="#e8789a" />
            </View>
            <View className="flex-1">
              <Text className="font-rounded text-base text-foreground">生日壽星提醒</Text>
              <Text className="font-rounded text-xs text-muted-foreground mt-0.5">查看本月 / 下月生日顧客清單</Text>
            </View>
            <ChevronRight size={16} color="#c4a0ae" />
          </Pressable>
          <Pressable
            className="flex-row items-center px-5 py-4 border-t border-border active:bg-muted"
            onPress={() => router.push('/(app)/analytics/customer-ranking' as any)}
          >
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#fff8e0' }}>
              <Trophy size={16} color="#d4a017" />
            </View>
            <View className="flex-1">
              <Text className="font-rounded text-base text-foreground">顧客消費排行</Text>
              <Text className="font-rounded text-xs text-muted-foreground mt-0.5">累計消費 Top 20，識別 VIP 顧客</Text>
            </View>
            <ChevronRight size={16} color="#c4a0ae" />
          </Pressable>
          <Pressable
            className="flex-row items-center px-5 py-4 border-t border-border active:bg-muted"
            onPress={() => router.push('/(app)/analytics/staff-performance' as any)}
          >
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#f0e8ff' }}>
              <BarChart2 size={16} color="#9b59b6" />
            </View>
            <View className="flex-1">
              <Text className="font-rounded text-base text-foreground">服務人員業績</Text>
              <Text className="font-rounded text-xs text-muted-foreground mt-0.5">月度服務次數與收入統計</Text>
            </View>
            <ChevronRight size={16} color="#c4a0ae" />
          </Pressable>
          <Pressable
            className="flex-row items-center px-5 py-4 border-t border-border active:bg-muted"
            onPress={() => router.push('/(app)/inventory/report' as any)}
          >
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#e8f5ef' }}>
              <TrendingUp size={16} color="#5dc0a0" />
            </View>
            <View className="flex-1">
              <Text className="font-rounded text-base text-foreground">保養品銷售報表</Text>
              <Text className="font-rounded text-xs text-muted-foreground mt-0.5">銷售毛利、進貨成本損益分析</Text>
            </View>
            <ChevronRight size={16} color="#c4a0ae" />
          </Pressable>
          <Pressable
            className="flex-row items-center px-5 py-4 border-t border-border active:bg-muted"
            onPress={() => router.push('/(app)/analytics/dormant-customers' as any)}
          >
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#fce9f0' }}>
              <UserX size={16} color="#e8789a" />
            </View>
            <View className="flex-1">
              <Text className="font-rounded text-base text-foreground">久未到店提醒</Text>
              <Text className="font-rounded text-xs text-muted-foreground mt-0.5">找出超過一段時間沒來的顧客名單</Text>
            </View>
            <ChevronRight size={16} color="#c4a0ae" />
          </Pressable>
        </View>

        {/* 優惠券 */}
        <View className="mx-5 mb-4 bg-card rounded-2xl overflow-hidden border border-border">
          <Text className="font-rounded text-xs font-semibold text-muted-foreground px-5 pt-4 pb-2">優惠券</Text>
          <Pressable
            className="flex-row items-center px-5 py-4 border-t border-border active:bg-muted"
            onPress={() => router.push('/(app)/coupons' as any)}
          >
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#fce9f0' }}>
              <Tag size={16} color="#e8789a" />
            </View>
            <View className="flex-1">
              <Text className="font-rounded text-base text-foreground">優惠券管理</Text>
              <Text className="font-rounded text-xs text-muted-foreground mt-0.5">建立、發放、核銷折扣優惠券</Text>
            </View>
            <ChevronRight size={16} color="#c4a0ae" />
          </Pressable>
        </View>

        {/* 業務設定 */}
        <View className="mx-5 mb-4 bg-card rounded-2xl overflow-hidden border border-border">
          <Text className="font-rounded text-xs font-semibold text-muted-foreground px-5 pt-4 pb-2">業務設定</Text>
          {/* 商家資訊 */}
          <Pressable
            className="flex-row items-center px-5 py-4 border-t border-border active:bg-muted"
            onPress={() => router.push('/(app)/shop-settings' as any)}
          >
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#fce9f0' }}>
              <Store size={16} color="#e8789a" />
            </View>
            <View className="flex-1">
              <Text className="font-rounded text-base text-foreground">商家資訊 & 營業時間</Text>
              <Text className="font-rounded text-xs text-muted-foreground mt-0.5">設定店名、地址、每日營業時段</Text>
            </View>
            <ChevronRight size={16} color="#c4a0ae" />
          </Pressable>
          <Pressable
            className="flex-row items-center px-5 py-4 border-t border-border active:bg-muted"
            onPress={() => router.push('/(app)/service-templates' as any)}
          >
            <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center mr-3">
              <Scissors size={16} color="#e8789a" />
            </View>
            <View className="flex-1">
              <Text className="font-rounded text-base text-foreground">服務項目管理</Text>
              <Text className="font-rounded text-xs text-muted-foreground mt-0.5">設定預設服務項目、時間與金額</Text>
            </View>
            <ChevronRight size={16} color="#c4a0ae" />
          </Pressable>
          <Pressable
            className="flex-row items-center px-5 py-4 border-t border-border active:bg-muted"
            onPress={() => router.push('/(app)/inventory' as any)}
          >
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#fce9f0' }}>
              <Package size={16} color="#e8789a" />
            </View>
            <View className="flex-1">
              <Text className="font-rounded text-base text-foreground">保養品庫存管理</Text>
              <Text className="font-rounded text-xs text-muted-foreground mt-0.5">登記品項、補貨、銷售自動扣庫</Text>
            </View>
            <ChevronRight size={16} color="#c4a0ae" />
          </Pressable>
          <Pressable
            className="flex-row items-center px-5 py-4 border-t border-border active:bg-muted"
            onPress={() => router.push('/(app)/expenses/new' as any)}
          >
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#fce9f0' }}>
              <TrendingDown size={16} color="#e8789a" />
            </View>
            <View className="flex-1">
              <Text className="font-rounded text-base text-foreground">記錄支出</Text>
              <Text className="font-rounded text-xs text-muted-foreground mt-0.5">新增店家日常支出，自動計入報表</Text>
            </View>
            <ChevronRight size={16} color="#c4a0ae" />
          </Pressable>
        </View>

        {/* 帳號選單 */}
        <View className="mx-5 bg-card rounded-2xl overflow-hidden border border-border">
          <Text className="font-rounded text-xs font-semibold text-muted-foreground px-5 pt-4 pb-2">帳號</Text>
          <Pressable
            className="flex-row items-center px-5 py-4 border-t border-border active:bg-muted"
            onPress={handleLogout}
          >
            <View className="w-8 h-8 rounded-full bg-destructive/10 items-center justify-center mr-3">
              <LogOut size={16} color="#e85454" />
            </View>
            <Text className="font-rounded text-base text-destructive flex-1">登出帳號</Text>
            <ChevronRight size={16} color="#c4a0ae" />
          </Pressable>
        </View>

        <Text className="font-rounded text-xs text-muted-foreground text-center mt-8">
          美業管家 v1.0 🌸
        </Text>
      </ScrollView>
    </View>
  );
}
