import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Eye, EyeOff, Lock } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { supabase } from '@/client/supabase';

// 「忘記密碼」信件點進來後的最後一步：設定新密碼。
//
// 進來的方式有兩種，這頁都要能接：
//   1. 首頁認出信裡的 recovery token，塞進 sessionStorage 再導過來
//   2. 已經是登入狀態的人自己開這個網址（不需要知道舊密碼）
// 換 session 這件事放在這頁做，不放在首頁——首頁那版會卡在轉圈圈出不來。
//
// ⚠️ 這個檔案必須放在 src/app/ 底下（公開路由），不能放進 (auth)：
// (auth) 的 guard 是 !session，只有未登入才進得去，而點信進來的人身上
// 一定帶著 recovery session，放進 (auth) 這頁就永遠打不開。
const RECOVERY_TOKENS_KEY = 'bcrm_recovery_tokens';  // 與 src/app/index.tsx 同一把 key

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    // 逾時保護：這頁背後要跟 Supabase 換 session，如果那個請求卡住（實測遇過，
    // 例如瀏覽器限制儲存空間時 supabase client 會一直不回來），畫面會永遠停在
    // 轉圈圈。沒有說明的等待畫面會讓使用者以為當掉、回頭再點一次信，而
    // recovery 連結是一次性的，等於自己把它燒掉。所以寧可逾時報錯也不要卡住。
    const timer = setTimeout(() => {
      setChecking(prev => {
        if (prev) {
          setError('驗證重設連結逾時。若你正在使用「私密瀏覽 / 無痕視窗」，請改用一般視窗再試一次——這個系統的登入狀態需要瀏覽器的儲存空間，私密模式會擋掉。');
        }
        return false;
      });
    }, 10000);

    (async () => {
      // 先用首頁交棒過來的憑證換 session（一次性，用完就清掉，避免重複使用）
      let handoff: { accessToken?: string; refreshToken?: string } | null = null;
      try {
        const raw = sessionStorage.getItem(RECOVERY_TOKENS_KEY);
        if (raw) { handoff = JSON.parse(raw); sessionStorage.removeItem(RECOVERY_TOKENS_KEY); }
      } catch { /* sessionStorage 不可用，往下走既有 session 的判斷 */ }

      if (handoff?.accessToken && handoff?.refreshToken) {
        const { error: e } = await supabase.auth.setSession({
          access_token: handoff.accessToken,
          refresh_token: handoff.refreshToken,
        });
        if (e) {
          // 最常見的原因：這封信的連結已經點過一次了。recovery token 是
          // 一次性的，同一封信點第二次一定失敗，必須重新申請一封新的。
          setError('這個重設連結已經用過或已過期。請回登入頁重新申請一次，並且只點一次信裡的連結。');
          clearTimeout(timer);
          setChecking(false);
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (data.session) setCanEdit(true);
      else setError('這個重設連結已失效，請回登入頁重新申請一次。');
      clearTimeout(timer);
      setChecking(false);
    })();

    return () => clearTimeout(timer);
  }, []);

  // 回登入頁之前一定要先登出：點信進來的人身上帶著 recovery session，
  // 而 (auth) 群組是 guard={!session}，沒登出就導不過去（會彈回來）。
  const backToSignIn = async () => {
    try { await supabase.auth.signOut(); } catch { /* 登出失敗也照樣導回去 */ }
    router.replace('/(auth)/sign-in' as any);
  };

  const handleSave = async () => {
    setError('');
    if (password.length < 6) { setError('密碼至少 6 個字元'); return; }
    if (password !== confirm) { setError('兩次輸入的密碼不一樣'); return; }
    setSaving(true);
    try {
      const { error: e } = await supabase.auth.updateUser({ password });
      if (e) { setError(e.message); return; }
      setDone(true);
    } finally {
      setSaving(false);
    }
  };

  if (checking) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff5f7', gap: 12 }}>
        <ActivityIndicator size="large" color="#e8789a" />
        <Text style={{ fontSize: 14, color: '#7a6a70' }}>正在驗證重設連結…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff5f7', padding: 24 }}>
      <StatusBar style="dark" />
      <View style={{ width: '100%', maxWidth: 420, backgroundColor: '#fff', borderRadius: 20, padding: 24, gap: 14 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#3d2b32' }}>設定新密碼</Text>

        {!canEdit && !done ? (
          <>
            <Text style={{ fontSize: 14, lineHeight: 22, color: '#d1495b' }}>{error}</Text>
            <Pressable
              onPress={backToSignIn}
              style={{ backgroundColor: '#e8789a', borderRadius: 999, paddingVertical: 14, alignItems: 'center', marginTop: 4 }}
            >
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>回登入頁重新申請</Text>
            </Pressable>
          </>
        ) : done ? (
          <>
            <Text style={{ fontSize: 14, lineHeight: 22, color: '#7a6a70' }}>
              密碼已更新完成，之後請用新密碼登入。
            </Text>
            <Pressable
              onPress={() => router.replace('/(app)/home' as any)}
              style={{ backgroundColor: '#e8789a', borderRadius: 999, paddingVertical: 14, alignItems: 'center', marginTop: 4 }}
            >
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>開始使用</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={{ fontSize: 14, lineHeight: 22, color: '#7a6a70' }}>
              請輸入新的密碼，至少 6 個字元。
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#f0d9e1', borderRadius: 12, paddingHorizontal: 12 }}>
              <Lock size={18} color="#c4a0ae" />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="新密碼"
                placeholderTextColor="#c4a0ae"
                secureTextEntry={!showPw}
                autoCapitalize="none"
                style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, color: '#3d2b32' }}
              />
              <Pressable onPress={() => setShowPw(v => !v)} hitSlop={8}>
                {showPw ? <EyeOff size={18} color="#c4a0ae" /> : <Eye size={18} color="#c4a0ae" />}
              </Pressable>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#f0d9e1', borderRadius: 12, paddingHorizontal: 12 }}>
              <Lock size={18} color="#c4a0ae" />
              <TextInput
                value={confirm}
                onChangeText={setConfirm}
                placeholder="再輸入一次新密碼"
                placeholderTextColor="#c4a0ae"
                secureTextEntry={!showPw}
                autoCapitalize="none"
                style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 10, color: '#3d2b32' }}
              />
            </View>

            {!!error && (
              <Text style={{ color: '#d1495b', fontSize: 13, lineHeight: 20 }}>{error}</Text>
            )}

            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={{ backgroundColor: '#e8789a', borderRadius: 999, paddingVertical: 14, alignItems: 'center', opacity: saving ? 0.6 : 1 }}
            >
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
                {saving ? '儲存中…' : '儲存新密碼'}
              </Text>
            </Pressable>

            <Pressable onPress={backToSignIn} style={{ paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ color: '#e8789a', fontSize: 14, fontWeight: '600' }}>回登入頁</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
