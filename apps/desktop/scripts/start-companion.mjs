#!/usr/bin/env node
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MkboardStore } from "../src/main/database.ts";
import { ByokStore } from "../src/main/byok-store.ts";
import { LocalAiMediaService } from "../src/main/local-ai-media.ts";
import { ElevenLabsService } from "../src/main/elevenlabs.ts";
import { CompanionServer } from "../src/main/companion-server.ts";
import { getCodexCliStatus, scanLocalCliAgents, startClaudeCodeLogin, startCodexCliLogin, testHyperframesDoctor } from "../src/main/codex-auth.ts";
import { createMcpToolHandler } from "../src/main/mcp/host.ts";
import { MKBOARD_MCP_TOOLS } from "../src/main/mcp/tools.ts";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, "..");
const rendererDistDir = join(desktopRoot, "out", "renderer");

const argv = process.argv.slice(2);
const wantLan = argv.includes("--lan") || argv.includes("--network");
const portFlagIndex = argv.findIndex((a) => a === "--port" || a === "-p");
const requestedPort = portFlagIndex >= 0 ? Number.parseInt(argv[portFlagIndex + 1] || "3780", 10) : Number.parseInt(process.env.MKBOARD_COMPANION_PORT || "3780", 10);

const dataDir = process.env.MKBOARD_DATA_DIR?.trim() || join(homedir(), ".mkboard");
const projectsDir = process.env.MKBOARD_PROJECTS_DIR?.trim() || join(homedir(), "Documents", "MkBoard Projects");

const store = new MkboardStore(join(dataDir, "mkboard.sqlite"), projectsDir);
const byokStore = new ByokStore(dataDir);
const localAiMedia = new LocalAiMediaService(dataDir, byokStore);
const elevenLabs = new ElevenLabsService(dataDir, byokStore);

let activeView = { projectId: null, interfaceLanguage: "zh-CN", agentCliId: "codex" };
let companion = null;

const handleMcpTool = createMcpToolHandler({
  store,
  getActiveView: () => activeView,
  openProject: async (projectId, tab) => {
    activeView = { ...activeView, projectId, tab };
    companion?.broadcastEvent("mcp-open-project", { projectId, tab });
  },
  notifyProjectChanged: (projectId, tool) => {
    companion?.broadcastEvent("project-changed-externally", { projectId, source: "mcp", tool });
  },
  listTemplates: (lang) => store.listTemplates(lang),
  listSkills: (lang) => store.listSkills(lang),
  listTastes: () => store.listTastes(),
  createProject: (input) => store.createProject({ ...input, icon: "", tasteId: "" }),
  speech: {
    getStatus: () => elevenLabs.getStatus(),
    listVoices: () => elevenLabs.listVoices(),
    synthesize: (input) => elevenLabs.synthesizeSpeechAudio(input)
  },
  downloadsDir: join(homedir(), "Downloads")
});

companion = new CompanionServer({
  dataDir,
  rendererDistDir,
  defaultMode: wantLan ? "network-accessible" : "local-only",
  defaultPort: requestedPort,
  resolveAssetPath: async (assetId, poster, firstFrame) => firstFrame ? ((await store.resolveAssetFirstFramePath(assetId)) ?? store.resolveAssetPosterPath(assetId)) : (poster ? store.resolveAssetPosterPath(assetId) : store.resolveAssetPreviewPath(assetId)),
  handleMcpRequest: async (message) => {
    const id = "id" in message ? message.id : undefined;
    const method = typeof message.method === "string" ? message.method : "";
    if (id === undefined) return null;
    if (method === "initialize") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "mkboard-web", version: "0.3.0" }
        }
      };
    }
    if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
    if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: MKBOARD_MCP_TOOLS } };
    if (method === "tools/call") {
      const params = message.params || {};
      try {
        const res = await handleMcpTool(String(params.name || ""), params.arguments || {});
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] } };
      } catch (err) {
        return { jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }] } };
      }
    }
    return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
  },
  dispatchRpc: async (method, args) => {
    switch (method) {
      case "getCodexStatus": return getCodexCliStatus();
      case "connectCodex": return startCodexCliLogin();
      case "connectClaudeCode": return startClaudeCodeLogin();
      case "scanLocalCliAgents": return scanLocalCliAgents();
      case "testHyperframesDoctor": return testHyperframesDoctor();
      case "getByokSettings": return byokStore.getSnapshot();
      case "saveByokProvider": return byokStore.saveProvider(args[0]);
      case "clearByokProvider": return byokStore.clearProviderKey(args[0]);
      case "setByokActiveProviders": return byokStore.setActiveProviders(args[0]);
      case "testByokProvider": return byokStore.testProvider(args[0], args[1]);
      case "getCompanionStatus": return companion.getStatus();
      case "setCompanionMode": return companion.setMode(args[0], args[1]);
      case "rotateCompanionToken": return companion.rotateToken();
      case "getMcpBridgeStatus": return {
        enabled: true,
        listening: true,
        serverName: "mkboard",
        launcherPath: "",
        socketPath: "",
        clients: [],
        httpMcpUrl: companion.getStatus().mcpHttpUrl
      };
      case "reportActiveView":
        activeView = { ...activeView, ...(args[0] || {}) };
        return null;
      case "getElevenLabsStatus": return elevenLabs.getStatus();
      case "saveElevenLabsApiKey": return elevenLabs.saveApiKey(String(args[0] || ""));
      case "clearElevenLabsApiKey": return elevenLabs.clearApiKey();
      case "listElevenLabsVoices": return elevenLabs.listVoices();
      case "synthesizeElevenLabsSpeech": return elevenLabs.synthesizeSpeech(args[0]);
      case "getElevenLabsSpeechStatus": return elevenLabs.getSpeechStatus(args[0]);
      case "checkDesktopVersion": return { status: "current", currentVersion: "0.3.0", latestVersion: "0.3.0", downloadUrl: "https://github.com/yihui-dev/mkboard.app/releases", updateAvailable: false, checkedAt: new Date().toISOString(), downloadProgress: null, installBlocked: false };
      case "generateStoryboardImages": {
        const input = args[0];
        const proj = store.getProject(input.projectId).project;
        return localAiMedia.generateStoryboardImages(proj.id, {
          overwriteExisting: input.overwriteExisting,
          items: input.items.map((it) => ({ ...it, aspectRatio: it.aspectRatio || proj.imageRatio }))
        });
      }
      case "getActiveStoryboardVideoGenerations": return { rowIds: [], tasks: [] };
      case "ensureTutorialProject": return store.ensureTutorialProject(args[0]);
      case "getOnboardingState": return store.getOnboardingState("0.3.0", args[0]);
      case "updateOnboardingState": return store.updateOnboardingState(args[0], "0.3.0", args[1]);
      case "revealTutorialStoryboard": return store.revealTutorialStoryboard(args[0]);
      case "revealTutorialMedia": return store.revealTutorialMedia(args[0]);
      case "listProjects": return store.listProjects();
      case "listArchivedProjects": return store.listArchivedProjects();
      case "listDeletedProjects": return store.listDeletedProjects();
      case "countRetainedProjects": return store.countRetainedProjects();
      case "createProject": return store.createProject(args[0]);
      case "listTemplates": return store.listTemplates(args[0]);
      case "createTemplate": return store.createTemplate(args[0]);
      case "updateTemplate": return store.updateTemplate(args[0]);
      case "deleteTemplate": return store.deleteTemplate(String(args[0]));
      case "listTastes": return store.listTastes();
      case "saveProjectTaste": return store.saveProjectTaste(String(args[0]), String(args[1]));
      case "updateProject": return store.updateProject(args[0]);
      case "getProject": return store.getProject(String(args[0]), args[1]);
      case "archiveProject": return store.archiveProject(String(args[0]));
      case "unarchiveProject": return store.unarchiveProject(String(args[0]));
      case "trashProject": return store.trashProject(String(args[0]));
      case "restoreProject": return store.restoreProject(String(args[0]));
      case "deleteProject": return store.deleteProject(String(args[0]));
      case "updateScript": return store.updateScript(String(args[0]), String(args[1] || ""));
      case "getActiveStoryboardParseRun": return null;
      case "createShots": return store.createShots(String(args[0]), Number(args[1]));
      case "insertShot": return store.insertShot(String(args[0]), String(args[1]), args[2]);
      case "duplicateShots": return store.duplicateShots(String(args[0]), args[1]);
      case "deleteShots": return store.deleteShots(String(args[0]), args[1]);
      case "getShotMediaUpdate": return store.getShotMediaUpdate(String(args[0]));
      case "importShotMediaPaths": return store.importShotMediaPaths(String(args[0]), String(args[1]), args[2]);
      case "updateShot": return store.updateShot(String(args[0]), args[1]);
      case "updateShotMedia": return store.updateShotMedia(String(args[0]), String(args[1]), args[2]);
      case "reorderShots": return store.reorderShots(String(args[0]), String(args[1]), String(args[2]));
      case "saveStoryboardColumns": return store.saveColumns(String(args[0]), args[1]);
      case "saveImageRatio": return store.saveImageRatio(String(args[0]), args[1]);
      case "saveStoryboardSkill": return store.saveStoryboardSkill(String(args[0]), String(args[1]));
      case "importAssetPaths": return store.importAssetPaths(String(args[0]), args[1]);
      case "importAgentImageAttachmentPaths": return store.importAgentImageAttachmentPaths(String(args[0]), args[1]);
      case "renameAsset": return store.renameAsset(String(args[0]), String(args[1]), String(args[2]));
      case "deleteAssets": return store.deleteAssets(String(args[0]), args[1]);
      case "listSkills": return store.listSkills(args[0]);
      case "createSkill": return store.createSkill(args[0]);
      case "updateSkill": return store.updateSkill(args[0]);
      case "deleteSkill": return store.deleteSkill(String(args[0]));
      case "createAgentConversation": return store.createAgentConversation(String(args[0]));
      case "getAgentConversation": return store.getAgentConversation(String(args[0]), String(args[1]));
      case "markAgentConversationCompletionSeen": return store.markAgentConversationCompletionSeen(String(args[0]), String(args[1]));
      default:
        throw new Error(`Unsupported standalone RPC method: ${method}`);
    }
  }
});

const status = await companion.setMode(wantLan ? "network-accessible" : "local-only", requestedPort);
console.log("\n========================================================");
console.log("  MkBoard Standalone Web & Multi-Device Companion Ready");
console.log("========================================================");
console.log(`  Mode          : ${status.mode}`);
console.log(`  MCP HTTP URL  : ${status.mcpHttpUrl} (Bearer token auth)`);
for (const ep of status.endpoints) {
  console.log(`  [${ep.label}] : ${ep.pairingUrl}`);
}
console.log("========================================================\n");
