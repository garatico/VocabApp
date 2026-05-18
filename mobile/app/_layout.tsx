import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle:          { backgroundColor: '#f8f9fa' },
          headerTintColor:      '#212529',
          headerTitleStyle:     { fontWeight: '700' },
          contentStyle:         { backgroundColor: '#f8f9fa' },
          headerShadowVisible:  false,
        }}
      />
    </>
  );
}
