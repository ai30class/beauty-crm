import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="customers" />
      <Stack.Screen name="service-records" />
      <Stack.Screen name="appointments" />
      <Stack.Screen name="packages" />
      <Stack.Screen name="service-templates" />
      <Stack.Screen name="expenses" />
    </Stack>
  );
}
