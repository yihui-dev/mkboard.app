import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { verifyConnection } from "../api";
import { normalizeWorkerUrl, parsePairingInput, saveConnection } from "../storage";
import { colors, radius } from "../theme";
import type { SyncConnection } from "../types";

interface ConnectScreenProps {
  initialConnection: SyncConnection | null;
  onConnected: (conn: SyncConnection) => void;
  onCancel?: () => void;
}

export function ConnectScreen({ initialConnection, onConnected, onCancel }: ConnectScreenProps) {
  const [workerUrl, setWorkerUrl] = useState(initialConnection?.workerUrl ?? "");
  const [syncToken, setSyncToken] = useState(initialConnection?.syncToken ?? "");
  const [pairingPaste, setPairingPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  async function connectWith(nextUrl: string, nextToken: string) {
    const cleanConn: SyncConnection = {
      workerUrl: normalizeWorkerUrl(nextUrl),
      syncToken: nextToken.trim()
    };
    setBusy(true);
    setError(null);
    const result = await verifyConnection(cleanConn);
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    await saveConnection(cleanConn);
    setBusy(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConnected(cleanConn);
  }

  function handlePairingPasteChange(text: string) {
    setPairingPaste(text);
    const parsed = parsePairingInput(text);
    if (parsed) {
      setWorkerUrl(parsed.workerUrl);
      setSyncToken(parsed.syncToken);
      setError(null);
      void Haptics.selectionAsync();
    }
  }

  async function openScanner() {
    if (!permission?.granted) {
      const granted = await requestPermission();
      if (!granted.granted) {
        setError("未授予相机权限，请粘贴配对码。");
        return;
      }
    }
    setError(null);
    setScannerOpen(true);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.inner}>
            <View style={styles.topBar}>
              <View style={styles.brandRow}>
                <View style={styles.logoDot}>
                  <Ionicons name="film" size={18} color={colors.accentForeground} />
                </View>
                <Text style={styles.brandTitle}>MkBoard</Text>
              </View>
              {onCancel ? (
                <Pressable onPress={onCancel} style={styles.closeBtn} hitSlop={10}>
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </Pressable>
              ) : null}
            </View>

            <Pressable
              onPress={() => void openScanner()}
              style={({ pressed }) => [styles.scanBtn, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="qr-code-outline" size={20} color={colors.accentForeground} />
              <Text style={styles.scanBtnText}>扫码连接</Text>
            </Pressable>

            <View style={styles.card}>
              <TextInput
                style={styles.input}
                placeholder="粘贴配对码 mkboard-sync://pair?..."
                placeholderTextColor={colors.textMuted}
                value={pairingPaste}
                onChangeText={handlePairingPasteChange}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <TextInput
                style={styles.input}
                placeholder="Worker URL"
                placeholderTextColor={colors.textMuted}
                value={workerUrl}
                onChangeText={setWorkerUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />

              <TextInput
                style={styles.input}
                placeholder="SYNC_TOKEN"
                placeholderTextColor={colors.textMuted}
                value={syncToken}
                onChangeText={setSyncToken}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Pressable
                disabled={busy}
                onPress={() => void connectWith(workerUrl, syncToken)}
                style={({ pressed }) => [styles.submitBtn, (pressed || busy) && { opacity: 0.8 }]}
              >
                {busy ? (
                  <ActivityIndicator color={colors.accentForeground} size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>连接</Text>
                )}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <SafeAreaView style={styles.scannerRoot}>
          <View style={styles.scannerHeader}>
            <Text style={styles.scannerTitle}>扫描配对二维码</Text>
            <Pressable onPress={() => setScannerOpen(false)} style={styles.closeBtn} hitSlop={10}>
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
          <View style={styles.cameraWrap}>
            <CameraView
              style={StyleSheet.absoluteFill}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={({ data }) => {
                const parsed = parsePairingInput(data);
                if (!parsed) return;
                setScannerOpen(false);
                setWorkerUrl(parsed.workerUrl);
                setSyncToken(parsed.syncToken);
                void connectWith(parsed.workerUrl, parsed.syncToken);
              }}
            />
            <View style={styles.scanFrame} />
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg
  },
  flex: {
    flex: 1
  },
  scroll: {
    flexGrow: 1,
    padding: 20,
    alignItems: "center",
    justifyContent: "center"
  },
  inner: {
    width: "100%",
    maxWidth: 420,
    gap: 14
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  logoDot: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center"
  },
  brandTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: colors.text
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: radius.md
  },
  scanBtnText: {
    color: colors.accentForeground,
    fontSize: 15,
    fontWeight: "700"
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 14,
    gap: 10
  },
  input: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: colors.text,
    fontSize: 14
  },
  errorText: {
    fontSize: 12.5,
    color: colors.danger
  },
  submitBtn: {
    marginTop: 4,
    backgroundColor: colors.text,
    paddingVertical: 13,
    borderRadius: radius.md,
    alignItems: "center"
  },
  submitBtnText: {
    color: colors.accentForeground,
    fontSize: 14.5,
    fontWeight: "700"
  },
  scannerRoot: {
    flex: 1,
    backgroundColor: "#000000"
  },
  scannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14
  },
  scannerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF"
  },
  cameraWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  scanFrame: {
    width: 240,
    height: 240,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.accent
  }
});
