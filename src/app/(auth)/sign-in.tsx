import { useState } from 'react';
import {
  Text, TextInput, View, Pressable, KeyboardAvoidingView,
  ScrollView, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Heart, Mail, Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react-native';
import { supabase } from '@/client/supabase';
import { isFreshlyCreatedAuthUser, getAccountType } from '@/db/api';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';

// 必要：讓 OAuth 回呼可以關閉瀏覽器
WebBrowser.maybeCompleteAuthSession();

// 商家帳號審核機制：關掉自助註冊（原本這裡有登入/註冊切換頁籤，任何人填
// 表單就能直接變商家帳號），改成邀請制——想加入的人填 /join-request 申請表單，
// Emma 手動審核、手動建帳號。這個頁面現在只剩登入／忘記密碼，不再有 signUp。
type Mode = 'login' | 'forgot';

// 員工帳號登入後預設落在排班表（他們最常用、也是基本層權限就能用的畫面），
// 不是商家的顧客列表首頁；商家帳號行為不變。查不到帳號類型就當商家處理。
async function redirectAfterLogin(router: ReturnType<typeof useRouter>) {
  const type = await getAccountType().catch(() => 'merchant' as const);
  router.replace((type === 'staff' ? '/(app)/staff-schedule' : '/(app)/home') as any);
}

export default function SignIn() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!email.trim()) { setError('請輸入電子郵件'); return; }

    // 忘記密碼流程
    if (mode === 'forgot') {
      setLoading(true);
      try {
        // 一定要明確指定 redirectTo：沒帶的話 Supabase 會用專案後台的
        // Site URL 組信裡的連結，而那個值曾經一直是預設的 http://localhost:3000，
        // 導致所有重設密碼信/驗證信的連結點下去都是「無法連上這個網站」。
        // 帶著它就不必依賴那個藏在後台、程式碼裡看不到的設定。
        const redirectTo = typeof window !== 'undefined'
          ? `${window.location.origin}/auth/callback`
          : undefined;
        const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
        if (e) { setError(e.message); return; }
        setResetSent(true);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password.trim() || password.length < 6) { setError('密碼至少 6 位'); return; }

    setLoading(true);
    try {
      const { error: e } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (e) { setError(e.message); return; }
      await redirectAfterLogin(router);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setResetSent(false);
    setPassword('');
  };

  // Google OAuth 登入
  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const isWeb = process.env.EXPO_OS === 'web';
      const redirectUrl = isWeb
        ? `${window.location.origin}/auth/callback`
        : AuthSession.makeRedirectUri({ scheme: 'appd2yss59nidj5', path: 'auth/callback' });
      const { data, error: e } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });
      if (e || !data.url) {
        setError(e?.message ?? '無法取得 Google 登入連結');
        return;
      }
      if (isWeb) {
        // Web：整頁導向 Google 登入，避免 await 之後才開彈出視窗被瀏覽器的快顯封鎖擋下
        window.location.href = data.url;
        return;
      }
      // 原生 App：打開系統瀏覽器進行 Google 認證
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
      if (result.type === 'success' && result.url) {
        // 從回呼 URL 解析 session
        const url = new URL(result.url);
        const params = new URLSearchParams(url.hash.substring(1));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) {
            setError(sessionError.message);
            return;
          }
          // 商家後台關掉自助註冊了，Google 登入不能是「順便自動註冊」的後門——
          // 這個帳號如果是這次 OAuth 才剛自動建立的全新使用者，代表繞過了審核，
          // 立刻登出並導去申請表單，不放行進商家後台。
          if (await isFreshlyCreatedAuthUser()) {
            await supabase.auth.signOut();
            setError('目前商家帳號採邀請制，請先填寫申請表單，我們審核後會協助你開通帳號。');
            return;
          }
          await redirectAfterLogin(router);
        } else {
          setError('Google 登入失敗，請重試');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-8"
        keyboardShouldPersistTaps="handled"
        className="bg-background"
      >
        {/* Logo */}
        <View className="items-center mb-10">
          <View className="w-20 h-20 rounded-full bg-primary/20 items-center justify-center mb-4">
            <Heart size={36} color="#e8789a" />
          </View>
          <Text className="font-rounded text-2xl font-bold text-foreground">美業管家</Text>
          <Text className="font-rounded text-sm text-muted-foreground mt-1">
            {mode === 'login' ? '歡迎回來 🌸' : '重設密碼'}
          </Text>
        </View>

        {/* 忘記密碼 — 返回按鈕 */}
        {mode === 'forgot' && (
          <Pressable className="flex-row items-center mb-4 active:opacity-70" onPress={() => switchMode('login')}>
            <ArrowLeft size={16} color="#e8789a" />
            <Text className="font-rounded text-sm text-primary ml-1">返回登入</Text>
          </Pressable>
        )}

        {/* 重設密碼成功提示 */}
        {resetSent ? (
          <View className="bg-secondary/30 rounded-2xl p-5 items-center gap-3">
            <Text className="font-rounded text-2xl">📬</Text>
            <Text className="font-rounded text-base font-semibold text-foreground">重設連結已寄出</Text>
            <Text className="font-rounded text-sm text-muted-foreground text-center">
              請檢查您的信箱 {email.trim()}，點擊信中連結即可重設密碼。
            </Text>
            <Pressable className="mt-2 active:opacity-70" onPress={() => switchMode('login')}>
              <Text className="font-rounded text-sm text-primary font-semibold">返回登入</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Email 輸入 */}
            <View className="mb-4">
              <View className="flex-row items-center border border-border rounded-2xl px-4 bg-card" style={{ height: 56 }}>
                <Mail size={18} color="#e8789a" />
                <TextInput
                  className="flex-1 font-rounded text-base text-foreground ml-3"
                  placeholder="電子郵件"
                  placeholderTextColor="#c4a0ae"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* 密碼輸入（忘記密碼時隱藏） */}
            {mode !== 'forgot' && (
              <View className="mb-4">
                <View className="flex-row items-center border border-border rounded-2xl px-4 bg-card" style={{ height: 56 }}>
                  <Lock size={18} color="#e8789a" />
                  <TextInput
                    className="flex-1 font-rounded text-base text-foreground ml-3"
                    placeholder="密碼（至少 6 位）"
                    placeholderTextColor="#c4a0ae"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <Pressable className="p-1" onPress={() => setShowPassword(v => !v)}>
                    {showPassword
                      ? <EyeOff size={18} color="#c4a0ae" />
                      : <Eye size={18} color="#c4a0ae" />
                    }
                  </Pressable>
                </View>
                {/* 忘記密碼連結（僅登入頁顯示） */}
                {mode === 'login' && (
                  <Pressable className="mt-2 self-end active:opacity-70" onPress={() => switchMode('forgot')}>
                    <Text className="font-rounded text-sm text-primary">忘記密碼？</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* 錯誤提示 */}
            {error ? (
              <Text className="font-rounded text-destructive text-sm mb-3">{error}</Text>
            ) : (
              <View className="mb-3" />
            )}

            {/* 操作按鈕 */}
            <Pressable
              className="w-full bg-primary rounded-2xl items-center justify-center active:opacity-80"
              style={{ height: 56 }}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text className="font-rounded text-white text-base font-semibold">
                  {mode === 'login' ? '登入' : '發送重設連結'}
                </Text>
              }
            </Pressable>

            {/* 分隔線 */}
            {mode !== 'forgot' && (
              <>
                <View className="flex-row items-center my-5 gap-3">
                  <View className="flex-1 h-px bg-border" />
                  <Text className="font-rounded text-xs text-muted-foreground">或</Text>
                  <View className="flex-1 h-px bg-border" />
                </View>

                {/* Google 登入按鈕 */}
                <Pressable
                  className="w-full flex-row items-center justify-center border border-border rounded-2xl bg-card active:opacity-70 gap-3"
                  style={{ height: 56 }}
                  onPress={handleGoogleSignIn}
                  disabled={loading}
                >
                  {/* Google 圖示（SVG 色彩文字模擬） */}
                  <Text style={{ fontSize: 18 }}>G</Text>
                  <Text className="font-rounded text-sm font-semibold text-foreground">
                    使用 Google 帳號登入
                  </Text>
                </Pressable>

                {/* 商家帳號採邀請制，沒有帳號的人導去申請表單，不是自助註冊 */}
                <Pressable className="items-center py-4 active:opacity-70" onPress={() => router.push('/join-request' as any)}>
                  <Text className="font-rounded text-sm text-muted-foreground">
                    還沒有帳號？<Text className="text-primary font-semibold">填寫申請表單</Text>
                  </Text>
                </Pressable>
              </>
            )}
          </>
        )}

        <View className="h-8" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

