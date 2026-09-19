import { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/client/supabase';
import { useRouter } from 'expo-router';
import { useSession } from '@/ctx';
import { getMyStaffPermissions } from '@/db/api';
import { User, Mail, LogOut, ChevronRight, Scissors, Users2, CalendarOff, ShoppingBag, Users, TrendingDown, Package, Store, Cake, Trophy, BarChart2, Tag, TrendingUp, UserX, ListPlus, Wallet } from 'lucide-react-native';

export default function ProfileTab() {
  const router = useRouter();
  const { session } = useSession();
  const email = session?.user?.email ?? '—';
  // 員工版畫面依三層權限設計精簡（見開發部署筆記七十七節、九十二節）：
  // 基本層（排班表）一律顯示；開關層（瀏覽顧客／服務定價／店家設定）商家開了才顯示；
  // 其餘（財務、員工管理、線上預約訂單、候補、庫存、優惠券…）永遠只給商家。
  // 權限載入完成前不畫選單，避免員工短暫看到商家才有的項目。
  const [perms, setPerms] = useState<Awaited<ReturnType<typeof getMyStaffPermissions>> | null>(null);
  useEffect(() => {
    getMyStaffPermissions()
      .then(setPerms)
      // 查不到就當最嚴格的員工，不能反過來當商家
      .catch(() => setPerms({ isStaff: true, canViewCustomers: false, canManagePricing: false, canManageOwnTimeOff: false }));
  }, []);
  const isStaff = perms?.isStaff ?? true;
  // 員工只能管理「自己的」休假與封鎖時段（商家開了開關才顯示）；整家店的營業時間／店休永遠只有商家
  const showHolidays = !isStaff || !!perms?.canManageOwnTimeOff;
  const showPricing = !isStaff || !!perms?.canManagePricing;
  const showCustomerAnalytics = !isStaff || !!perms?.canViewCustomers;

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

        {!perms ? (
          <View className="py-10 items-center"><ActivityIndicator color="#e8789a" /></View>
        ) : (<>
        {/* 線上預約管理 */}
        <View className="mx-5 mb-4 bg-card rounded-2xl overflow-hidden border border-border">
          <Text className="font-rounded text-xs font-semibold text-muted-foreground px-5 pt-4 pb-2">{isStaff ? '排班與預約' : '線上預約系統'}</Text>
          {!isStaff && <Pressable
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
          </Pressable>}
          {!isStaff && (
          <Pressable
            className="flex-row items-center px-5 py-4 border-t border-border active:bg-muted"
            onPress={() => router.push('/(app)/waitlist' as any)}
          >
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#fff8e0' }}>
              <ListPlus size={16} color="#c99a1f" />
            </View>
            <View className="flex-1">
              <Text className="font-rounded text-base text-foreground">候補名單</Text>
              <Text className="font-rounded text-xs text-muted-foreground mt-0.5">時段已滿時登記候補的顧客</Text>
            </View>
            <ChevronRight size={16} color="#c4a0ae" />
          </Pressable>
          )}
          {!isStaff && (
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
          )}
          {showHolidays && (
          <Pressable
            className="flex-row items-center px-5 py-4 border-t border-border active:bg-muted"
            onPress={() => router.push('/(app)/holidays' as any)}
          >
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#fff0e8' }}>
              <CalendarOff size={16} color="#e8783a" />
            </View>
            <View className="flex-1">
              <Text className="font-rounded text-base text-foreground">{isStaff ? '我的休假與封鎖時段' : '公休日管理'}</Text>
              <Text className="font-rounded text-xs text-muted-foreground mt-0.5">{isStaff ? '設定自己的休假日與不接客的時段' : '設定公休日，自動封鎖預約'}</Text>
            </View>
            <ChevronRight size={16} color="#c4a0ae" />
          </Pressable>
          )}
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
          {/* 員工唯讀看自己的業績（次數與收入；商家有自己的「服務人員業績」） */}
          {isStaff && (
          <Pressable
            className="flex-row items-center px-5 py-4 border-t border-border active:bg-muted"
            onPress={() => router.push('/(app)/analytics/my-performance' as any)}
          >
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#f0e8ff' }}>
              <BarChart2 size={16} color="#9b59b6" />
            </View>
            <View className="flex-1">
              <Text className="font-rounded text-base text-foreground">我的業績</Text>
              <Text className="font-rounded text-xs text-muted-foreground mt-0.5">每月服務次數與收入（只有自己看得到）</Text>
            </View>
            <ChevronRight size={16} color="#c4a0ae" />
          </Pressable>
          )}
          {isStaff && (
          <Pressable
            className="flex-row items-center px-5 py-4 border-t border-border active:bg-muted"
            onPress={() => router.push('/(app)/analytics/my-payroll' as any)}
          >
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#fef3e2' }}>
              <Wallet size={16} color="#e8a87c" />
            </View>
            <View className="flex-1">
              <Text className="font-rounded text-base text-foreground">我的抽成與月薪</Text>
              <Text className="font-rounded text-xs text-muted-foreground mt-0.5">抽成、底薪、獎金與月薪（只有自己看得到）</Text>
            </View>
            <ChevronRight size={16} color="#c4a0ae" />
          </Pressable>
          )}
        </View>

        {/* 數據分析 */}
        {showCustomerAnalytics && <View className="mx-5 mb-4 bg-card rounded-2xl overflow-hidden border border-border">
          <Text className="font-rounded text-xs font-semibold text-muted-foreground px-5 pt-4 pb-2">數據分析</Text>
          {showCustomerAnalytics && (
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
          )}
          {!isStaff && (
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
          )}
          {!isStaff && (
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
          )}
          {!isStaff && (
          <Pressable
            className="flex-row items-center px-5 py-4 border-t border-border active:bg-muted"
            onPress={() => router.push('/(app)/analytics/payroll' as any)}
          >
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#fef3e2' }}>
              <Wallet size={16} color="#e8a87c" />
            </View>
            <View className="flex-1">
              <Text className="font-rounded text-base text-foreground">月薪計算</Text>
              <Text className="font-rounded text-xs text-muted-foreground mt-0.5">階梯抽成、底薪、獎金自動試算與鎖定</Text>
            </View>
            <ChevronRight size={16} color="#c4a0ae" />
          </Pressable>
          )}
          {!isStaff && (
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
          )}
          {showCustomerAnalytics && (
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
          )}
        </View>}

        {/* 優惠券 */}
        {!isStaff && <View className="mx-5 mb-4 bg-card rounded-2xl overflow-hidden border border-border">
          <Text className="font-rounded text-xs font-semibold text-muted-foreground px-5 pt-4 pb-2">優惠券</Text>
          {!isStaff && (
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
          )}
        </View>}

        {/* 業務設定 */}
        {(showPricing || !isStaff) && <View className="mx-5 mb-4 bg-card rounded-2xl overflow-hidden border border-border">
          <Text className="font-rounded text-xs font-semibold text-muted-foreground px-5 pt-4 pb-2">業務設定</Text>
          {/* 商家資訊 */}
          {!isStaff && (
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
          )}
          {showPricing && (
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
          )}
          {!isStaff && (
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
          )}
          {!isStaff && (
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
          )}
        </View>}

        </>)}

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
