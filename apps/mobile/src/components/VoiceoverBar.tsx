import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as Haptics from "expo-haptics";
import { colors, radius } from "../theme";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

interface ActiveAudioProps {
  uri: string;
  onStop: () => void;
  onEnded?: () => void;
}

function ActiveAudio({ uri, onStop, onEnded }: ActiveAudioProps) {
  const player = useAudioPlayer(uri, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  const startedRef = useRef(false);
  const endedFiredRef = useRef(false);

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      endedFiredRef.current = false;
      player.play();
    }
  }, [player, uri]);

  useEffect(() => {
    if (status.didJustFinish && !endedFiredRef.current) {
      endedFiredRef.current = true;
      onEnded?.();
    }
  }, [status.didJustFinish, onEnded]);

  const progress = status.duration > 0 ? Math.min(1, Math.max(0, status.currentTime / status.duration)) : 0;

  function togglePlay() {
    void Haptics.selectionAsync();
    if (status.playing) {
      player.pause();
    } else {
      if (status.duration > 0 && status.currentTime >= status.duration - 0.15) {
        void player.seekTo(0);
      }
      endedFiredRef.current = false;
      player.play();
    }
  }

  return (
    <View style={[styles.bar, styles.barActive]}>
      <Pressable onPress={togglePlay} style={[styles.btn, styles.btnActive]} hitSlop={8}>
        <Ionicons
          name={status.playing ? "pause" : "play"}
          size={14}
          color={colors.accentForeground}
          style={status.playing ? undefined : { marginLeft: 1.5 }}
        />
      </Pressable>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
      <Text style={styles.time}>
        {formatTime(status.currentTime)} / {formatTime(status.duration)}
      </Text>
      <Pressable
        onPress={() => {
          void Haptics.selectionAsync();
          player.pause();
          onStop();
        }}
        hitSlop={8}
      >
        <Ionicons name="close" size={15} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

export interface VoiceoverBarProps {
  uri: string;
  active: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onEnded?: () => void;
}

export function VoiceoverBar({ uri, active, onActivate, onDeactivate, onEnded }: VoiceoverBarProps) {
  if (active) {
    return <ActiveAudio uri={uri} onStop={onDeactivate} onEnded={onEnded} />;
  }

  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onActivate();
      }}
      style={({ pressed }) => [styles.bar, pressed && { opacity: 0.78 }]}
    >
      <View style={styles.btn}>
        <Ionicons name="volume-high" size={14} color={colors.accent} />
      </View>
      <View style={styles.track} />
      <Text style={styles.idleLabel}>配音</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  barActive: {
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft
  },
  btn: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center"
  },
  btnActive: {
    backgroundColor: colors.accent
  },
  track: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    overflow: "hidden"
  },
  fill: {
    height: "100%",
    backgroundColor: colors.accent
  },
  time: {
    fontSize: 11,
    color: colors.accent,
    fontVariant: ["tabular-nums"],
    marginRight: 2
  },
  idleLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
    paddingRight: 6
  }
});
