import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Eye, EyeOff, Lock, Mail, MessageCircle } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {ActivityIndicator,
  KeyboardAvoidingView, Pressable, ScrollView,Text, TextInput,
  View,
} from 'react-native';
import { supabase } from '@/client/supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// LIFF ID 不是密鑰（前端本來就要帶著它去初始化 LIFF SDK），可以直接寫在前端
const LIFF_ID = '2011486633-e6gmiIWk';

// Facebook 一鍵登入的程式碼已經寫好（handleFacebookLogin、facebook-callback.tsx），
// 但 Supabase 後台的 Facebook provider 還沒開通（要先在 Meta for Developers
// 建 App 拿 App ID/Secret，見開發部署筆記七十節）——先隱藏這顆按鈕，不要讓
// 真實顧客看到一個點下去只會出現「provider is not enabled」錯誤的按鈕。
// 之後 Meta 那邊設定好、Supabase 也開通了，把這個改回 true 就會重新顯示。
const FACEBOOK_LOGIN_ENABLED = false;

// ownerId 暫存 key：LIFF 跳轉過程中網址列的 query string 常常不可靠（實測發現
// 光靠 window.location.search 重建有時還是抓不到），改用 localStorage 當最後
//一道保險——顧客一進頁面看到 ownerId 就先存起來，之後不管網址怎麼跳都讀得到
const PENDING_OWNER_ID_KEY = 'bcrm_pending_owner_id';

export default function CustomerAuthScreen() {
  const router = useRouter();
  const { ownerId, logout } = useLocalSearchParams<{ ownerId?: string; logout?: string }>();
  const justLoggedOut = logout === '1';

  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lineLoading, setLineLoading] = useState(false);
  const [oauthProvider, setOauthProvider] = useState<'line' | 'google' | 'facebook'>('line');
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  // LIFF 登入跳轉時網址列的 query string（例如 ownerId）常常不可靠，實測發現
  // 光從 window.location.search 重建有時還是抓不到——優先順序：路由參數 →
  // 網址列 → localStorage 暫存（最後一道保險，不管網址怎麼跳都讀得到）
  const resolveOwnerId = (): string => {
    if (ownerId) return ownerId;
    if (typeof window === 'undefined') return '';
    try {
      const fromUrl = new URLSearchParams(window.location.search).get('ownerId');
      if (fromUrl) return fromUrl;
    } catch {
      // ignore
    }
    try {
      return localStorage.getItem(PENDING_OWNER_ID_KEY) ?? '';
    } catch {
      return '';
    }
  };

  // 只要看過一次帶 ownerId 的網址，就先存起來，之後 LIFF 跳轉不管網址怎麼變
  // 都還讀得到
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!ownerId) return;
    try {
      localStorage.setItem(PENDING_OWNER_ID_KEY, ownerId);
    } catch {
      // ignore（無痕模式等環境可能擋掉 localStorage，忽略即可，不影響其他流程）
    }
  }, [ownerId]);

  // 進頁面就先初始化 LIFF；如果本來就在 LINE App 裡打開（已經登入過），
  // 會直接偵測到已登入狀態，不用使用者再按一次
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    (async () => {
      try {
        const liff = (await import('@line/liff')).default;
        await liff.init({ liffId: LIFF_ID });

        // 顧客剛從「我的預約」按了登出（帶 ?logout=1 導過來）：這一頁本來就是
        // LIFF App 的入口頁，一定在 LIFF 註冊的 Endpoint URL 範圍內，把
        // liff.logout() 放在這裡做才能確保真的執行到（在 my-orders 那種
        // 非 LIFF 入口頁呼叫，liff.init() 可能直接失敗、logout 永遠不會跑到）。
        // 這次也刻意跳過下面的自動登入偵測，不然清掉的瞬間又被撿回來。
        if (justLoggedOut) {
          if (liff.isLoggedIn()) liff.logout();
          // 處理完就把網址列的 ?logout=1 清掉，不然使用者接著按「用 LINE 一鍵登入」時，
          // handleLineLogin 會把還帶著 logout=1 的 window.location.href 當作 LINE OAuth
          // 的 redirectUri；LINE 授權完導回來，這裡又會偵測到 logout=1、立刻把剛登入
          // 成功的 LIFF session 登出、直接 return（完全沒機會走到下面 completeLineLogin），
          // 使用者停在登入畫面、看起來像整個登入流程卡住轉不出去。
          const cleanOwnerId = resolveOwnerId();
          router.replace((cleanOwnerId ? `/online-booking/customer-auth?ownerId=${cleanOwnerId}` : '/online-booking/customer-auth') as any);
          return;
        }

        const urlOwnerId = resolveOwnerId();
        if (urlOwnerId) {
          try { localStorage.setItem(PENDING_OWNER_ID_KEY, urlOwnerId); } catch { /* ignore */ }
        }
        if (urlOwnerId && urlOwnerId !== ownerId) {
          router.setParams({ ownerId: urlOwnerId });
        }
        if (!cancelled && liff.isLoggedIn()) {
          await completeLineLogin(urlOwnerId);
        }
      } catch (e) {
        console.error('LIFF init failed', e);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completeLineLogin = async (ownerIdOverride?: string) => {
    const targetOwnerId = ownerIdOverride || resolveOwnerId();
    setOauthProvider('line');
    setLineLoading(true);
    setError('');
    try {
      const liff = (await import('@line/liff')).default;
      const idToken = liff.getIDToken();
      if (!idToken) throw new Error('LINE 登入失敗，請再試一次');

      const res = await fetch(`${SUPABASE_URL}/functions/v1/line-login/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
        body: JSON.stringify({ idToken }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'LINE 登入失敗');

      const { error: otpErr } = await supabase.auth.verifyOtp({
        token_hash: json.token_hash,
        type: 'magiclink',
      });
      if (otpErr) throw otpErr;

      router.replace(`/online-booking?ownerId=${targetOwnerId}` as any);
    } catch (e: any) {
      setError(e.message ?? 'LINE 登入失敗，請稍後再試');
    } finally {
      setLineLoading(false);
    }
  };

  const handleLineLogin = async () => {
    try {
      const liff = (await import('@line/liff')).default;
      if (liff.isLoggedIn()) {
        await completeLineLogin();
      } else {
        // 已經在 LINE 內建瀏覽器打開時，這一步幾乎不會跳轉、直接就登入了；
        // 在一般瀏覽器打開時才會真的跳去 LINE 授權頁。redirectUri 不能直接
        // 拿 window.location.href 現成用——網址列可能還殘留 ?logout=1 之類
        // 不該帶進下一輪的參數，一旦被 LINE 導回來會誤觸發登出分支（見上面
        // justLoggedOut 註解），所以這裡自己組一個乾淨的網址，只帶 ownerId。
        const targetOwnerId = resolveOwnerId();
        const path = `/online-booking/customer-auth${targetOwnerId ? `?ownerId=${targetOwnerId}` : ''}`;
        const cleanRedirect = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;
        liff.login({ redirectUri: cleanRedirect });
      }
    } catch (e: any) {
      setError('LINE 登入初始化失敗，請稍後再試');
    }
  };

  // Gmail 一鍵登入：跟商家後台 (auth)/sign-in.tsx 用同一個 Supabase Google
  // provider，但顧客這邊回呼要落在專屬的 google-callback 頁（帶著 ownerId），
  // 不能共用商家的 /auth/callback——那一頁登入成功後一律導去 /(app)/home，
  // 顧客帳號會被送進商家後台（雖然會被 _layout.tsx 的身分守門擋下，但體驗
  // 是直接卡住，不是完成預約）。這裡只做網頁版，顧客預約流程本來就是純網頁，
  // 不像商家後台原生 App 還要走系統瀏覽器 + deep link 那一套。
  const handleGoogleLogin = async () => {
    if (typeof window === 'undefined') return;
    setError('');
    setOauthProvider('google');
    setLineLoading(true);
    try {
      const targetOwnerId = resolveOwnerId();
      const redirectUrl = `${window.location.origin}/online-booking/google-callback?ownerId=${targetOwnerId}`;
      const { data, error: e } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
      });
      if (e || !data.url) {
        setError(e?.message ?? '無法取得 Google 登入連結');
        setLineLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Google 登入初始化失敗，請稍後再試');
      setLineLoading(false);
    }
  };

  // Facebook 一鍵登入：跟上面 Gmail 一鍵登入完全同一套模式（Supabase 內建
  // OAuth provider，不像 LINE 要自己接 LIFF），差別只在 provider 名稱跟
  // 回呼頁。回呼頁一樣要獨立一個 facebook-callback.tsx，理由跟 google-callback
  // 一樣：不能共用商家後台的 /auth/callback（那頁登入完一律導去商家後台），
  // 也要在那頁補標記 account_type='customer'、擋掉商家帳號誤用。
  const handleFacebookLogin = async () => {
    if (typeof window === 'undefined') return;
    setError('');
    setOauthProvider('facebook');
    setLineLoading(true);
    try {
      const targetOwnerId = resolveOwnerId();
      const redirectUrl = `${window.location.origin}/online-booking/facebook-callback?ownerId=${targetOwnerId}`;
      const { data, error: e } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
      });
      if (e || !data.url) {
        setError(e?.message ?? '無法取得 Facebook 登入連結');
        setLineLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Facebook 登入初始化失敗，請稍後再試');
      setLineLoading(false);
    }
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

  // 忘記密碼：跟商家後台 (auth)/sign-in.tsx 同一套 resetPasswordForEmail，
  // 都導去 /auth/callback，那頁會依 type=recovery 轉去 /reset-password，
  // 那頁再依 profiles.account_type 判斷改完密碼要導回顧客端還是商家後台。
  const handleForgotPassword = async () => {
    setError('');
    if (!email.trim()) { setError('請輸入 Email'); return; }
    setForgotLoading(true);
    try {
      const redirectTo = typeof window !== 'undefined'
        ? `${window.location.origin}/auth/callback`
        : undefined;
      const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (e) { setError(e.message); return; }
      setResetSent(true);
    } finally {
      setForgotLoading(false);
    }
  };

  // 從 LINE 跳轉回來、自動偵測到已登入而觸發 completeLineLogin() 時，
  // 顯示整頁等待畫面（不是只有按鈕裡的小轉圈圈）——顧客剛跳出 LINE 加好友
  // 畫面回來，需要明確的畫面告訴他「還在處理，不是卡住了」
  if (lineLoading) {
    const providerInfo = {
      line: { bg: '#e8f9ee', color: '#06C755', label: 'LINE', icon: <MessageCircle size={40} color="#06C755" /> },
      google: { bg: '#eef2fc', color: '#4285F4', label: 'Google', icon: <Text style={{ fontSize: 32, fontWeight: '700', color: '#4285F4' }}>G</Text> },
      facebook: { bg: '#eaf2ff', color: '#1877F2', label: 'Facebook', icon: <Text style={{ fontSize: 32, fontWeight: '700', color: '#1877F2' }}>f</Text> },
    }[oauthProvider];
    return (
      <View className="flex-1 bg-background items-center justify-center px-8 gap-4">
        <StatusBar style="dark" backgroundColor="#fff5f7" />
        <View className="w-20 h-20 rounded-full items-center justify-center" style={{ backgroundColor: providerInfo.bg }}>
          {providerInfo.icon}
        </View>
        <Text className="font-rounded text-xl font-bold text-foreground">登入中，請稍候</Text>
        <Text className="font-rounded text-sm text-muted-foreground text-center">
          正在跟 {providerInfo.label} 同步您的帳號{'\n'}這步驟由 {providerInfo.label} 處理，通常幾秒鐘內就會完成
        </Text>
        <ActivityIndicator size="large" color={providerInfo.color} style={{ marginTop: 8 }} />
      </View>
    );
  }

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
          {showVerify ? '驗證信已寄出' : showForgot ? '重設密碼' : isSignUp ? '顧客註冊' : '顧客登入'}
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
        ) : showForgot ? (
          <View className="gap-4">
            {resetSent ? (
              <View className="gap-4 items-center pt-8">
                <View className="w-20 h-20 rounded-full bg-primary/10 items-center justify-center mb-2">
                  <Mail size={36} color="#e8789a" />
                </View>
                <Text className="font-rounded text-2xl font-bold text-foreground text-center">重設密碼信已寄出 📬</Text>
                <Text className="font-rounded text-sm text-muted-foreground text-center leading-6">
                  請至 <Text className="text-primary font-semibold">{email}</Text> 信箱點擊連結設定新密碼{'\n'}
                  沒收到信也可能在垃圾郵件夾，信裡的連結只能點一次
                </Text>
                <Pressable
                  className="border border-border rounded-2xl h-12 px-8 items-center justify-center mt-4 active:opacity-70"
                  onPress={() => { setShowForgot(false); setResetSent(false); }}
                >
                  <Text className="font-rounded text-sm text-foreground font-semibold">回到登入</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text className="font-rounded text-2xl font-bold text-foreground text-center mb-2">忘記密碼？🌸</Text>
                <Text className="font-rounded text-sm text-muted-foreground text-center mb-4">
                  輸入註冊時使用的 Email，我們會寄一封重設密碼的信給您
                </Text>

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
                    returnKeyType="done"
                    onSubmitEditing={handleForgotPassword}
                  />
                </View>

                {error ? <Text className="font-rounded text-xs text-destructive">{error}</Text> : null}

                <Pressable
                  className="bg-primary rounded-2xl h-14 items-center justify-center active:opacity-80 mt-1"
                  onPress={handleForgotPassword}
                  disabled={forgotLoading}
                >
                  {forgotLoading
                    ? <ActivityIndicator color="#fff" />
                    : <Text className="font-rounded text-base text-white font-semibold">寄送重設密碼信</Text>
                  }
                </Pressable>

                <Pressable
                  className="items-center py-2 active:opacity-70"
                  onPress={() => { setShowForgot(false); setError(''); }}
                >
                  <Text className="font-rounded text-sm text-primary">回到登入</Text>
                </Pressable>
              </>
            )}
          </View>
        ) : (
          <View className="gap-4">
            <Text className="font-rounded text-2xl font-bold text-foreground text-center mb-2">
              {isSignUp ? '建立顧客帳號 🌸' : '歡迎回來 🌸'}
            </Text>
            <Text className="font-rounded text-sm text-muted-foreground text-center mb-4">
              {isSignUp ? '註冊後即可預約及查看歷史記錄' : '登入後即可開始預約服務'}
            </Text>

            {/* 隱私權/服務條款告知：放在 LINE 一鍵登入按鈕之前，讓顧客在
                按下去、把 LINE 資料交出去之前就能先看到、點進去閱讀 */}
            <Text className="font-rounded text-xs text-muted-foreground text-center leading-5">
              點選下方一鍵登入或註冊帳號，即表示您已閱讀並同意本服務{' '}
              <Text className="text-primary" onPress={() => router.push(`/online-booking/privacy-policy?ownerId=${resolveOwnerId()}` as any)}>服務條款及隱私政策</Text>
            </Text>

            {/* LINE 一鍵登入 */}
            <Pressable
              className="rounded-2xl h-14 items-center justify-center active:opacity-80 flex-row gap-2"
              style={{ backgroundColor: '#06C755' }}
              onPress={handleLineLogin}
              disabled={lineLoading}
            >
              {lineLoading && oauthProvider === 'line'
                ? <ActivityIndicator color="#fff" />
                : <>
                    <MessageCircle size={18} color="#fff" />
                    <Text className="font-rounded text-base text-white font-semibold">用 LINE 一鍵登入</Text>
                  </>
              }
            </Pressable>

            {/* Gmail 一鍵登入 */}
            <Pressable
              className="rounded-2xl h-14 items-center justify-center active:opacity-70 flex-row gap-3 border border-border bg-card"
              onPress={handleGoogleLogin}
              disabled={lineLoading}
            >
              {lineLoading && oauthProvider === 'google'
                ? <ActivityIndicator color="#4285F4" />
                : <>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#4285F4' }}>G</Text>
                    <Text className="font-rounded text-base text-foreground font-semibold">用 Gmail 一鍵登入</Text>
                  </>
              }
            </Pressable>

            {/* Facebook 一鍵登入（暫時隱藏，見上方 FACEBOOK_LOGIN_ENABLED 註解） */}
            {FACEBOOK_LOGIN_ENABLED && (
              <Pressable
                className="rounded-2xl h-14 items-center justify-center active:opacity-80 flex-row gap-2"
                style={{ backgroundColor: '#1877F2' }}
                onPress={handleFacebookLogin}
                disabled={lineLoading}
              >
                {lineLoading && oauthProvider === 'facebook'
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Text style={{ fontSize: 18, fontWeight: '700', color: '#fff' }}>f</Text>
                      <Text className="font-rounded text-base text-white font-semibold">用 Facebook 一鍵登入</Text>
                    </>
                }
              </Pressable>
            )}

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

            {/* 忘記密碼（僅登入頁顯示） */}
            {!isSignUp && (
              <Pressable className="self-end active:opacity-70" onPress={() => { setShowForgot(true); setError(''); }}>
                <Text className="font-rounded text-sm text-primary">忘記密碼？</Text>
              </Pressable>
            )}

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
                    onPress={() => router.push(`/online-booking/privacy-policy?ownerId=${resolveOwnerId()}` as any)}
                  >服務條款及隱私政策</Text>
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
