import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft } from 'lucide-react-native';
import { MerchantTermsContent } from '@/components/MerchantTermsContent';

export default function MerchantTermsScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-background">
      <StatusBar style="dark" backgroundColor="#fff5f7" />

      <View className="flex-row items-center px-5 pt-14 pb-4 border-b border-border">
        <Pressable
          className="w-9 h-9 items-center justify-center rounded-full active:bg-muted mr-2"
          onPress={() => router.back()}
        >
          <ArrowLeft size={22} color="#e8789a" />
        </Pressable>
        <Text className="font-rounded text-xl font-bold text-foreground">商家服務條款</Text>
      </View>

      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="px-5 py-6 pb-16">
        <MerchantTermsContent />
      </ScrollView>
    </View>
  );
}
