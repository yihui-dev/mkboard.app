import type { TastePreview } from "../shared";

export type SystemTasteSeed = {
  id: string;
  name: string;
  description: string;
  sourceUrl: string;
  preview: TastePreview;
  content: string;
};

export const defaultTasteId = "taste-auto-adaptive";

export const systemTasteSeeds: SystemTasteSeed[] = [
  {
    id: defaultTasteId,
    name: "Auto Adaptive",
    description: "Follow the active skill, imported template, or script context without forcing a preset style.",
    sourceUrl: "mkboard://system/auto-adaptive",
    preview: {
      background: "#F8FAFC",
      foreground: "#0F172A",
      accent: "#EFB72E"
    },
    content: ""
  }
];
