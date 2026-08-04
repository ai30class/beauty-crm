import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  KeyboardAvoidingView, ActivityIndicator
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft } from 'lucide-react-native';
import DateTimePicker from 'react-native-ui-datepicker';
import { createCustomer, updateCustomer, getCustomerById } from '@/db/api';

export default function CustomerFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;
  const router = useRouter();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [initLoading, setInitLoading] = useState(isEdit);

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      const c = await getCustomerById(id!);
      if (c) {
        setName(c.name);
        setPhone(c.phone);
        if (c.birthday) setBirthday(new Date(c.birthday));
        setNotes(c.notes ?? '');
      }
      setInitLoading(false);
    })();
  }, [id, isEdit]);

  const handleSave = async () => {
    setError('');
    if (!name.trim()) { setError('請輸入顧客姓名'); return; }
    if (!phone.trim()) { setError('請輸入電話號碼'); return; }
    if (!birthday) { setError('請選擇顧客生日'); return; }

    let birthdayStr: string | null = null;
    if (birthday) {
      const y = birthday.getFullYear();
      const m = String(birthday.getMonth() + 1).padStart(2, '0');
      const d = String(birthday.getDate()).padStart(2, '0');
      birthdayStr = `${y}-${m}-${d}`;
    }

    setLoading(true);
    try {
      if (isEdit) {
        await updateCustomer(id!, { name: name.trim(), phone: phone.trim(), birthday: birthdayStr, notes: notes.trim() || null });
      } else {
        await createCustomer({ name: name.trim(), phone: phone.trim(), birthday: birthdayStr, notes: notes.trim() || null, booking_restricted: false, booking_allowed_hours: [] });
      }
      router.back();
    } catch (e: any) {
      setError(e.message ?? '儲存失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  if (initLoading) {
    return <View className="flex-1 bg-background items-center justify-center"><ActivityIndicator size="large" color="#e8789a" /></View>;
  }

  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} className="flex-1">
      <StatusBar style="dark" backgroundColor="#fff5f7" />
      <View className="flex-row items-center px-5 pt-14 pb-4 bg-background">
        <Pressable className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2" onPress={() => router.back()}>
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Text className="font-rounded text-xl font-bold text-foreground flex-1">
          {isEdit ? '編輯顧客' : '新增顧客'}
        </Text>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="px-5 pb-12 gap-4"
        className="bg-background"
      >
        <FormField label="姓名 *" value={name} onChangeText={setName} placeholder="顧客姓名" />
        <FormField label="電話 *" value={phone} onChangeText={setPhone} placeholder="手機號碼" keyboardType="phone-pad" />

        {/* 生日選擇器 */}
        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">生日 *</Text>
          <Pressable
            className="bg-card border border-border rounded-2xl px-4 items-start justify-center active:opacity-80"
            style={{ height: 52 }}
            onPress={() => setShowDatePicker(!showDatePicker)}
          >
            <Text className={`font-rounded text-base ${birthday ? 'text-foreground' : 'text-muted-foreground'}`}>
              {birthday
                ? `${birthday.getFullYear()}-${String(birthday.getMonth()+1).padStart(2,'0')}-${String(birthday.getDate()).padStart(2,'0')}`
                : '選擇生日 *'}
            </Text>
          </Pressable>
          {showDatePicker && (
            <View className="bg-card border border-border rounded-2xl mt-2 overflow-hidden">
              <DateTimePicker
                mode="single"
                date={birthday ?? new Date(1990, 0, 1)}
                onChange={(params) => {
                  if (params.date) setBirthday(params.date as Date);
                  setShowDatePicker(false);
                }}
              />
            </View>
          )}
        </View>

        {/* 備註 */}
        <View>
          <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">備註</Text>
          <TextInput
            className="bg-card border border-border rounded-2xl px-4 py-3 font-rounded text-base text-foreground"
            placeholder="備註（選填）"
            placeholderTextColor="#c4a0ae"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {error ? <Text className="font-rounded text-destructive text-sm">{error}</Text> : null}

        <Pressable
          className="bg-primary rounded-2xl items-center justify-center active:opacity-80 mt-2"
          style={{ height: 56 }}
          onPress={handleSave}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text className="font-rounded text-white text-base font-semibold">{isEdit ? '儲存變更' : '新增顧客'}</Text>
          }
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FormField({
  label, value, onChangeText, placeholder, keyboardType, secureTextEntry
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: any; secureTextEntry?: boolean;
}) {
  return (
    <View>
      <Text className="font-rounded text-sm font-medium text-foreground mb-1.5">{label}</Text>
      <TextInput
        className="bg-card border border-border rounded-2xl px-4 font-rounded text-base text-foreground"
        style={{ height: 52 }}
        placeholder={placeholder}
        placeholderTextColor="#c4a0ae"
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
      />
    </View>
  );
}
