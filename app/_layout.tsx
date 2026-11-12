import { Stack } from 'expo-router';
import '../src/engine/LocationTask';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="journey/[id]"
        options={{
          headerShown: true,
          title: 'Journey Details',
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="studio/[journeyId]"
        options={{
          headerShown: true,
          title: 'Journey Studio',
          headerBackTitle: 'Studio',
        }}
      />
      <Stack.Screen
        name="studio/stop-editor"
        options={{
          presentation: 'modal',
          headerShown: true,
          title: 'Configure Sound Stop',
        }}
      />
    </Stack>
  );
}