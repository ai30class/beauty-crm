import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Eye, EyeOff, Lock, Mail, MessageCircle } from 'lucide-react-native';
import { useState } from 'react';
import {ActivityIndicator,
  KeyboardAvoidingView, Pressable, ScrollView,Text, TextInput, 
  View, 
} from 'react-native';
import { supabase } from '@/client/supabase';

export default function CustomerAuthScreen() {
  const router = useRouter();
  const { ownerId } = useLocalSearchParams<{ ownerId?: string }>();

  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Channel ID 不是密鑰（等同 Google OAuth 的 client_id），可以直接寫在前端
  const LINE_LOGIN_CHANNEL_ID = '2011350553';

  const handleLineLogin = () => {
    // state 只用來夾帶 ownerId 過去，不依賴 sessionStorage 之類的暫存比對——
    // LINE 常會把整個授權流程交給 LINE App 自己的瀏覽器處理，跳回來時
    // 已經不是原本這個分頁了，暫存的東西會讀不到（見 line-callback.tsx 的說明）
    const state = btoa(JSON.stringify({ o: ownerId ?? '' }));
    const redirectUri = `${window.location.origin}/online-booking/line-callback`;
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: LINE_LOGIN_CHANNEL_ID,
      redirect_uri: redirectUri,
      state,
      scope: 'openid profile',
      // LINE Login 頻道已連動官方帳號時，順便請顧客加好友，這樣登入時拿到的
      // userId 才能直接拿去發 Messaging API 推播，不用另外再串一次加好友流程
      bot_prompt: 'normal',
    });
    window.location.href = `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`;
  };

  const handleAuth = async () => {
    setError('');
    if (!email.trim() || !password) { setError('請填寫 Email 與密碼'); return; }
    if (isSignUp && !agreed) { setError('請先同意服務條款與隱私政策'); return; }
    if (isSignUp && password.length < 6) { setError('密碼至少 6 個字元'); return; }
    setLoading(true);
    try {
      if (isSignUp) {
        const { error: e } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { account_type: 'customer' } },
        });
        if (e) throw e;
        setShowVerify(true);
      } else {
        const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (e) throw e;
        router.replace(`/online-booking?ownerId=${ownerId ?? ''}` as any);
      }
    } catch (e: any) {
      setError(e.message ?? '操作失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-background"
    >
      <StatusBar style="dark" backgroundColor="#fff5f7" />

      {/* Header */}
      <View className="flex-row items-center px-5 pt-14 pb-4 border-b border-border">
        <Pressable
          className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2"
          onPress={() => router.back()}
        >
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">
          {showVerify ? '驗證信已寄出' : isSignUp ? '顧客註冊' : '顧客登入'}
        </Text>
      </View>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="px-6 pb-12 pt-8"
        keyboardShouldPersistTaps="handled"
      >
        {showVerify ? (
          <View className="gap-4 items-center pt-8">
            <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center mb-2">
              <Mail size={36} color="#e8789a" />
            </View>
            <Text className="font-rounded text-2xl font-bold text-foreground text-center">驗證信已寄出 📬</Text>
            <Text className="font-rounded text-sm text-muted-foreground text-center leading-6">
              請至 <Text className="text-primary font-semibold">{email}</Text> 信箱點擊驗證連結{'\n'}
              驗證完成後請回此頁重新登入
            </Text>
            <Pressable
              className="border border-border rounded-2xl h-12 px-8 items-center justify-center mt-4 active:opacity-70"
              onPress={() => { setShowVerify(false); setIsSignUp(false); }}
            >
              <Text className="font-rounded text-sm text-foreground font-semibold">回到登入</Text>
            </Pressable>
          </View>
        ) : (
          <View className="gap-4">
            <Text className="font-rounded text-2xl font-bold text-foreground text-center mb-2">
              {isSignUp ? '建立顧客帳號 🌸' : '歡迎回來 🌸'}
            </Text>
            <Text className="font-rounded text-sm text-muted-foreground text-center mb-4">
              {isSignUp ? '註冊後即可預約及查看歷史記錄' : '登入後即可開始預約服務'}
            </Text>

            {/* LINE 一鍵登入 */}
            <Pressable
              className="rounded-2xl h-14 items-center justify-center active:opacity-80 flex-row gap-2"
              style={{ backgroundColor: '#06C755' }}
              onPress={handleLineLogin}
            >
              <MessageCircle size={18} color="#fff" />
              <Text className="font-rounded text-base text-white font-semibold">用 LINE 一鍵登入</Text>
            </Pressable>

            <View className="flex-row items-center gap-3 my-1">
              <View className="flex-1 h-px bg-border" />
              <Text className="font-rounded text-xs text-muted-foreground">或使用 Email</Text>
              <View className="flex-1 h-px bg-border" />
            </View>

            {/* Email */}
            <View className="bg-card border border-border rounded-2xl px-4 py-1 flex-row items-center gap-2">
              <Mail size={16} color="#c4a0ae" />
              <TextInput
                className="flex-1 font-rounded text-base text-foreground py-3"
                placeholder="your@email.com"
                placeholderTextColor="#c4a0ae"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                returnKeyType="next"
              />
            </View>

            {/* 密碼 */}
            <View className="bg-card border border-border rounded-2xl px-4 py-1 flex-row items-center gap-2">
              <Lock size={16} color="#c4a0ae" />
              <TextInput
                className="flex-1 font-rounded text-base text-foreground py-3"
                placeholder={isSignUp ? '設定密碼（至少 6 個字元）' : '輸入密碼'}
                placeholderTextColor="#c4a0ae"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPw}
                returnKeyType="done"
                onSubmitEditing={handleAuth}
              />
              <Pressable onPress={() => setShowPw(!showPw)} className="active:opacity-70">
                {showPw ? <EyeOff size={16} color="#c4a0ae" /> : <Eye size={16} color="#c4a0ae" />}
              </Pressable>
            </View>

            {/* 同意條款（僅註冊顯示） */}
            {isSignUp && (
              <Pressable className="flex-row items-start gap-3 active:opacity-70" onPress={() => setAgreed(!agreed)}>
                <View
                  className="w-5 h-5 rounded-md border-2 mt-0.5 items-center justify-center"
                  style={{ borderColor: agreed ? '#e8789a' : '#d0b0be', backgroundColor: agreed ? '#e8789a' : 'transparent' }}
                >
                  {agreed && <Text className="text-white text-xs font-bold">✓</Text>}
                </View>
                <Text className="font-rounded text-xs text-muted-foreground flex-1">
                  我已閱讀並同意{' '}
                  <Text
                    className="text-primary"
                    onPress={() => router.push('/online-booking/terms' as any)}
                  >服務條款</Text>{' '}與{' '}
                  <Text
                    className="text-primary"
                    onPress={() => router.push('/online-booking/privacy-policy' as any)}
                  >隱私政策</Text>
                </Text>
              </Pressable>
            )}

            {error ? <Text className="font-rounded text-xs text-destructive">{error}</Text> : null}

            <Pressable
              className="bg-primary rounded-2xl h-14 items-center justify-center active:opacity-80 mt-1"
              onPress={handleAuth}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text className="font-rounded text-base text-white font-semibold">
                    {isSignUp ? '註冊帳號' : '登入'}
                  </Text>
              }
            </Pressable>

            <Pressable
              className="items-center py-2 active:opacity-70"
              onPress={() => { setIsSignUp(!isSignUp); setError(''); setAgreed(false); }}
            >
              <Text className="font-rounded text-sm text-primary">
                {isSignUp ? '已有帳號？點此登入' : '還沒帳號？點此註冊'}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
