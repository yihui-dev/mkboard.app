import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { fetchStoryboard, formatDurationLabel, parseAspectRatio, withAuthQuery } from "../api";
import { InlineVideoPlayer } from "../components/InlineVideoPlayer";
import { VoiceoverBar } from "../components/VoiceoverBar";
import { colors, radius } from "../theme";
import type { SyncConnection, SyncedProjectSummary, SyncedShot, SyncedStoryboard } from "../types";

interface StoryboardScreenProps {
  connection: SyncConnection;
  project: SyncedProjectSummary;
  onBack: () => void;
}

export function StoryboardScreen({ connection, project, onBack }: StoryboardScreenProps) {
  const { width, height } = useWindowDimensions();
  // Foldable unfolded (e.g. ~700-900dp square/wide) or landscape phone -> split 2-column MkBoard layout
  const isWide = width >= 580 || (width > height && width >= 500);

  const [storyboard, setStoryboard] = useState<SyncedStoryboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [playingVideo, setPlayingVideo] = useState(false);
  const [playingAudio, setPlayingAudio] = useState(false);
  const [mediaIdx, setMediaIdx] = useState(0);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const listRef = useRef<FlatList<SyncedShot>>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const data = await fetchStoryboard(connection, project.projectId);
        setStoryboard(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [connection, project.projectId]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const shots = storyboard?.shots ?? [];
  const safeIndex = shots.length > 0 ? Math.min(selectedIndex, shots.length - 1) : 0;
  const activeShot = shots[safeIndex] ?? null;

  const activeMediaList = activeShot?.media ?? [];
  const safeMediaIdx = mediaIdx < activeMediaList.length ? mediaIdx : 0;
  const activeMedia = activeMediaList[safeMediaIdx] ?? null;

  const mediaUrl = activeMedia ? withAuthQuery(activeMedia.url, connection) : null;
  const posterUrl = activeMedia?.posterUrl ? withAuthQuery(activeMedia.posterUrl, connection) : null;
  const audioUrl = activeShot?.audio ? withAuthQuery(activeShot.audio.url, connection) : null;
  const aspectRatio = parseAspectRatio(storyboard?.imageRatio || project.imageRatio);

  const selectShot = useCallback(
    (nextIdx: number, shouldAutoPlay = true) => {
      if (shots.length === 0) return;
      const bounded = Math.max(0, Math.min(shots.length - 1, nextIdx));
      void Haptics.selectionAsync();
      setSelectedIndex(bounded);
      setMediaIdx(0);

      const target = shots[bounded];
      const hasVideo = Boolean(target?.media.some((m) => m.kind === "video"));
      const hasAudio = Boolean(target?.audio);

      if (shouldAutoPlay && hasVideo) {
        setPlayingAudio(false);
        setPlayingVideo(true);
      } else if (shouldAutoPlay && hasAudio) {
        setPlayingVideo(false);
        setPlayingAudio(true);
      } else {
        setPlayingVideo(false);
        setPlayingAudio(false);
      }

      try {
        listRef.current?.scrollToIndex({
          index: bounded,
          animated: true,
          viewPosition: 0.35
        });
      } catch {
        // ignore if list not measured yet
      }
    },
    [shots]
  );

  const handleMediaEnded = useCallback(() => {
    if (!autoAdvance) {
      setPlayingVideo(false);
      setPlayingAudio(false);
      return;
    }
    if (safeIndex + 1 < shots.length) {
      selectShot(safeIndex + 1, true);
    } else {
      setPlayingVideo(false);
      setPlayingAudio(false);
    }
  }, [autoAdvance, safeIndex, shots.length, selectShot]);

  function renderShotRow({ item, index }: { item: SyncedShot; index: number }) {
    const selected = index === safeIndex;
    const firstMedia = item.media[0] ?? null;
    const thumbUri = firstMedia
      ? withAuthQuery(firstMedia.kind === "video" ? firstMedia.posterUrl : firstMedia.url, connection)
      : null;
    const dur = formatDurationLabel(item.duration);
    const isARoll = /a-?roll|口播/i.test(item.scene);

    return (
      <Pressable
        onPress={() => selectShot(index, true)}
        style={({ pressed }) => [
          styles.shotRow,
          selected && styles.shotRowSelected,
          pressed && !selected && { backgroundColor: colors.surfaceSoft }
        ]}
      >
        {/* Left mini thumbnail */}
        <View style={[styles.rowThumb, selected && styles.rowThumbSelected]}>
          {thumbUri ? (
            <Image source={{ uri: thumbUri }} style={styles.fillImg} contentFit="cover" transition={100} />
          ) : (
            <Ionicons
              name={isARoll ? "person-outline" : "film-outline"}
              size={16}
              color={selected ? colors.accent : colors.textMuted}
            />
          )}
          <View style={[styles.rowNumTag, selected && styles.rowNumTagSelected]}>
            <Text style={[styles.rowNumText, selected && styles.rowNumTextSelected]}>
              {item.shotNumber.padStart(2, "0")}
            </Text>
          </View>
        </View>

        {/* Right concise snippet */}
        <View style={styles.rowBody}>
          <Text style={[styles.rowScript, selected && styles.rowScriptSelected]} numberOfLines={2}>
            {item.content.trim() || "—"}
          </Text>
          <View style={styles.rowMeta}>
            {dur ? <Text style={styles.rowMetaText}>{dur}</Text> : null}
            {item.audio ? <Ionicons name="volume-medium" size={12} color={selected ? colors.accent : colors.textMuted} /> : null}
            {isARoll ? <Text style={styles.rowARollDot}>口播</Text> : null}
          </View>
        </View>
      </Pressable>
    );
  }

  function renderVideoStage() {
    if (!activeShot) {
      return (
        <View style={styles.center}>
          <Text style={styles.mutedText}>暂无分镜</Text>
        </View>
      );
    }

    const isARoll = /a-?roll|口播/i.test(activeShot.scene);
    const dur = formatDurationLabel(activeShot.duration);

    return (
      <View style={styles.stagePane}>
        {/* Video / Frame Canvas */}
        <View style={[styles.canvasArea, isWide ? styles.canvasAreaWide : styles.canvasAreaCompact]}>
          {activeMedia && mediaUrl ? (
            <View
              style={[
                styles.mediaFrame,
                isWide
                  ? { aspectRatio: Math.max(0.6, Math.min(2.1, aspectRatio)), maxHeight: "100%", maxWidth: "100%" }
                  : { width: "100%", aspectRatio: Math.max(0.9, Math.min(2.0, aspectRatio)), maxHeight: Math.min(280, height * 0.36) }
              ]}
            >
              {activeMedia.kind === "video" ? (
                playingVideo ? (
                  <InlineVideoPlayer
                    key={`${activeShot.id}-${activeMedia.hash}`}
                    uri={mediaUrl}
                    autoPlay
                    onEnded={handleMediaEnded}
                  />
                ) : (
                  <Pressable
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setPlayingAudio(false);
                      setPlayingVideo(true);
                    }}
                    style={styles.fillBox}
                  >
                    {posterUrl ? (
                      <Image source={{ uri: posterUrl }} style={styles.fillImg} contentFit="contain" transition={120} />
                    ) : (
                      <View style={styles.fallbackFrame}>
                        <Ionicons name="film-outline" size={30} color={colors.textMuted} />
                      </View>
                    )}
                    <View style={styles.playOverlay}>
                      <View style={styles.playCircle}>
                        <Ionicons name="play" size={24} color={colors.accentForeground} style={{ marginLeft: 3 }} />
                      </View>
                    </View>
                  </Pressable>
                )
              ) : (
                <Pressable
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setPreviewImage(mediaUrl);
                  }}
                  style={styles.fillBox}
                >
                  <Image source={{ uri: mediaUrl }} style={styles.fillImg} contentFit="contain" transition={120} />
                </Pressable>
              )}
            </View>
          ) : (
            <View style={styles.aRollCanvas}>
              <Ionicons name={isARoll ? "person-circle-outline" : "film-outline"} size={28} color={colors.textMuted} />
              <Text style={styles.aRollTitle} numberOfLines={4}>
                {activeShot.content.trim() || "无画面"}
              </Text>
            </View>
          )}

          {activeMediaList.length > 1 ? (
            <View style={styles.multiDots}>
              {activeMediaList.map((m, idx) => (
                <Pressable
                  key={m.hash + idx}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setMediaIdx(idx);
                    setPlayingVideo(false);
                  }}
                  style={[styles.dotPill, idx === safeMediaIdx && styles.dotPillActive]}
                />
              ))}
            </View>
          ) : null}
        </View>

        {/* Minimal Script + Voiceover */}
        <View style={styles.captionArea}>
          <View style={styles.captionHeader}>
            <Text style={styles.shotNumLabel}>#{activeShot.shotNumber.padStart(2, "0")}</Text>
            {activeShot.scene ? <Text style={styles.sceneTag}>{activeShot.scene}</Text> : null}
            {dur ? <Text style={styles.durTag}>{dur}</Text> : null}
          </View>

          {activeMedia ? (
            <ScrollView style={styles.scriptScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.scriptMain} selectable>
                {activeShot.content.trim() || "—"}
              </Text>
            </ScrollView>
          ) : null}

          {activeShot.audio && audioUrl ? (
            <VoiceoverBar
              key={`${activeShot.id}-${activeShot.audio.hash}`}
              uri={audioUrl}
              active={playingAudio}
              onActivate={() => {
                setPlayingVideo(false);
                setPlayingAudio(true);
              }}
              onDeactivate={() => setPlayingAudio(false)}
              onEnded={handleMediaEnded}
            />
          ) : null}
        </View>

        {/* Minimal MkBoard-style Bottom Control Bar */}
        <View style={styles.controlsBar}>
          <Pressable
            disabled={safeIndex <= 0}
            onPress={() => selectShot(safeIndex - 1, true)}
            style={[styles.ctrlBtn, safeIndex <= 0 && styles.ctrlBtnDisabled]}
            hitSlop={6}
          >
            <Ionicons name="play-skip-back" size={18} color={colors.text} />
          </Pressable>

          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              setAutoAdvance((v) => !v);
            }}
            style={[styles.autoPill, autoAdvance && styles.autoPillActive]}
          >
            <Ionicons
              name={autoAdvance ? "play-forward" : "pause"}
              size={14}
              color={autoAdvance ? colors.accentForeground : colors.textSecondary}
            />
            <Text style={[styles.autoPillText, autoAdvance && styles.autoPillTextActive]}>
              {safeIndex + 1} / {shots.length}
            </Text>
          </Pressable>

          <Pressable
            disabled={safeIndex >= shots.length - 1}
            onPress={() => selectShot(safeIndex + 1, true)}
            style={[styles.ctrlBtn, safeIndex >= shots.length - 1 && styles.ctrlBtnDisabled]}
            hitSlop={6}
          >
            <Ionicons name="play-skip-forward" size={18} color={colors.text} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
      {/* Ultra-minimal 1-line Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            onBack();
          }}
          style={styles.headerBtn}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>

        <Text style={styles.headerTitle} numberOfLines={1}>
          {storyboard?.name || project.name}
        </Text>

        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            void load(true);
          }}
          style={styles.headerBtn}
          hitSlop={8}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons name="refresh" size={17} color={colors.textSecondary} />
          )}
        </Pressable>
      </View>

      {error ? (
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load(false)}>
            <Text style={styles.retryText}>重试</Text>
          </Pressable>
        </View>
      ) : null}

      {loading && !storyboard ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : isWide ? (
        /* Foldable / Landscape 2-column layout: Left = Storyboard list, Right = Video & Script */
        <View style={styles.splitContainer}>
          <View style={[styles.leftColumn, { width: Math.min(340, Math.max(230, Math.round(width * 0.36))) }]}>
            <FlatList
              ref={listRef}
              data={shots}
              keyExtractor={(item) => item.id}
              renderItem={renderShotRow}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              onScrollToIndexFailed={() => undefined}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => void load(true)}
                  tintColor={colors.accent}
                  colors={[colors.accent]}
                />
              }
            />
          </View>
          <View style={styles.rightColumn}>{renderVideoStage()}</View>
        </View>
      ) : (
        /* Compact portrait layout: Top = Video Stage, Bottom = Storyboard List */
        <View style={styles.portraitContainer}>
          <View style={styles.portraitTop}>{renderVideoStage()}</View>
          <View style={styles.portraitDivider} />
          <FlatList
            ref={listRef}
            data={shots}
            keyExtractor={(item) => item.id}
            renderItem={renderShotRow}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            onScrollToIndexFailed={() => undefined}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void load(true)}
                tintColor={colors.accent}
                colors={[colors.accent]}
              />
            }
          />
        </View>
      )}

      {/* Image Fullscreen Modal */}
      <Modal visible={Boolean(previewImage)} transparent animationType="fade" onRequestClose={() => setPreviewImage(null)}>
        <Pressable style={styles.lightbox} onPress={() => setPreviewImage(null)}>
          {previewImage ? <Image source={{ uri: previewImage }} style={styles.fillImg} contentFit="contain" /> : null}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg
  },
  header: {
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  headerBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  headerTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: colors.text
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  mutedText: {
    color: colors.textMuted,
    fontSize: 13
  },
  // Split 2-column (Foldable / Landscape)
  splitContainer: {
    flex: 1,
    flexDirection: "row"
  },
  leftColumn: {
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: colors.bg
  },
  rightColumn: {
    flex: 1,
    backgroundColor: "#0D0F13"
  },
  // Portrait fallback
  portraitContainer: {
    flex: 1
  },
  portraitTop: {
    backgroundColor: "#0D0F13"
  },
  portraitDivider: {
    height: 1,
    backgroundColor: colors.border
  },
  // Storyboard row
  listContent: {
    padding: 8,
    gap: 6
  },
  shotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: colors.surface
  },
  shotRowSelected: {
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft
  },
  rowThumb: {
    width: 78,
    height: 46,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSoft,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center"
  },
  rowThumbSelected: {
    borderWidth: 1,
    borderColor: colors.accent
  },
  rowNumTag: {
    position: "absolute",
    left: 4,
    top: 4,
    backgroundColor: "rgba(17, 19, 23, 0.82)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4
  },
  rowNumTagSelected: {
    backgroundColor: colors.accent
  },
  rowNumText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.text,
    fontVariant: ["tabular-nums"]
  },
  rowNumTextSelected: {
    color: colors.accentForeground
  },
  rowBody: {
    flex: 1,
    gap: 4
  },
  rowScript: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary
  },
  rowScriptSelected: {
    color: colors.text,
    fontWeight: "500"
  },
  rowMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  rowMetaText: {
    fontSize: 11,
    color: colors.textMuted,
    fontVariant: ["tabular-nums"]
  },
  rowARollDot: {
    fontSize: 10,
    color: colors.accent,
    fontWeight: "600"
  },
  // Video stage
  stagePane: {
    flex: 1,
    padding: 12,
    gap: 10,
    justifyContent: "space-between"
  },
  canvasArea: {
    alignItems: "center",
    justifyContent: "center"
  },
  canvasAreaWide: {
    flex: 1,
    minHeight: 180
  },
  canvasAreaCompact: {
    width: "100%"
  },
  mediaFrame: {
    width: "100%",
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: "#000000",
    borderWidth: 1,
    borderColor: colors.border
  },
  fillBox: {
    width: "100%",
    height: "100%"
  },
  fillImg: {
    width: "100%",
    height: "100%"
  },
  fallbackFrame: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface
  },
  playOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.2)"
  },
  playCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center"
  },
  aRollCanvas: {
    width: "100%",
    minHeight: 130,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 10
  },
  aRollTitle: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 25,
    textAlign: "center"
  },
  multiDots: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8
  },
  dotPill: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceSoft
  },
  dotPillActive: {
    width: 20,
    backgroundColor: colors.accent
  },
  // Caption & voiceover
  captionArea: {
    gap: 8
  },
  captionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  shotNumLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.accent,
    fontVariant: ["tabular-nums"]
  },
  sceneTag: {
    fontSize: 11,
    color: colors.textSecondary,
    backgroundColor: colors.surface,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6
  },
  durTag: {
    fontSize: 11,
    color: colors.textMuted,
    fontVariant: ["tabular-nums"]
  },
  scriptScroll: {
    maxHeight: 84
  },
  scriptMain: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 23
  },
  // Bottom controls
  controlsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingTop: 2
  },
  ctrlBtn: {
    width: 40,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center"
  },
  ctrlBtnDisabled: {
    opacity: 0.3
  },
  autoPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  autoPillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  autoPillText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textSecondary,
    fontVariant: ["tabular-nums"]
  },
  autoPillTextActive: {
    color: colors.accentForeground
  },
  lightbox: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.96)",
    justifyContent: "center"
  }
});
