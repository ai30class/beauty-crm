import { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { Users, Calendar, BarChart2, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAccountType } from '@/db/api';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  // 「報表」是財務報表，員工永遠不給看（三層權限設計的「永遠鎖住」），員工帳號把這個分頁藏起來
  const [isStaff, setIsStaff] = useState(false);
  useEffect(() => { getAccountType().then(t => setIsStaff(t === 'staff')).catch(() => {}); }, []);
  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#e8789a',
        tabBarInactiveTintColor: '#c4a0ae',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#f5e6ec',
          height: 62 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontFamily: 'ResourceHanRoundedCN',
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: '顧客',
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="appointments"
        options={{
          title: '預約',
          tabBarIcon: ({ color, size }) => <Calendar size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          href: isStaff ? null : undefined,
          title: '報表',
          tabBarIcon: ({ color, size }) => <BarChart2 size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '我的',
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
