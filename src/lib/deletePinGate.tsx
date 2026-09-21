import { useState, useRef, useCallback } from 'react';
import { View, Text, Pressable, TextInput, Modal, ActivityIndicator } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { getAccountType, hasDeletePin, verifyDeletePin, setDeletePin } from '@/db/api';
import type { DeletePinResult } from '@/db/api';

// 刪除預約前要輸入的「刪除密碼」（migration 00084）。
// 這是防手滑的一道確認，不是資安防線；只有商家本人要輸入，員工帳號維持原樣。

export type DeletePinMode = 'verify' | 'set' | 'change';

const MESSAGES: Record<string, string> = {
  wrong: '密碼不對，請再試一次',
  locked: '輸錯太多次了，請 5 分鐘後再試',
  invalid: '密碼要是 4～6 位數字',
  not_allowed: '只有老闆本人可以設定刪除密碼',
};

const digitsOnly = (v: string) => v.replace(/[^0-9]/g, '');

function PinInput({ label, value, onChange, autoFocus, onSubmit }: {
  label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean; onSubmit?: () => void;
}) {
  return (
    <View>
      <Text className="font-rounded text-xs text-muted-foreground mb-1">{label}</Text>
      <TextInput
        className="bg-background border border-border rounded-2xl px-4 font-rounded text-lg text-foreground"
        style={{ height: 50, letterSpacing: 6 }}
        value={value}
        onChangeText={v => onChange(digitsOnly(v).slice(0, 6))}
        secureTextEntry
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={6}
        autoFocus={autoFocus}
        autoComplete="off"
        onSubmitEditing={onSubmit}
      />
    </View>
  );
}

export function DeletePinModal({ mode, onClose, onSuccess }: {
  mode: DeletePinMode; onClose: () => void; onSuccess: () => void;
}) {
  const [currentMode, setCurrentMode] = useState<DeletePinMode>(mode);
  const [current, setCurrent] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const title = currentMode === 'verify' ? '請輸入刪除密碼'
    : currentMode === 'set' ? '設定刪除密碼' : '變更刪除密碼';
  const hint = currentMode === 'verify' ? '為了避免手滑刪到預約，刪除前要先輸入密碼。'
    : currentMode === 'set' ? '第一次使用，請設定一組 4～6 位數字的刪除密碼，之後刪除預約前都會問你。'
    : '請先輸入目前的密碼，再設定新密碼。';

  const submit = async () => {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      let result: DeletePinResult;
      if (currentMode === 'verify') {
        result = await verifyDeletePin(pin);
        if (result === 'not_set') { setCurrentMode('set'); setPin(''); setError('目前還沒有設定刪除密碼，請先設定一組'); return; }
      } else {
        if (pin !== confirmPin) { setError('兩次輸入的密碼不一樣'); return; }
        result = await setDeletePin(pin, currentMode === 'change' ? current : undefined);
      }
      if (result === 'ok') { onSuccess(); return; }
      setError(MESSAGES[result] ?? '操作失敗，請稍後再試');
      if (result === 'wrong') { setPin(''); if (currentMode === 'change') setCurrent(''); }
    } catch (e: any) {
      setError(e?.message ?? '操作失敗，請稍後再試');
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = !busy && (
    currentMode === 'verify' ? pin.length >= 4
    : currentMode === 'set' ? pin.length >= 4 && confirmPin.length >= 4
    : current.length >= 4 && pin.length >= 4 && confirmPin.length >= 4
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40 items-center justify-center px-8" onPress={onClose}>
        <Pressable className="bg-card w-full rounded-3xl p-6 gap-4" style={{ maxWidth: 380 }} onPress={() => {}}>
          <View className="items-center gap-2">
            <View className="w-14 h-14 rounded-full items-center justify-center" style={{ backgroundColor: '#fce9f0' }}>
              <ShieldCheck size={28} color="#e8789a" />
            </View>
            <Text className="font-rounded text-lg font-bold text-foreground">{title}</Text>
            <Text className="font-rounded text-xs text-muted-foreground text-center">{hint}</Text>
          </View>

          {currentMode === 'change' && (
            <PinInput label="目前的密碼" value={current} onChange={setCurrent} autoFocus />
          )}
          <PinInput
            label={currentMode === 'verify' ? '刪除密碼' : '新密碼（4～6 位數字）'}
            value={pin}
            onChange={setPin}
            autoFocus={currentMode !== 'change'}
            onSubmit={currentMode === 'verify' ? submit : undefined}
          />
          {currentMode !== 'verify' && (
            <PinInput label="再輸入一次新密碼" value={confirmPin} onChange={setConfirmPin} onSubmit={submit} />
          )}

          {error ? <Text className="font-rounded text-xs text-center" style={{ color: '#e85454' }}>{error}</Text> : null}

          <View className="flex-row gap-3">
            <Pressable className="flex-1 h-12 rounded-2xl border border-border items-center justify-center active:opacity-70" onPress={onClose}>
              <Text className="font-rounded text-sm font-semibold text-muted-foreground">取消</Text>
            </Pressable>
            <Pressable
              className="flex-1 h-12 rounded-2xl items-center justify-center active:opacity-80"
              style={{ backgroundColor: canSubmit ? '#e8789a' : '#f0c4d2' }}
              disabled={!canSubmit}
              onPress={submit}
            >
              {busy
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text className="font-rounded text-sm font-semibold text-white">確認</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// 用法：const { gate, gateModal } = useDeletePinGate();
//   按下垃圾桶時呼叫 gate(() => 原本要做的事)；畫面最後放 {gateModal}。
// 員工帳號直接放行；商家：還沒設密碼會先請他設定一組，設好了才繼續；已設定就要輸入正確密碼。
export function useDeletePinGate() {
  const [mode, setMode] = useState<DeletePinMode | null>(null);
  const pending = useRef<(() => void) | null>(null);

  const gate = useCallback(async (action: () => void) => {
    let isStaff = false;
    try { isStaff = (await getAccountType()) === 'staff'; } catch { /* 查不到就照商家處理（要輸入密碼，比較保守） */ }
    if (isStaff) { action(); return; }
    let has = true;
    try { has = await hasDeletePin(); } catch { /* 查不到就走驗證，驗證失敗會顯示原因 */ }
    pending.current = action;
    setMode(has ? 'verify' : 'set');
  }, []);

  const close = useCallback(() => { pending.current = null; setMode(null); }, []);
  const done = useCallback(() => {
    const action = pending.current;
    pending.current = null;
    setMode(null);
    action?.();
  }, []);

  const gateModal = mode ? <DeletePinModal mode={mode} onClose={close} onSuccess={done} /> : null;
  return { gate, gateModal };
}
