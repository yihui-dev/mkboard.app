import { useEffect, useState } from "react";
import { ActivityIndicator, BackHandler, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { setAudioModeAsync } from "expo-audio";
import { ConnectScreen } from "./src/screens/ConnectScreen";
import { ProjectsScreen } from "./src/screens/ProjectsScreen";
import { StoryboardScreen } from "./src/screens/StoryboardScreen";
import { loadConnection } from "./src/storage";
import { colors } from "./src/theme";
import type { SyncConnection, SyncedProjectSummary } from "./src/types";

export default function App() {
  const [booting, setBooting] = useState(true);
  const [connection, setConnection] = useState<SyncConnection | null>(null);
  const [editingConnection, setEditingConnection] = useState(false);
  const [selectedProject, setSelectedProject] = useState<SyncedProjectSummary | null>(null);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false
    }).catch(() => undefined);

    void loadConnection()
      .then((saved) => setConnection(saved))
      .finally(() => setBooting(false));
  }, []);

  // Android hardware back button handling
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (editingConnection && connection) {
        setEditingConnection(false);
        return true;
      }
      if (selectedProject) {
        setSelectedProject(null);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [editingConnection, connection, selectedProject]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {booting ? (
        <View style={styles.boot}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : !connection || editingConnection ? (
        <ConnectScreen
          initialConnection={connection}
          onConnected={(conn) => {
            setConnection(conn);
            setEditingConnection(false);
            setSelectedProject(null);
          }}
          onCancel={connection ? () => setEditingConnection(false) : undefined}
        />
      ) : selectedProject ? (
        <StoryboardScreen
          connection={connection}
          project={selectedProject}
          onBack={() => setSelectedProject(null)}
        />
      ) : (
        <ProjectsScreen
          connection={connection}
          onSelectProject={(project) => setSelectedProject(project)}
          onOpenSettings={() => setEditingConnection(true)}
        />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center"
  }
});
