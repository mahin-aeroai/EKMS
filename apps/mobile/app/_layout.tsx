import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import 'react-native-reanimated';
import {
  Roboto_300Light,
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_700Bold,
} from '@expo-google-fonts/roboto';

import { SessionProvider, useSession } from '@/context/auth';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Roboto, per "make th eofnts smaller roboto or suitable small font" --
  // used app-wide, in place of the platform default (San Francisco on
  // iOS), which was reading as visually noisy at the small sizes the
  // denser screens need.
  //
  // "still the fonts erantic" + reference screenshots (CRED-style: one
  // clean small sans throughout, no serif) -- Lora was dropped entirely
  // per that round. It had been layered onto nav titles, card titles, and
  // section labels all at once, which read as inconsistent/heavier next
  // to the references rather than as a deliberate accent. See
  // theme/vibrant.ts's `fonts` export -- serif/serifBold no longer exist,
  // every fontFamily in the app is now one of the three Roboto weights
  // below.
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    Roboto_300Light,
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_700Bold,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  if (!loaded) {
    return null;
  }

  return (
    <SessionProvider>
      <RootLayoutNav />
    </SessionProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { session, isLoading } = useSession();

  // Keep the splash screen up until the session is known too, not just
  // fonts -- otherwise a signed-in user sees a flash of the sign-in screen
  // before their session loads from SecureStore.
  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  if (isLoading) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="report/[id]" options={{ title: "Installation Report" }} />
          {/* "make a screen for it" -- cost sheet detail after Generate */}
          <Stack.Screen name="cost-sheet/[ref]" options={{ title: "Cost Sheet" }} />
          {/* "let them open in diferent screena dn show them nicely like a
              bill" -- Sales by Rep's per-customer Bill detail */}
          <Stack.Screen name="bill" options={{ title: "Bill" }} />
          {/* Estimate Builder's saved-quote "bill view" (app/estimate/[id].tsx) */}
          <Stack.Screen name="estimate/[id]" options={{ title: "Estimate" }} />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
