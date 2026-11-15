import { app } from "electron";
import electronUpdater, { type AppUpdater, type ProgressInfo, type UpdateInfo } from "electron-updater";
import { packagedAutoUpdateBaseUrl, packagedWebBaseUrl } from "./generated-runtime-defaults";
import type { DesktopVersionCheckResult } from "../shared";

const { autoUpdater } = electronUpdater;

type DesktopUpdaterOptions = {
  emit: (state: DesktopVersionCheckResult) => void;
  hasActiveWork: () => boolean;
  disabled?: boolean;
  updater?: AppUpdater;
};

export function resolveDesktopUpdateFeedUrl(override = process.env.MKBOARD_AUTO_UPDATE_BASE_URL): string | null {
  const explicit = override?.trim() || packagedAutoUpdateBaseUrl?.trim();
  if (!explicit) return null;
  return explicit.replace(/\/$/, "");
}

export class DesktopUpdater {
  private readonly updater: AppUpdater;
  private readonly emitState: DesktopUpdaterOptions["emit"];
  private readonly hasActiveWork: DesktopUpdaterOptions["hasActiveWork"];
  private readonly feedUrl: string | null;
  private readonly disabled: boolean;
  private state: DesktopVersionCheckResult;
  private checkPromise: Promise<DesktopVersionCheckResult> | null = null;
  private downloadPromise: Promise<DesktopVersionCheckResult> | null = null;
  private installAfterDownload = false;

  constructor(options: DesktopUpdaterOptions) {
    this.updater = options.updater ?? autoUpdater;
    this.emitState = options.emit;
    this.hasActiveWork = options.hasActiveWork;
    this.feedUrl = resolveDesktopUpdateFeedUrl();
    this.disabled = Boolean(
      options.disabled ||
        !this.feedUrl ||
        !app.isPackaged ||
        !["darwin", "win32", "linux"].includes(process.platform)
    );
    const baseDownloadUrl = packagedWebBaseUrl.includes("github.com")
      ? `${packagedWebBaseUrl.replace(/\/$/, "")}/releases`
      : new URL("/download", packagedWebBaseUrl).toString();
    this.state = createDesktopUpdateState({
      status: "idle",
      currentVersion: app.getVersion(),
      latestVersion: null,
      downloadUrl: baseDownloadUrl,
      updateAvailable: false,
      checkedAt: null,
      downloadProgress: null,
      installBlocked: false
    });
    if (!this.disabled) this.configureUpdater();
  }

  getState(): DesktopVersionCheckResult {
    return this.state;
  }

  async checkForUpdates(): Promise<DesktopVersionCheckResult> {
    if (this.disabled) {
      return this.updateState({
        status: "current",
        latestVersion: this.state.currentVersion,
        updateAvailable: false,
        checkedAt: new Date().toISOString(),
        message: undefined
      });
    }
    if (this.checkPromise) return this.checkPromise;
    this.checkPromise = this.runUpdateCheck().finally(() => {
      this.checkPromise = null;
    });
    return this.checkPromise;
  }

  async startUpdate(): Promise<DesktopVersionCheckResult> {
    if (this.disabled) return this.checkForUpdates();
    if (this.state.status === "update_downloaded") return this.installUpdate();
    if (this.downloadPromise) return this.downloadPromise;

    if (!this.state.updateAvailable) {
      const checked = await this.checkForUpdates();
      if (!checked.updateAvailable) return checked;
    }

    this.installAfterDownload = true;
    this.updateState({ status: "downloading", downloadProgress: this.state.downloadProgress ?? emptyProgress(), message: undefined, installBlocked: false });
    this.downloadPromise = this.updater
      .downloadUpdate()
      .then(() => this.state)
      .catch((error) => this.fail(error))
      .finally(() => {
        this.downloadPromise = null;
      });
    return this.downloadPromise;
  }

  installUpdate(): DesktopVersionCheckResult {
    if (this.state.status !== "update_downloaded") return this.state;
    if (this.hasActiveWork()) {
      this.installAfterDownload = false;
      return this.updateState({ installBlocked: true, message: "active-work" });
    }

    this.installAfterDownload = false;
    const state = this.updateState({ status: "installing", installBlocked: false, message: undefined });
    setTimeout(() => this.updater.quitAndInstall(false, true), 250);
    return state;
  }

  private configureUpdater(): void {
    if (!this.feedUrl) return;
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = true;
    this.updater.autoRunAppAfterInstall = true;
    this.updater.allowDowngrade = false;
    this.updater.allowPrerelease = false;
    this.updater.logger = {
      info: (message?: unknown) => console.info("[MkBoard][Updater]", message),
      warn: (message?: unknown) => console.warn("[MkBoard][Updater]", message),
      error: (message?: unknown) => console.error("[MkBoard][Updater]", message),
      debug: (message: string) => console.debug("[MkBoard][Updater]", message)
    };
    this.updater.setFeedURL({ provider: "generic", url: this.feedUrl });
    this.updater.on("checking-for-update", () => {
      this.updateState({ status: "checking", checkedAt: new Date().toISOString(), message: undefined, installBlocked: false });
    });
    this.updater.on("update-available", (info: UpdateInfo) => {
      this.updateState({
        status: "update_available",
        latestVersion: info.version,
        updateAvailable: true,
        checkedAt: new Date().toISOString(),
        downloadProgress: null,
        message: undefined,
        installBlocked: false
      });
    });
    this.updater.on("update-not-available", (info: UpdateInfo) => {
      this.updateState({
        status: "current",
        latestVersion: info.version || this.state.currentVersion,
        updateAvailable: false,
        checkedAt: new Date().toISOString(),
        downloadProgress: null,
        message: undefined,
        installBlocked: false
      });
    });
    this.updater.on("download-progress", (progress: ProgressInfo) => {
      this.updateState({
        status: "downloading",
        updateAvailable: true,
        downloadProgress: {
          percent: clampPercent(progress.percent),
          bytesPerSecond: finiteNumber(progress.bytesPerSecond),
          transferred: finiteNumber(progress.transferred),
          total: finiteNumber(progress.total)
        }
      });
    });
    this.updater.on("update-downloaded", (info) => {
      const size = finiteNumber(info.files?.[0]?.size);
      this.updateState({
        status: "update_downloaded",
        latestVersion: info.version,
        updateAvailable: true,
        downloadProgress: { percent: 100, bytesPerSecond: 0, transferred: size, total: size },
        message: undefined,
        installBlocked: false
      });
      if (this.installAfterDownload) setTimeout(() => this.installUpdate(), 250);
    });
    this.updater.on("update-cancelled", () => {
      this.installAfterDownload = false;
      this.updateState({ status: "update_available", downloadProgress: null, message: "cancelled" });
    });
    this.updater.on("error", (error) => {
      this.installAfterDownload = false;
      this.fail(error);
    });
  }

  private async runUpdateCheck(): Promise<DesktopVersionCheckResult> {
    this.updateState({ status: "checking", checkedAt: new Date().toISOString(), message: undefined, installBlocked: false });
    try {
      await this.updater.checkForUpdates();
      return this.state;
    } catch (error) {
      return this.fail(error);
    }
  }

  private fail(error: unknown): DesktopVersionCheckResult {
    return this.updateState({
      status: "unavailable",
      updateAvailable: false,
      downloadProgress: null,
      message: error instanceof Error ? error.message : String(error),
      installBlocked: false,
      checkedAt: new Date().toISOString()
    });
  }

  private updateState(patch: Partial<DesktopVersionCheckResult>): DesktopVersionCheckResult {
    this.state = createDesktopUpdateState({ ...this.state, ...patch });
    this.emitState(this.state);
    return this.state;
  }
}

function createDesktopUpdateState(state: DesktopVersionCheckResult): DesktopVersionCheckResult {
  return {
    ...state,
    downloadProgress: state.downloadProgress ? { ...state.downloadProgress } : null
  };
}

function emptyProgress() {
  return { percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 };
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, finiteNumber(value)));
}

function finiteNumber(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
