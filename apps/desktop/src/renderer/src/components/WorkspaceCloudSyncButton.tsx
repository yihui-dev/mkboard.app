import { useEffect, useState } from "react";
import { AlertCircle, Check, LoaderCircle, UploadCloud } from "lucide-react";
import type { CloudSyncConfigSnapshot, CloudSyncProgressEvent } from "../../../shared";

export function WorkspaceCloudSyncButton({
  projectId,
  speechVoiceId,
  isEn,
  onOpenSyncSettings
}: {
  projectId: string;
  speechVoiceId: string;
  isEn: boolean;
  onOpenSyncSettings: () => void;
}) {
  const [config, setConfig] = useState<CloudSyncConfigSnapshot | null>(null);
  const [progress, setProgress] = useState<CloudSyncProgressEvent | null>(null);

  useEffect(() => {
    let alive = true;
    window.mkboard
      ?.getCloudSyncConfig?.()
      .then((snap) => {
        if (alive && snap) setConfig(snap);
      })
      .catch(() => undefined);

    const unsubscribe = window.mkboard?.onCloudSyncProgress?.((event) => {
      if (event.projectId !== projectId) return;
      setProgress(event);
      if (event.status === "synced") {
        window.mkboard
          ?.getCloudSyncConfig?.()
          .then((snap) => {
            if (alive && snap) setConfig(snap);
          })
          .catch(() => undefined);
      }
    });

    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [projectId]);

  const busy = progress?.status === "scanning" || progress?.status === "uploading" || progress?.status === "finalizing";
  const lastRecord = config?.lastSyncedByProject?.[projectId] ?? null;

  async function handleClick() {
    if (!window.mkboard?.syncProjectToCloud) return;
    const latestConfig = (await window.mkboard.getCloudSyncConfig?.().catch(() => config)) ?? config;
    setConfig(latestConfig);
    if (!latestConfig?.configured) {
      onOpenSyncSettings();
      return;
    }
    if (busy) return;
    setProgress({ projectId, status: "scanning", message: isEn ? "Preparing..." : "准备同步..." });
    await window.mkboard.syncProjectToCloud(projectId, { speechVoiceId: speechVoiceId || undefined });
  }

  let label = isEn ? "Sync" : "同步手机";
  if (progress?.status === "uploading" && progress.total) {
    label = `${progress.current ?? 0}/${progress.total}`;
  } else if (busy) {
    label = isEn ? "Syncing..." : "同步中...";
  } else if (progress?.status === "synced") {
    label = isEn ? "Synced" : "已同步";
  } else if (progress?.status === "error") {
    label = isEn ? "Sync Failed" : "同步失败";
  } else if (lastRecord) {
    label = isEn ? "Sync" : "同步手机";
  }

  const title =
    progress?.message ||
    (lastRecord
      ? isEn
        ? `Last synced rev.${lastRecord.revision} (${lastRecord.shotCount} shots)`
        : `上次同步 v${lastRecord.revision}（${lastRecord.shotCount} 镜），点击再次增量同步`
      : config?.configured
        ? isEn
          ? "Sync storyboard to Cloudflare R2 for mobile review"
          : "一键同步当前分镜到手机端（Cloudflare R2）"
        : isEn
          ? "Configure Cloudflare R2 Sync"
          : "配置 Cloudflare R2 手机同步");

  return (
    <button
      className="workspace-demo-trigger"
      type="button"
      title={title}
      disabled={busy}
      onClick={() => void handleClick()}
      onContextMenu={(event) => {
        event.preventDefault();
        onOpenSyncSettings();
      }}
    >
      {busy ? (
        <LoaderCircle className="spinning" aria-hidden="true" />
      ) : progress?.status === "synced" ? (
        <Check aria-hidden="true" />
      ) : progress?.status === "error" ? (
        <AlertCircle aria-hidden="true" />
      ) : (
        <UploadCloud aria-hidden="true" />
      )}
      <span>{label}</span>
    </button>
  );
}
