export interface SyncConnection {
  workerUrl: string;
  syncToken: string;
}

export interface SyncedProjectSummary {
  projectId: string;
  name: string;
  icon: string;
  imageRatio: string;
  coverHash?: string | null;
  coverUrl?: string | null;
  shotCount: number;
  updatedAt: string;
  syncedAt: string;
  revision: number;
}

export interface SyncedShotMedia {
  kind: "image" | "video";
  hash: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  url: string;
  posterHash?: string | null;
  posterUrl?: string | null;
  hasEmbeddedAudio?: boolean;
}

export interface SyncedShotAudio {
  source: "elevenlabs-cache" | "project-asset";
  hash: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  url: string;
}

export interface SyncedShot {
  id: string;
  position: number;
  shotNumber: string;
  scene: string;
  duration: string;
  content: string;
  note: string;
  generationMethod?: string;
  media: SyncedShotMedia[];
  audio: SyncedShotAudio | null;
}

export interface SyncedStoryboard {
  schemaVersion: 1;
  projectId: string;
  name: string;
  icon: string;
  imageRatio: string;
  coverHash?: string | null;
  coverUrl?: string | null;
  updatedAt: string;
  syncedAt: string;
  revision: number;
  shotCount: number;
  shots: SyncedShot[];
}
