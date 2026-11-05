import { Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { AppProvider, usePos } from "./src/state/app";
import { NavProvider, TABS, useNav } from "./src/nav";
import { CartScreen } from "./src/screens/cart";
import { CheckoutScreen } from "./src/screens/checkout";
import { DoneScreen } from "./src/screens/done";
import { HomeScreen } from "./src/screens/home";
import { ItemScreen } from "./src/screens/item";
import { LoginScreen } from "./src/screens/login";
import { MoreScreen } from "./src/screens/more";
import { ScanScreen } from "./src/screens/scan";
import { TodayScreen } from "./src/screens/today";
import { FONT, theme, TOUCH } from "./src/theme";
import { T } from "./src/ui/kit";

function Routes() {
  const nav = useNav();
  const { route } = nav;
  const mainTabs = ["home", "cart", "today", "more"];
  const showTabs = mainTabs.includes(route.name) && nav.stack.length === 1;
  const { state } = usePos();
  const cartCount = state.cart.reduce((n, l) => n + l.quantity, 0);
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: theme.cream }}>
      <View style={{ flex: 1 }}>
        {route.name === "home" ? <HomeScreen /> : null}
        {route.name === "scan" ? <ScanScreen /> : null}
        {route.name === "item" ? <ItemScreen pieceId={route.pieceId} /> : null}
        {route.name === "cart" ? <CartScreen /> : null}
        {route.name === "checkout" ? <CheckoutScreen /> : null}
        {route.name === "done" ? <DoneScreen outcome={route.outcome} /> : null}
        {route.name === "today" ? <TodayScreen /> : null}
        {route.name === "more" ? <MoreScreen /> : null}
      </View>
      {showTabs ? (
        <View style={[styles.tabs, { paddingBottom: insets.bottom }]} accessibilityRole="tablist">
          {TABS.map((t) => {
            const on = route.name === t.route;
            return (
              <Pressable key={t.route} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.route === "cart" && cartCount ? `Cart, ${cartCount} pieces` : t.label} onPress={() => nav.tab(t.route)} style={[styles.tab, on && styles.tabOn]}>
                <Text style={[styles.tabText, on && styles.tabTextOn]}>
                  {t.label}
                  {t.route === "cart" && cartCount ? ` (${cartCount})` : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function Root() {
  const { state } = usePos();
  if (state.phase === "loading") {
    return (
      <View style={styles.center}>
        <T tone="forest" size="large" bold>
          Forest Fae Folk Art
        </T>
      </View>
    );
  }
  if (state.phase === "signed-out") return <LoginScreen />;
  return (
    <NavProvider enabled>
      <Routes />
    </NavProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="light" />
        <Root />
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.cream },
  tabs: { flexDirection: "row", backgroundColor: theme.parchment, borderTopWidth: 1, borderTopColor: theme.stone },
  tab: { flex: 1, minHeight: TOUCH + 8, alignItems: "center", justifyContent: "center" },
  tabOn: { backgroundColor: theme.forest },
  tabText: { fontSize: FONT.body, fontWeight: "700", color: theme.forest },
  tabTextOn: { color: theme.cream },
});
