import { useEffect, useState } from "react";
import { Check, CircleCheck, Copy, LoaderCircle, QrCode, Smartphone, Trash2, UploadCloud } from "lucide-react";
import type { CloudSyncConfigSnapshot, CloudSyncTestResult } from "../../../shared";
import { cn } from "../lib/utils";

export function CloudSyncSettingsPanel({ isEn }: { isEn: boolean }) {
  const [snapshot, setSnapshot] = useState<CloudSyncConfigSnapshot | null>(null);
  const [workerUrl, setWorkerUrl] = useState("");
  const [syncToken, setSyncToken] = useState("");
  const [autoSync, setAutoSync] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<CloudSyncTestResult | null>(null);
  const [copiedPairing, setCopiedPairing] = useState(false);

  useEffect(() => {
    let alive = true;
    window.mkboard
      ?.getCloudSyncConfig?.()
      .then((data) => {
        if (!alive || !data) return;
        setSnapshot(data);
        setWorkerUrl(data.workerUrl || "");
        setAutoSync(data.autoSync);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  async function handleSave() {
    if (!window.mkboard?.saveCloudSyncConfig) return;
    setSaving(true);
    setTestResult(null);
    try {
      const next = await window.mkboard.saveCloudSyncConfig({
        workerUrl: workerUrl.trim(),
        syncToken: syncToken.trim() || undefined,
        autoSync
      });
      setSnapshot(next);
      setWorkerUrl(next.workerUrl);
      setAutoSync(next.autoSync);
      setSyncToken("");
      setTestResult({ ok: true, message: isEn ? "Saved" : "已保存配置" });
    } catch (error) {
      setTestResult({ ok: false, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleAutoSync(nextValue: boolean) {
    setAutoSync(nextValue);
    if (!window.mkboard?.saveCloudSyncConfig) return;
    try {
      const next = await window.mkboard.saveCloudSyncConfig({
        workerUrl: workerUrl.trim() || snapshot?.workerUrl || "",
        autoSync: nextValue
      });
      setSnapshot(next);
    } catch {
      // ignore
    }
  }

  async function handleTest() {
    if (!window.mkboard?.testCloudSyncConnection) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await window.mkboard.testCloudSyncConnection({
        workerUrl: workerUrl.trim() || undefined,
        syncToken: syncToken.trim() || undefined
      });
      setTestResult(res);
    } catch (error) {
      setTestResult({ ok: false, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setTesting(false);
    }
  }

  async function handleClear() {
    if (!window.mkboard?.clearCloudSyncConfig) return;
    setSaving(true);
    try {
      const next = await window.mkboard.clearCloudSyncConfig();
      setSnapshot(next);
      setWorkerUrl("");
      setSyncToken("");
      setAutoSync(false);
      setTestResult(null);
    } finally {
      setSaving(false);
    }
  }

  function handleCopyPairing() {
    if (!snapshot?.pairingUri) return;
    void navigator.clipboard.writeText(snapshot.pairingUri).then(() => {
      setCopiedPairing(true);
      setTimeout(() => setCopiedPairing(false), 1800);
    });
  }

  const qrDataUri = snapshot?.qrSvg
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(snapshot.qrSvg)}`
    : null;
  const syncedEntries = Object.entries(snapshot?.lastSyncedByProject ?? {});

  return (
    <section className="profile-settings-section" aria-labelledby="cloud-sync-settings-title">
      <header className="execution-settings-header">
        <h1 id="cloud-sync-settings-title">{isEn ? "Mobile Cloud Sync (Cloudflare R2)" : "手机审片 · 云同步 (Cloudflare R2)"}</h1>
      </header>

      <div className="byok-provider-grid">
        <article className="byok-provider-card">
          <div className="byok-provider-head">
            <div className="byok-provider-title">
              <UploadCloud size={18} aria-hidden="true" />
              <strong>{isEn ? "Self-Hosted Sync Worker" : "自建 Cloudflare Sync Worker"}</strong>
              <span className={cn("byok-badge", snapshot?.configured && "ready", snapshot?.source === "env" && "env")}>
                {snapshot?.source === "env"
                  ? "ENV"
                  : snapshot?.configured
                    ? `${isEn ? "Connected" : "已配置"} · ${snapshot.maskedToken || "***"}`
                    : isEn
                      ? "Not configured"
                      : "未配置"}
              </span>
            </div>
          </div>

          <p className="byok-provider-desc">
            {isEn
              ? "Syncs only active storyboard frames, videos, voiceover audio, and script text to your own Cloudflare R2 bucket for instant review in the MkBoard Android app."
              : "仅同步分镜当前选中的画面/视频、配音音频与脚本文字到你自己的 Cloudflare R2，手机端打开即可逐镜审片（自动跳过历史废片）。"}
          </p>

          <div className="byok-provider-inputs">
            <input
              type="url"
              className="byok-input"
              placeholder={isEn ? "Worker URL, e.g. https://mkboard-sync.yourname.workers.dev" : "Worker 地址，如 https://mkboard-sync.xxx.workers.dev"}
              value={workerUrl}
              onChange={(e) => setWorkerUrl(e.target.value)}
            />
            <input
              type="password"
              className="byok-input"
              placeholder={
                snapshot?.configured
                  ? `${snapshot.maskedToken || "••••••••"} (${isEn ? "enter new token to replace" : "留空保留原密钥，输入可覆盖"})`
                  : isEn
                    ? "SYNC_TOKEN secret"
                    : "同步密钥 (SYNC_TOKEN)"
              }
              value={syncToken}
              onChange={(e) => setSyncToken(e.target.value)}
            />
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 12,
              fontSize: 13,
              cursor: "pointer",
              userSelect: "none"
            }}
          >
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => void handleToggleAutoSync(e.target.checked)}
            />
            <span>
              {isEn
                ? "Auto-sync incrementally after storyboard edits (3s debounce)"
                : "修改分镜后自动增量同步（3 秒防抖，仅传变动素材）"}
            </span>
          </label>

          <div className="byok-provider-actions" style={{ marginTop: 14 }}>
            <div className="byok-btn-group">
              <button
                className="local-cli-action"
                type="button"
                disabled={saving || !workerUrl.trim()}
                onClick={() => void handleSave()}
              >
                {saving ? <LoaderCircle className="spinning" aria-hidden="true" /> : <Check aria-hidden="true" />}
                {isEn ? "Save" : "保存"}
              </button>
              <button
                className="local-cli-action"
                type="button"
                disabled={testing || (!snapshot?.configured && (!workerUrl.trim() || !syncToken.trim()))}
                onClick={() => void handleTest()}
              >
                {testing ? <LoaderCircle className="spinning" aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
                {isEn ? "Test Connection" : "测试连接"}
              </button>
              {snapshot?.source === "stored" ? (
                <button className="local-cli-action" type="button" disabled={saving} onClick={() => void handleClear()}>
                  <Trash2 aria-hidden="true" />
                  {isEn ? "Clear" : "清除"}
                </button>
              ) : null}
            </div>
            {testResult ? (
              <span className={cn("byok-test-feedback", testResult.ok ? "ok" : "err")}>{testResult.message}</span>
            ) : null}
          </div>
        </article>

        {snapshot?.configured && snapshot.pairingUri ? (
          <article className="byok-provider-card">
            <div className="byok-provider-head">
              <div className="byok-provider-title">
                <Smartphone size={18} aria-hidden="true" />
                <strong>{isEn ? "Pair Android App" : "手机端扫码配对"}</strong>
              </div>
              <button className="local-cli-action" type="button" onClick={handleCopyPairing}>
                {copiedPairing ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copiedPairing ? (isEn ? "Copied" : "已复制配对码") : isEn ? "Copy Pairing URI" : "复制配对码"}
              </button>
            </div>
            <p className="byok-provider-desc">
              {isEn
                ? "Open MkBoard Mobile on Android and scan this QR code (or paste the pairing code) to connect instantly."
                : "打开手机上的 MkBoard Mobile，扫描下方二维码（或点右上角复制配对码直接粘贴），即可自动填入地址和密钥。"}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 12 }}>
              {qrDataUri ? (
                <img
                  src={qrDataUri}
                  alt="MkBoard Mobile Pairing QR"
                  style={{
                    width: 148,
                    height: 148,
                    borderRadius: 12,
                    background: "#ffffff",
                    padding: 8,
                    border: "1px solid rgba(128,128,128,0.2)"
                  }}
                />
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 6, opacity: 0.7, fontSize: 13 }}>
                  <QrCode size={18} aria-hidden="true" />
                  <span>{isEn ? "QR unavailable for very long URL; copy pairing code instead." : "地址较长，请直接点击右上角复制配对码。"}</span>
                </div>
              )}
              <div style={{ fontSize: 12, opacity: 0.8, lineHeight: 1.6 }}>
                <div>
                  <strong>{isEn ? "Worker:" : "同步地址："}</strong> {snapshot.workerUrl}
                </div>
                <div>
                  <strong>{isEn ? "Synced projects:" : "已同步项目："}</strong> {syncedEntries.length}
                </div>
              </div>
            </div>
          </article>
        ) : null}
      </div>
    </section>
  );
}
