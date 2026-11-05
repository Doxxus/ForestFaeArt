import { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePos } from "../state/app";
import { SPACE } from "../theme";
import { Banner, Button, Card, Field, H, T } from "../ui/kit";

export function LoginScreen() {
  const { store, state } = usePos();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const waiting = state.queue.length;

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await store.signIn(email, password);
    setBusy(false);
    if (!result.ok) setError(result.message);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: "#F4EFE3", justifyContent: "center", padding: SPACE.xl, paddingTop: SPACE.xl + insets.top, paddingBottom: SPACE.xl + insets.bottom }}>
      <View style={{ alignItems: "center", marginBottom: SPACE.xl }}>
        <T size="title" tone="forest" bold>
          Forest Fae Folk Art
        </T>
        <T tone="moss">Point of sale</T>
      </View>
      <Card>
        <H>Sign in</H>
        {state.needsSignIn && waiting > 0 ? <Banner tone="warn">{waiting === 1 ? "1 sale is waiting on this phone." : `${waiting} sales are waiting on this phone.`} They will be sent as soon as you sign in.</Banner> : null}
        {error ? <Banner tone="error">{error}</Banner> : null}
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username" returnKeyType="next" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={submit} />
        <Button label="Sign in" onPress={submit} busy={busy} disabled={!email.trim() || !password} />
      </Card>
      <T tone="moss" size="small" style={{ textAlign: "center", marginTop: SPACE.lg }}>
        You only need to sign in once a day. After that the app works without a signal.
      </T>
    </KeyboardAvoidingView>
  );
}
