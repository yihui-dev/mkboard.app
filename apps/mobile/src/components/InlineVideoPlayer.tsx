import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { colors } from "../theme";

interface InlineVideoPlayerProps {
  uri: string;
  autoPlay?: boolean;
  onEnded?: () => void;
}

export function InlineVideoPlayer({ uri, autoPlay = true, onEnded }: InlineVideoPlayerProps) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    if (autoPlay) p.play();
  });

  useEffect(() => {
    const sub = player.addListener("playToEnd", () => {
      onEnded?.();
    });
    return () => {
      sub.remove();
    };
  }, [player, onEnded]);

  return (
    <View style={styles.container}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        nativeControls
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#000000"
  },
  video: {
    width: "100%",
    height: "100%"
  }
});
