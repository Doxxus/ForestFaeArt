import { useRef, useState } from "react";
import { Linking, StyleSheet, Vibration, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { findBySku } from "../lib/catalog";
import { parseScan } from "../lib/scan";
import { useNav } from "../nav";
import { usePos } from "../state/app";
import { RADIUS, SPACE, theme } from "../theme";
import { Banner, Button, Screen, T } from "../ui/kit";

/** Reads the QR code on a label and opens the piece (POS-2). The camera is only on while this screen is showing. */
export function ScanScreen() {
  const nav = useNav();
  const { state } = usePos();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const last = useRef<{ data: string; at: number }>({ data: "", at: 0 });

  const onScan = ({ data }: { data: string }) => {
    const now = Date.now();
    // The camera reports the same code many times a second. Ignore repeats, but let the same label be scanned again after a moment.
    if (data === last.current.data && now - last.current.at < 2500) return;
    last.current = { data, at: now };
    const sku = parseScan(data);
    if (!sku) {
      setMessage("That isn't one of our labels.");
      return;
    }
    const piece = findBySku(state.catalog, sku);
    if (!piece) {
      setMessage(`${sku} isn't in your list. It may be new, so try refreshing the pieces on the More tab.`);
      return;
    }
    Vibration.vibrate(60);
    setMessage(null);
    nav.go({ name: "item", pieceId: piece.id });
  };

  if (!permission) return <Screen title="Scan" onBack={nav.back}><T>Checking the camera…</T></Screen>;

  if (!permission.granted) {
    return (
      <Screen title="Scan" onBack={nav.back}>
        <Banner tone="info">The camera is only used to read the QR codes on your labels. Nothing is recorded or sent.</Banner>
        {permission.canAskAgain ? (
          <Button label="Allow the camera" onPress={() => void requestPermission()} />
        ) : (
          <>
            <Banner tone="warn">The camera is turned off for this app. Turn it on in the phone's settings.</Banner>
            <Button label="Open settings" onPress={() => void Linking.openSettings()} />
          </>
        )}
        <Button label="Type a name or number instead" variant="secondary" onPress={nav.back} style={{ marginTop: SPACE.md }} />
      </Screen>
    );
  }

  return (
    <Screen title="Scan a label" onBack={nav.back} scroll={false}>
      <View style={styles.cameraBox}>
        <CameraView style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={onScan} />
        <View pointerEvents="none" style={styles.frame} />
      </View>
      <T tone="moss" style={{ textAlign: "center", marginVertical: SPACE.md }}>
        Hold the label inside the box.
      </T>
      {message ? <Banner tone="warn">{message}</Banner> : null}
      <Button label={torch ? "Turn the light off" : "Turn the light on"} variant="secondary" onPress={() => setTorch((t) => !t)} style={{ marginBottom: SPACE.sm }} />
      <Button label="Can't scan? Type it instead" variant="ghost" onPress={nav.back} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cameraBox: { height: 360, borderRadius: RADIUS, overflow: "hidden", backgroundColor: theme.ink, alignItems: "center", justifyContent: "center" },
  frame: { width: 220, height: 220, borderWidth: 4, borderColor: theme.champagne, borderRadius: RADIUS },
});
