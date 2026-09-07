import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Eye, EyeOff, Lock } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { supabase } from '@/client/supabase';

// 「忘記密碼」信件點進來後的最後一步：設定新密碼。
// auth/callback.tsx 會先用信裡的 token 建立 session，再把人導來這裡，
// 所以這頁進來時應該已經是登入狀態，直接 updateUser 就能換密碼。
export default function ResetPasswordScreen() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // 沒有 session 代表不是從有效的重設連結進來的（連結過期、或直接打網址）
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setError('這個重設連結已失效，請回登入頁重新申請一次。');
      }
      setChecking(false);
    })();
  }, []);

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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff5f7' }}>
        <ActivityIndicator size="large" color="#e8789a" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff5f7', padding: 24 }}>
      <StatusBar style="dark" />
      <View style={{ width: '100%', maxWidth: 420, backgroundColor: '#fff', borderRadius: 20, padding: 24, gap: 14 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#3d2b32' }}>設定新密碼</Text>

        {done ? (
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

            <Pressable onPress={() => router.replace('/(auth)/sign-in' as any)} style={{ paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ color: '#e8789a', fontSize: 14, fontWeight: '600' }}>回登入頁</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
