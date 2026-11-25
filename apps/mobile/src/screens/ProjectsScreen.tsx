import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { fetchProjects, withAuthQuery } from "../api";
import { colors, radius } from "../theme";
import type { SyncConnection, SyncedProjectSummary } from "../types";

interface ProjectsScreenProps {
  connection: SyncConnection;
  onSelectProject: (project: SyncedProjectSummary) => void;
  onOpenSettings: () => void;
}

export function ProjectsScreen({ connection, onSelectProject, onOpenSettings }: ProjectsScreenProps) {
  const { width } = useWindowDimensions();
  const numColumns = width >= 840 ? 3 : width >= 540 ? 2 : 1;

  const [projects, setProjects] = useState<SyncedProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const list = await fetchProjects(connection);
        setProjects(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [connection]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.logoMark}>
            <Ionicons name="film" size={16} color={colors.accentForeground} />
          </View>
          <Text style={styles.title}>MkBoard</Text>
        </View>
        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            onOpenSettings();
          }}
          style={styles.iconBtn}
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load(false)}>
            <Text style={styles.retryText}>重试</Text>
          </Pressable>
        </View>
      ) : null}

      {loading && projects.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <FlatList
          key={`cols-${numColumns}`}
          numColumns={numColumns}
          data={projects}
          keyExtractor={(item) => item.projectId}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={numColumns > 1 ? styles.gridRow : undefined}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void Haptics.selectionAsync();
                void load(true);
              }}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="cloud-upload-outline" size={34} color={colors.textMuted} />
              <Text style={styles.emptyText}>桌面端点击「同步手机」后下拉刷新</Text>
            </View>
          }
          renderItem={({ item }) => {
            const coverUri = withAuthQuery(item.coverUrl, connection);
            return (
              <Pressable
                onPress={() => {
                  void Haptics.selectionAsync();
                  onSelectProject(item);
                }}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
              >
                <View style={styles.cover}>
                  {coverUri ? (
                    <Image source={{ uri: coverUri }} style={styles.coverImg} contentFit="cover" transition={120} />
                  ) : (
                    <Ionicons name="film-outline" size={28} color={colors.textMuted} />
                  )}
                  <View style={styles.shotCountBadge}>
                    <Text style={styles.shotCountText}>{item.shotCount} 镜</Text>
                  </View>
                </View>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.name}
                </Text>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg
  },
  header: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9
  },
  logoMark: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center"
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 10,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft
  },
  errorText: {
    color: colors.danger,
    fontSize: 12.5
  },
  retryText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 12.5
  },
  gridContent: {
    padding: 16,
    gap: 14,
    flexGrow: 1
  },
  gridRow: {
    gap: 14
  },
  card: {
    flex: 1,
    gap: 8
  },
  cover: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center"
  },
  coverImg: {
    width: "100%",
    height: "100%"
  },
  shotCountBadge: {
    position: "absolute",
    right: 8,
    bottom: 8,
    backgroundColor: "rgba(17, 19, 23, 0.82)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full
  },
  shotCountText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.text,
    fontVariant: ["tabular-nums"]
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    paddingHorizontal: 2
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 32
  },
  emptyText: {
    fontSize: 13.5,
    color: colors.textSecondary
  }
});
