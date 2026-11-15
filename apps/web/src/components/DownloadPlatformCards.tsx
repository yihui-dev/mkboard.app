import { useEffect, useRef, useState } from "react";
import type { Locale } from "../lib/i18n";

type Platform = "mac" | "windows" | "unknown";

type Props = {
  locale: Locale;
  className?: string;
  showHint?: boolean;
  autoDownloadCurrentSystem?: boolean;
  autoDownloadMac?: boolean;
};

const macDownloadUrl = import.meta.env.PUBLIC_MAC_DOWNLOAD_URL ?? "/downloads/MkBoard.dmg";
const windowsDownloadUrl = import.meta.env.PUBLIC_WINDOWS_DOWNLOAD_URL ?? "";

const downloadCopy = {
  zh: {
    title: "下载 MkBoard 桌面端",
    detecting: "正在识别你的系统...",
    currentSystem: "本系统",
    macTitle: "Mac 版（Apple 芯片）",
    macCopy: "适用于 M 系列芯片 Mac",
    windowsTitle: "Windows 版",
    windowsCopy: "即将开放",
    macPackage: "Apple 芯片专用 .dmg",
    windowsPackage: "Windows x64 · 需约 1.5 GB 安装空间",
    macButton: "下载 M 系列 Mac 版",
    windowsButton: "Coming Soon",
    macHint: "已识别为 macOS。点击下载 Apple 芯片（M 系列）Mac 安装包。",
    macAutoHint: "已识别为 macOS，已自动开始下载 Apple 芯片（M 系列）Mac 安装包。",
    windowsHint: "Windows 版即将开放，目前请使用 Apple 芯片（M 系列）Mac 版。",
    windowsAutoHint: "Windows 版即将开放，目前请使用 Apple 芯片（M 系列）Mac 版。",
    windowsAvailableCopy: "适用于 Windows 10/11 x64",
    windowsAvailableButton: "下载 Windows x64 版",
    windowsAvailableHint: "已识别为 Windows。点击下载 Windows 10/11 x64 安装包。",
    windowsAvailableAutoHint: "已识别为 Windows，已自动开始下载 Windows 10/11 x64 安装包。",
    unknownHint: "暂未识别系统，请选择适合你的安装包。"
  },
  en: {
    title: "Download MkBoard Desktop",
    detecting: "Detecting your system...",
    currentSystem: "This system",
    macTitle: "Mac version (Apple silicon)",
    macCopy: "For Apple silicon Macs",
    windowsTitle: "Windows version",
    windowsCopy: "Coming soon",
    macPackage: "Apple silicon .dmg",
    windowsPackage: "Windows x64 · about 1.5 GB disk space",
    macButton: "Download for Apple silicon Mac",
    windowsButton: "Coming Soon",
    macHint: "Detected macOS. Click to download the Apple silicon Mac installer.",
    macAutoHint: "Detected macOS. The Apple silicon Mac installer download has started automatically.",
    windowsHint: "Windows is coming soon. Use the Apple silicon Mac build for now.",
    windowsAutoHint: "Windows is coming soon. Use the Apple silicon Mac build for now.",
    windowsAvailableCopy: "For Windows 10/11 x64",
    windowsAvailableButton: "Download for Windows x64",
    windowsAvailableHint: "Detected Windows. Click to download the Windows 10/11 x64 installer.",
    windowsAvailableAutoHint: "Detected Windows. The Windows 10/11 x64 installer download has started automatically.",
    unknownHint: "System not detected. Choose the installer for your platform."
  }
} as const;

function detectPlatform(): Platform {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = `${nav.userAgentData?.platform || ""}`.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();
  if (platform.includes("mac") || userAgent.includes("mac os")) return "mac";
  if (platform.includes("win") || userAgent.includes("windows")) return "windows";
  return "unknown";
}

function startDownload(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = "";
  link.rel = "noopener noreferrer";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
}

export function DownloadPlatformCards({
  locale,
  className = "",
  showHint = true,
  autoDownloadCurrentSystem,
  autoDownloadMac = false
}: Props) {
  const copy = downloadCopy[locale];
  const [detectedPlatform, setDetectedPlatform] = useState<Platform | null>(null);
  const autoDownloadStartedRef = useRef(false);
  const shouldAutoDownloadCurrentSystem = autoDownloadCurrentSystem ?? autoDownloadMac;
  const platformHint =
    detectedPlatform === "windows"
      ? windowsDownloadUrl
        ? shouldAutoDownloadCurrentSystem
          ? copy.windowsAvailableAutoHint
          : copy.windowsAvailableHint
        : copy.windowsHint
      : detectedPlatform === "mac"
        ? shouldAutoDownloadCurrentSystem
          ? copy.macAutoHint
          : copy.macHint
        : detectedPlatform === "unknown"
          ? copy.unknownHint
          : copy.detecting;

  useEffect(() => {
    const platform = detectPlatform();
    setDetectedPlatform(platform);

    const downloadUrl = platform === "mac" ? macDownloadUrl : platform === "windows" ? windowsDownloadUrl : "";
    if (!shouldAutoDownloadCurrentSystem || !downloadUrl || autoDownloadStartedRef.current) return;

    const timer = window.setTimeout(() => {
      if (autoDownloadStartedRef.current) return;
      autoDownloadStartedRef.current = true;
      startDownload(downloadUrl);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [shouldAutoDownloadCurrentSystem]);

  const cards = [
    {
      id: "mac" as const,
      href: macDownloadUrl,
      iconClassName: "mac-icon",
      iconSrc: "/images/icons/macos-download.svg",
      title: copy.macTitle,
      body: copy.macCopy,
      packageLabel: copy.macPackage,
      action: copy.macButton,
      hint: copy.macHint,
      unavailable: false
    },
    {
      id: "windows" as const,
      href: windowsDownloadUrl,
      iconClassName: "windows-icon",
      iconSrc: "/images/icons/windows-download.svg",
      title: copy.windowsTitle,
      body: windowsDownloadUrl ? copy.windowsAvailableCopy : copy.windowsCopy,
      packageLabel: copy.windowsPackage,
      action: windowsDownloadUrl ? copy.windowsAvailableButton : copy.windowsButton,
      hint: windowsDownloadUrl ? copy.windowsAvailableHint : copy.windowsHint,
      unavailable: !windowsDownloadUrl
    }
  ];

  return (
    <div className={["download-platform-block", className].filter(Boolean).join(" ")}>
      {showHint ? (
        <p className="download-platform-hint" aria-live="polite">
          {platformHint}
        </p>
      ) : null}
      <div className="download-options" aria-label={copy.title}>
        {cards.map((card) => {
          const isCurrentSystem = detectedPlatform === card.id;
          const cardClassName = [
            "download-option platform-card",
            isCurrentSystem ? "is-current-system" : "",
            card.unavailable ? "is-unavailable" : ""
          ]
            .filter(Boolean)
            .join(" ");
          const ariaLabel = isCurrentSystem ? `${card.title}, ${card.hint}` : undefined;
          const cardContent = (
            <>
              <span className="current-system-pill">{copy.currentSystem}</span>
              <span className={`platform-icon ${card.iconClassName}`} aria-hidden="true">
                <img src={card.iconSrc} alt="" loading="eager" />
              </span>
              <strong>{card.title}</strong>
              <span>{card.body}</span>
              <em>{card.packageLabel}</em>
              <span className="platform-action">{card.action}</span>
            </>
          );

          if (card.unavailable) {
            return (
              <button
                className={cardClassName}
                type="button"
                disabled
                data-platform-card={card.id}
                aria-label={ariaLabel}
                key={card.id}
              >
                {cardContent}
              </button>
            );
          }

          return (
            <a
              className={cardClassName}
              href={card.href}
              data-platform-card={card.id}
              aria-label={ariaLabel}
              key={card.id}
            >
              {cardContent}
            </a>
          );
        })}
      </div>
    </div>
  );
}
