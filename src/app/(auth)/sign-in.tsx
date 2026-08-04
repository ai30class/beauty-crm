import { useState } from 'react';
import {
  Text, TextInput, View, Pressable, KeyboardAvoidingView,
  ScrollView, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Heart, Mail, Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react-native';
import { supabase } from '@/client/supabase';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';

// 必要：讓 OAuth 回呼可以關閉瀏覽器
WebBrowser.maybeCompleteAuthSession();

type Mode = 'login' | 'register' | 'forgot';

export default function SignIn() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!email.trim()) { setError('請輸入電子郵件'); return; }

    // 忘記密碼流程
    if (mode === 'forgot') {
      setLoading(true);
      try {
        const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim());
        if (e) { setError(e.message); return; }
        setResetSent(true);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password.trim() || password.length < 6) { setError('密碼至少 6 位'); return; }
    if (mode === 'register' && !agreed) { setError('請先同意用戶協議與隱私政策'); return; }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error: e } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (e) { setError(e.message); return; }
      } else {
        const { error: e } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (e) { setError(e.message); return; }
      }
      router.replace('/(app)/home' as any);
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
      const redirectUrl = AuthSession.makeRedirectUri({ scheme: 'appd2yss59nidj5', path: 'auth/callback' });
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
      // 打開系統瀏覽器進行 Google 認證
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
          router.replace('/(app)/home' as any);
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
            {mode === 'login' ? '歡迎回來 🌸' : mode === 'register' ? '建立您的帳號' : '重設密碼'}
          </Text>
        </View>

        {/* 忘記密碼 — 返回按鈕 */}
        {mode === 'forgot' && (
          <Pressable className="flex-row items-center mb-4 active:opacity-70" onPress={() => switchMode('login')}>
            <ArrowLeft size={16} color="#e8789a" />
            <Text className="font-rounded text-sm text-primary ml-1">返回登入</Text>
          </Pressable>
        )}

        {/* 登入 / 註冊 切換（忘記密碼時隱藏） */}
        {mode !== 'forgot' && (
          <View className="flex-row bg-muted rounded-2xl p-1 mb-6">
            {(['login', 'register'] as const).map(m => (
              <Pressable
                key={m}
                className="flex-1 items-center py-2.5 rounded-xl active:opacity-80"
                style={{ backgroundColor: mode === m ? '#ffffff' : 'transparent' }}
                onPress={() => switchMode(m)}
              >
                <Text
                  className="font-rounded text-sm font-semibold"
                  style={{ color: mode === m ? '#e8789a' : '#c4a0ae' }}
                >
                  {m === 'login' ? '登入' : '註冊'}
                </Text>
              </Pressable>
            ))}
          </View>
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

            {/* 同意條款（僅註冊時顯示） */}
            {mode === 'register' && (
              <Pressable className="flex-row items-start mb-6" onPress={() => setAgreed(!agreed)}>
                <View className={`w-5 h-5 rounded-md border-2 mr-2 mt-0.5 items-center justify-center ${agreed ? 'bg-primary border-primary' : 'border-border'}`}>
                  {agreed && <Text className="text-white text-xs font-bold">✓</Text>}
                </View>
                <Text className="font-rounded text-sm text-muted-foreground flex-1">
                  我已閱讀並同意{' '}
                  <Text className="text-primary">用戶協議</Text>
                  {' '}和{' '}
                  <Text className="text-primary">隱私政策</Text>
                </Text>
              </Pressable>
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
                  {mode === 'login' ? '登入' : mode === 'register' ? '建立帳號' : '發送重設連結'}
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
                    使用 Google 帳號{mode === 'login' ? '登入' : '註冊'}
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

