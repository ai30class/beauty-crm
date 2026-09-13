import { useState } from 'react';
import {
  Text, TextInput, View, Pressable, KeyboardAvoidingView,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Heart, Store, User2, MessageCircle, ArrowLeft, CheckCircle2 } from 'lucide-react-native';
import { createSignupRequest } from '@/db/api';

// 商家帳號審核機制第一步的申請入口：商家後台已經關掉自助註冊（見
// (auth)/sign-in.tsx），這頁是唯一對外的申請管道。填完只是寫進
// signup_requests 名單，不會立刻建立帳號——Emma 看到申請後手動審核、
// 手動建帳號，再把登入方式回傳給申請人。公開路由，不需要登入。
export default function JoinRequestScreen() {
  const router = useRouter();
  const [shopName, setShopName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!shopName.trim()) { setError('請填寫店名'); return; }
    if (!contactName.trim()) { setError('請填寫聯絡人姓名'); return; }
    if (!contactInfo.trim()) { setError('請填寫聯絡方式'); return; }
    setLoading(true);
    try {
      await createSignupRequest({
        shop_name: shopName.trim(),
        contact_name: contactName.trim(),
        contact_info: contactInfo.trim(),
        message: message.trim() || null,
      });
      setDone(true);
    } catch (e: any) {
      setError(e.message ?? '送出失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-8 gap-4">
        <StatusBar style="dark" backgroundColor="#fff5f7" />
        <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center">
          <CheckCircle2 size={40} color="#e8789a" />
        </View>
        <Text className="font-rounded text-xl font-bold text-foreground text-center">申請已送出 🌸</Text>
        <Text className="font-rounded text-sm text-muted-foreground text-center leading-6">
          我們會盡快用你留的聯絡方式跟你聯繫，{'\n'}確認後幫你開通帳號。
        </Text>
        <Pressable
          className="border border-border rounded-2xl h-12 px-8 items-center justify-center mt-4 active:opacity-70"
          onPress={() => router.replace('/' as any)}
        >
          <Text className="font-rounded text-sm text-foreground font-semibold">回首頁</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <View className="flex-row items-center px-5 pt-14 pb-4 border-b border-border">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2" onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">申請加入</Text>
      </View>

      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="px-6 pb-12 pt-8" keyboardShouldPersistTaps="handled">
        <View className="items-center mb-8">
          <View className="w-16 h-16 rounded-full bg-primary/15 items-center justify-center mb-3">
            <Heart size={28} color="#e8789a" />
          </View>
          <Text className="font-rounded text-2xl font-bold text-foreground text-center">想開始用美業管家？</Text>
          <Text className="font-rounded text-sm text-muted-foreground text-center mt-2 leading-6">
            目前採邀請制，填寫基本資料，{'\n'}我們確認後會盡快跟你聯繫開通帳號
          </Text>
        </View>

        <View className="gap-4">
          <View>
            <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">店名 *</Text>
            <View className="flex-row items-center border border-border rounded-2xl px-4 bg-card" style={{ height: 52 }}>
              <Store size={16} color="#e8789a" />
              <TextInput
                className="flex-1 font-rounded text-base text-foreground ml-3"
                placeholder="你的店名"
                placeholderTextColor="#c4a0ae"
                value={shopName}
                onChangeText={setShopName}
              />
            </View>
          </View>

          <View>
            <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">聯絡人姓名 *</Text>
            <View className="flex-row items-center border border-border rounded-2xl px-4 bg-card" style={{ height: 52 }}>
              <User2 size={16} color="#e8789a" />
              <TextInput
                className="flex-1 font-rounded text-base text-foreground ml-3"
                placeholder="怎麼稱呼你"
                placeholderTextColor="#c4a0ae"
                value={contactName}
                onChangeText={setContactName}
              />
            </View>
          </View>

          <View>
            <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">聯絡方式 *</Text>
            <View className="flex-row items-center border border-border rounded-2xl px-4 bg-card" style={{ height: 52 }}>
              <MessageCircle size={16} color="#e8789a" />
              <TextInput
                className="flex-1 font-rounded text-base text-foreground ml-3"
                placeholder="LINE ID / Email / 手機，方便我們聯繫你的方式"
                placeholderTextColor="#c4a0ae"
                value={contactInfo}
                onChangeText={setContactInfo}
              />
            </View>
          </View>

          <View>
            <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">想跟我們說的話（選填）</Text>
            <TextInput
              className="border border-border rounded-2xl px-4 py-3 bg-card font-rounded text-base text-foreground"
              placeholder="例：目前用什麼方式管理預約、想解決什麼問題"
              placeholderTextColor="#c4a0ae"
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              style={{ minHeight: 80 }}
            />
          </View>

          {error ? <Text className="font-rounded text-xs text-destructive">{error}</Text> : null}

          <Pressable
            className="bg-primary rounded-2xl h-14 items-center justify-center active:opacity-80 mt-2"
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text className="font-rounded text-base text-white font-semibold">送出申請</Text>
            }
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
