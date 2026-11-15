import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, readlinkSync, statSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, sep } from "node:path";
import type { AgentOperation, AgentResponse, ImageRatio } from "../shared";
import type { DreaminaAgentGenerationKind } from "../agent-generation-intent";
export { detectDreaminaCliGenerationIntent } from "../agent-generation-intent";
export type { DreaminaAgentGenerationKind } from "../agent-generation-intent";

export const dreaminaVideoAspectRatioValues = ["1:1", "3:4", "16:9", "4:3", "9:16", "21:9"] as const;
export type DreaminaVideoAspectRatio = (typeof dreaminaVideoAspectRatioValues)[number];
export type DreaminaVideoAspectRatioSelection = {
  aspectRatio: DreaminaVideoAspectRatio;
  source: "user" | "project";
};

export type DreaminaVideoDimensions = {
  width: number;
  height: number;
  displayAspectRatio?: string | null;
};

export type DreaminaAgentGenerationContext = {
  kind: DreaminaAgentGenerationKind;
  outputDir: string;
  projectAspectRatio: ImageRatio;
  videoAspectRatio: DreaminaVideoAspectRatio;
  videoAspectRatioSource: DreaminaVideoAspectRatioSelection["source"];
};

export type DreaminaOutputGroup = {
  rowIndex: number | null;
  filePaths: string[];
};

export type DreaminaTaskHint = {
  rowIndex: number;
  prompt: string;
  referencePaths: string[];
};

export type DreaminaSubmittedTask = {
  submitId: string;
  rowIndex: number | null;
  prompt: string;
  status: "querying" | "success" | "fail";
  failReason: string;
  order: number;
};

export type DreaminaTaskQueryResult = {
  submitId: string;
  status: "querying" | "success" | "fail";
  failReason: string;
};

export type DreaminaRunDirectory = {
  outputDir: string;
  modifiedAtMs: number;
};

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".avif", ".heic", ".heif"]);
const videoExtensions = new Set([".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"]);
const dreaminaVideoAspectRatioSet = new Set<string>(dreaminaVideoAspectRatioValues);

export function resolveDreaminaVideoAspectRatio(
  userMessage: string,
  projectAspectRatio: ImageRatio
): DreaminaVideoAspectRatioSelection {
  const intent = findLatestAffirmativeDreaminaVideoRatioIntent(userMessage);
  if (intent?.kind === "exact") return { aspectRatio: intent.aspectRatio, source: "user" };
  if (intent?.kind === "portrait") {
    return projectAspectRatio === "9:16" || projectAspectRatio === "3:4"
      ? { aspectRatio: projectAspectRatio, source: "project" }
      : { aspectRatio: "9:16", source: "user" };
  }
  if (intent?.kind === "landscape") {
    return projectAspectRatio === "16:9" || projectAspectRatio === "4:3"
      ? { aspectRatio: projectAspectRatio, source: "project" }
      : { aspectRatio: "16:9", source: "user" };
  }
  return { aspectRatio: projectAspectRatio, source: "project" };
}

type DreaminaVideoRatioIntent =
  | { index: number; kind: "exact"; aspectRatio: DreaminaVideoAspectRatio }
  | { index: number; kind: "portrait" | "landscape" };
type DreaminaVideoRatioIntentWithoutIndex =
  | { kind: "exact"; aspectRatio: DreaminaVideoAspectRatio }
  | { kind: "portrait" | "landscape" };

function findLatestAffirmativeDreaminaVideoRatioIntent(userMessage: string): DreaminaVideoRatioIntent | null {
  const intents: DreaminaVideoRatioIntent[] = [];
  const exactMatches = [...userMessage.matchAll(/(?:^|[^0-9])(21|16|9|4|3|1)\s*(?::|：|\/|／|x|X|×|比)\s*(16|9|4|3|1)(?![0-9])/gu)];
  for (const match of exactMatches) {
    const candidate = `${match[1]}:${match[2]}`;
    const matchIndex = match.index ?? 0;
    const mentionOffset = match[0].search(/[0-9]/u);
    const mentionStart = matchIndex + Math.max(0, mentionOffset);
    const mentionEnd = matchIndex + match[0].length;
    if (dreaminaVideoAspectRatioSet.has(candidate) && !isNegatedDreaminaRatioMention(userMessage, mentionStart, mentionEnd)) {
      intents.push({ index: mentionStart, kind: "exact", aspectRatio: candidate as DreaminaVideoAspectRatio });
    }
  }

  const keywordPatterns: Array<{ pattern: RegExp; intent: DreaminaVideoRatioIntentWithoutIndex }> = [
    { pattern: /正方形|方形|square/giu, intent: { kind: "exact", aspectRatio: "1:1" } },
    { pattern: /超宽屏|超寬屏|ultrawide|ultra-wide/giu, intent: { kind: "exact", aspectRatio: "21:9" } },
    { pattern: /竖屏|豎屏|纵向|縱向|portrait|vertical/giu, intent: { kind: "portrait" } },
    { pattern: /横屏|橫屏|横向|橫向|landscape|horizontal/giu, intent: { kind: "landscape" } }
  ];
  for (const { pattern, intent } of keywordPatterns) {
    for (const match of userMessage.matchAll(pattern)) {
      const mentionStart = match.index ?? 0;
      const mentionEnd = mentionStart + match[0].length;
      if (!isNegatedDreaminaRatioMention(userMessage, mentionStart, mentionEnd)) {
        intents.push({ index: mentionStart, ...intent } as DreaminaVideoRatioIntent);
      }
    }
  }

  return intents.sort((left, right) => right.index - left.index)[0] ?? null;
}

function isNegatedDreaminaRatioMention(userMessage: string, mentionStart: number, mentionEnd: number): boolean {
  const clauseBoundaryPattern = /[，,。.!！？?；;\n]/u;
  const before = userMessage.slice(0, mentionStart);
  const clauseStart = Math.max(
    before.lastIndexOf("，"),
    before.lastIndexOf(","),
    before.lastIndexOf("。"),
    before.lastIndexOf("."),
    before.lastIndexOf("！"),
    before.lastIndexOf("!"),
    before.lastIndexOf("？"),
    before.lastIndexOf("?"),
    before.lastIndexOf("；"),
    before.lastIndexOf(";"),
    before.lastIndexOf("\n")
  ) + 1;
  const prefix = userMessage.slice(clauseStart, mentionStart);
  const negationMatch = prefix.match(
    /(?:不要|别|別|请勿|請勿|勿|避免|排除|拒绝|拒絕|不(?:要|用|选|選|选择|選擇|采用|採用|需要|是|生成|制作|製作|做成|输出|輸出|改成|设为|設為)|do\s+not|don't|dont|not|avoid|without)[^，,。.!！？?；;\n]{0,18}$/iu
  );
  if (negationMatch) {
    const negatedPhrase = negationMatch[0];
    const contrastMatch = negatedPhrase.match(
      /(?:(?:而|但(?:是)?)(?:应该|應該)?(?:要|需|需要|用|使用|采用|採用|改用|选择|選擇|是|做成|生成|输出|輸出)?|改(?:成|为|為|用)|换成|換成|只(?:要|用|生成)|(?<!不)(?<!别)(?<!別)(?:要|用|使用|选|選|选择|選擇|采用|採用|生成|输出|輸出|做成|给我|給我)|but|instead(?:\s+of)?)/iu
    );
    if (!contrastMatch) return true;
    const beforeContrast = negatedPhrase.slice(0, contrastMatch.index ?? 0);
    const earlierRatioIntent = /(?:21|16|9|4|3|1)\s*(?::|：|\/|／|x|X|×|比)\s*(?:16|9|4|3|1)|正方形|方形|竖屏|豎屏|纵向|縱向|横屏|橫屏|横向|橫向|square|portrait|vertical|landscape|horizontal/iu;
    if (!earlierRatioIntent.test(beforeContrast)) return true;
  }

  const remaining = userMessage.slice(mentionEnd);
  const nextBoundary = remaining.search(clauseBoundaryPattern);
  const suffix = (nextBoundary >= 0 ? remaining.slice(0, nextBoundary) : remaining).trim();
  return /^(?:不要|不用|别用|別用|不行|不对|不對|不采用|不採用|排除|拒绝|拒絕|not|avoid)$/iu.test(suffix);
}

export function assertDreaminaVideoAspectRatio(
  dimensions: DreaminaVideoDimensions,
  expectedAspectRatio: DreaminaVideoAspectRatio,
  tolerance = 0.035
): void {
  const expected = numericAspectRatio(expectedAspectRatio);
  const fromDisplayRatio = numericAspectRatio(dimensions.displayAspectRatio ?? "");
  const actual = fromDisplayRatio ?? (dimensions.width > 0 && dimensions.height > 0 ? dimensions.width / dimensions.height : null);
  if (!expected || !actual || !Number.isFinite(actual)) {
    throw new Error("无法读取即梦视频的有效宽高比，已停止导入。");
  }
  const relativeDifference = Math.abs(actual - expected) / expected;
  if (relativeDifference <= tolerance) return;
  const actualLabel = dimensions.displayAspectRatio?.trim() || `${dimensions.width}:${dimensions.height}`;
  throw new Error(`即梦视频比例校验失败：期望 ${expectedAspectRatio}，实际 ${actualLabel}（${dimensions.width}×${dimensions.height}），已停止导入。`);
}

export async function assertDreaminaVideoFileAspectRatio(input: {
  filePath: string;
  expectedAspectRatio: DreaminaVideoAspectRatio;
  ffprobeBin: string;
  signal?: AbortSignal;
}): Promise<DreaminaVideoDimensions> {
  const args = [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,display_aspect_ratio",
    "-of", "json",
    input.filePath
  ];
  const output = await new Promise<string>((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(input.ffprobeBin, args, { stdio: ["ignore", "pipe", "pipe"], signal: input.signal });
    } catch (error) {
      reject(error);
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => reject(new Error("即梦视频比例校验超时，已停止导入。")));
    }, 20_000);
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (code) => finish(() => {
      if (code !== 0) {
        reject(new Error((stderr || `ffprobe exited with code ${code}`).trim()));
        return;
      }
      resolve(stdout);
    }));
  });

  let parsed: { streams?: Array<{ width?: unknown; height?: unknown; display_aspect_ratio?: unknown }> };
  try {
    parsed = JSON.parse(output) as typeof parsed;
  } catch {
    throw new Error("ffprobe 返回了无法识别的视频信息，已停止导入。");
  }
  const stream = parsed.streams?.[0];
  const dimensions: DreaminaVideoDimensions = {
    width: Number(stream?.width),
    height: Number(stream?.height),
    displayAspectRatio: typeof stream?.display_aspect_ratio === "string" ? stream.display_aspect_ratio : null
  };
  assertDreaminaVideoAspectRatio(dimensions, input.expectedAspectRatio);
  return dimensions;
}

function numericAspectRatio(value: string): number | null {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/u);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0 ? width / height : null;
}

function dreaminaCliExecutable(): string {
  const configuredBin = process.env.DREAMINA_BIN?.trim();
  const userBin = join(homedir(), ".local", "bin", process.platform === "win32" ? "dreamina.exe" : "dreamina");
  return configuredBin || (existsSync(userBin) ? userBin : "dreamina");
}

export function buildDreaminaAgentInstruction(context: DreaminaAgentGenerationContext): string {
  const videoAspectRatioSource = context.videoAspectRatioSource === "user"
    ? "用户在本次请求中明确指定，优先于项目比例"
    : "用户未明确指定不同的精确视频比例，已采用当前项目比例";
  const videoPromptRules = context.kind === "image"
    ? ""
    : `
- 本次视频输出比例已经由 MkBoard 确定为 \`${context.videoAspectRatio}\`（${videoAspectRatioSource}；当前项目比例为 \`${context.projectAspectRatio}\`）。每一条 \`multimodal2video\` 或 \`text2video\` 生成命令都必须显式传入 \`--ratio=${context.videoAspectRatio}\`；不得省略 \`--ratio\`、不得使用 CLI 默认比例，也不得根据参考图尺寸自行改成其他比例。有参考图片或视频时使用支持显式比例的 \`multimodal2video\`；没有任何参考素材时使用同样支持 \`--ratio\` 的 \`text2video\`。当前 CLI 的 \`image2video\`、\`frames2video\` 和 \`multiframe2video\` 会从输入图片推断比例且不提供 \`--ratio\`，本次不得使用这些子命令。
- 构造或整理即梦视频提示词时，优先控制在 1-3 个短句内。每个 Shot 只写清景别/构图范围和发生了什么，再补充确有必要的时长、画幅或镜头运动；不要加入比喻、情绪渲染、电影感散文、泛泛画质词或重复故事说明。
- 当前分镜已经绑定主体、角色、场景、分镜图或其他参考素材时，直接沿用参考，不要在提示词中重复描述外观、服装、场景陈设、配色或风格。
- 视频提示词必须明确禁止 BGM、配乐、旋律和背景音乐，只生成与画面动作和环境直接对应的音效；没有合理音效时保持安静。
- 每个 Shot 独立生成，不要制作转场动画、转场素材、过渡镜头、片头或片尾式衔接；相邻 Shot 在后期直接硬切。`;
  return `
## 即梦 CLI 本次受控生成任务

本次用户明确要求使用即梦 CLI。MkBoard 已在调用 Agent 前通过服务端实时校验当前会员，并记录一条消耗为 0 的使用记录。

硬性规则：
- 你必须在本次 Agent run 中实际调用本机 \`dreamina\` CLI 完成生成；不得调用 KIE、MkBoard 的 regenerate_media、其他图片/视频 Provider 或远程生成 API。
- 本提示词只会在用户明确点名即梦 CLI、确认生成操作并通过 MkBoard Pro 高级会员校验后出现。执行生成前，依次检查 \`DREAMINA_BIN\` 指向的可执行文件、\`command -v dreamina\` 和 \`~/.local/bin/dreamina\`，记录实际可用的 CLI 路径。
- 如果上述位置都没有可用的即梦 CLI，必须由你在本次 Agent run 中执行且只执行固定安装命令 \`curl -s https://jimeng.jianying.com/cli | bash\`；安装命令使用当前用户默认 HOME，不要使用下面的隔离 HOME。安装完成后再次按上述顺序检测并记录 CLI 路径，确认成功后再继续生成。不得改写安装命令、不得安装其他 CLI，也不得在已安装时更新或重装。
- 如果安装命令失败，或安装后仍找不到 \`dreamina\`，立即停止并在 reply 中返回实际错误和上述手动安装命令；不要改用 KIE 或其他 Provider。
- 确认 CLI 可用后，阅读 \`~/.dreamina_cli/dreamina/SKILL.md\`（如果存在），并使用上一步解析到的 CLI 路径执行 \`<即梦 CLI 路径> <子命令> -h\`，以当前安装版本的帮助信息为参数真值。
- 不要登录、重新登录或退出即梦 CLI。若 CLI 未登录、无即梦侧权益或需要合规确认，应停止生成并给出可操作错误；登录必须由用户手动完成。
- 为避免把本次受控任务的 CLI 运行态写入用户默认的 \`~/.dreamina_cli\` 状态目录，读取完上面的真实 Skill 后，必须先完成以下隔离运行准备，再执行任何 \`dreamina\` 命令：
  1. 创建 \`${context.outputDir}/.cli-home/.dreamina_cli/logs\` 和 \`${context.outputDir}/.cli-home/Library\`。
  2. 将 \`${homedir()}/.dreamina_cli/version.json\` 复制到隔离 HOME 的 \`.dreamina_cli/version.json\`（如果源文件存在）。
  3. 将 \`${homedir()}/Library/Keychains\` 符号链接为隔离 HOME 的 \`Library/Keychains\`，从而只读复用当前用户已经手动建立的 macOS Keychain 登录态；不得复制、打印或上传任何登录凭据。
  4. 除上述安装前后的可执行文件探测外，为本次所有即梦 CLI 命令显式设置 \`HOME='${context.outputDir}/.cli-home'\`，并使用解析到的 CLI 路径，包括 \`user_credit\`、生成命令和 \`query_result\`。所有任务完成前不要移除 Keychain 链接。
- 不要先尝试默认 HOME，不要反编译 CLI、尝试 Terminal 自动化或因为隔离 HOME 初始未登录而要求用户重新登录；应先完成上面的 Keychain 链接步骤，再用 \`dreamina user_credit\` 校验登录态。
- 生成命令必须带 \`--poll=30\`。若返回 querying 和 submit_id，继续调用 \`dreamina query_result --submit_id=<id> --download_dir=<目录>\`，直到成功下载或返回明确失败；不要只提交任务就宣称完成。
- 每个镜头的生成命令必须把完整 JSON stdout 同时保存到对应镜头目录的 \`task-submit.json\`（建议使用 \`tee\`，确保 Agent 仍能读取输出）；每次 \`query_result\` 的完整 JSON stdout 同时保存到 \`task-status.json\`。\`task-submit.json\` 一旦包含 \`submit_id\` 就不得删除或覆盖为空，这些文件供 MkBoard 在 Agent 超时、应用重启或稍后同步时继续查询服务端任务。
- 只允许把即梦生成结果写入下面指定目录，不要修改项目文件、数据库或其他目录：
  \`${context.outputDir}\`
- 如果请求对应具体分镜，每个镜头必须下载到 \`${context.outputDir}/row-<当前分镜的 1-based 行号>/\`。例如第 4 镜使用 \`row-4\`。多个镜头分别建目录，禁止混放。
- 如果请求不对应具体分镜，下载到 \`${context.outputDir}/general/\`。
- 输入参考素材必须使用“当前项目素材 JSON”中的本地路径；相对路径以当前项目目录为基准。Seedance 2.0 分镜优先使用该行画面列的第一张图片作为全能参考图。
- Seedance 2.0 视频根据素材情况使用 \`multimodal2video\` 或 \`text2video\` 和对应分镜的视频提示词；模型使用当前 CLI 帮助中可用的 Seedance 2.0 系列值。如果 \`dreamina user_credit\` 返回非空 \`vip_level\` 且 CLI 帮助支持 \`seedance2.0_vip\`，默认优先使用 \`seedance2.0_vip\`，避免普通队列长期等待。用户指定模型、时长、画幅或清晰度时按用户要求，但不得伪造 CLI 不支持的参数。
- 多个 Seedance 视频必须严格串行：提交一个任务后持续查询并下载成功结果，再提交下一个。不要并行调用生成命令；遇到 \`ExceedConcurrencyLimit\` 时等待已接受任务完成后再重试，不要连续重复提交。
${videoPromptRules}
- 任务成功后检查指定目录中确实存在图片或视频文件，再返回最终 JSON。最终 \`operations\` 必须为 []，不得返回 \`regenerate_media\`；\`rows\` 与 \`scriptHtml\` 必须为 null。
- reply 只简洁说明实际执行了哪些即梦 CLI 生成以及生成结果；不要把即梦 CLI 做成常驻设置项、功能入口或主动推荐给未提及它的用户。

本次生成类型：${context.kind}
`;
}

export function removeDreaminaForbiddenMediaOperations(response: AgentResponse): AgentResponse {
  const operations = (response.operations ?? []).filter((operation) => operation.type !== "regenerate_media");
  return operations.length === (response.operations ?? []).length ? response : { ...response, operations };
}

export function discoverDreaminaOutputGroups(outputDir: string): DreaminaOutputGroup[] {
  if (!existsSync(outputDir)) return [];
  const grouped = new Map<number | null, string[]>();
  for (const filePath of walkFiles(outputDir)) {
    if (!isGeneratedMediaPath(filePath)) continue;
    const rowIndex = dreaminaOutputRowIndex(outputDir, filePath);
    const files = grouped.get(rowIndex) ?? [];
    files.push(filePath);
    grouped.set(rowIndex, files);
  }
  return [...grouped.entries()]
    .map(([rowIndex, filePaths]) => ({ rowIndex, filePaths: filePaths.sort() }))
    .sort((left, right) => (left.rowIndex ?? Number.MAX_SAFE_INTEGER) - (right.rowIndex ?? Number.MAX_SAFE_INTEGER));
}

export function countDreaminaOutputFiles(groups: DreaminaOutputGroup[]): number {
  return groups.reduce((sum, group) => sum + group.filePaths.length, 0);
}

export function discoverDreaminaRunDirectories(projectLocalPath: string): DreaminaRunDirectory[] {
  const root = join(projectLocalPath, ".mkboard", "dreamina");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const outputDir = join(root, entry.name);
      return { outputDir, modifiedAtMs: newestModifiedAtMs(outputDir) };
    })
    .sort((left, right) => right.modifiedAtMs - left.modifiedAtMs);
}

export function discoverDreaminaSubmittedTasks(outputDir: string, hints: DreaminaTaskHint[]): DreaminaSubmittedTask[] {
  if (!existsSync(outputDir)) return [];
  const discovered: DreaminaSubmittedTask[] = [];
  let order = 0;
  const append = (input: unknown, rowIndex: number | null = null) => {
    const task = parseDreaminaTaskJson(input, hints, rowIndex, order);
    order += 1;
    if (task) discovered.push(task);
  };

  for (const entry of readdirSync(outputDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const rowMatch = /^row-(\d+)$/iu.exec(entry.name);
    if (!rowMatch) continue;
    const rowIndex = Number(rowMatch[1]);
    for (const fileName of ["task-submit.json", "task-status.json"]) {
      const filePath = join(outputDir, entry.name, fileName);
      if (!existsSync(filePath)) continue;
      try {
        append(JSON.parse(readFileSync(filePath, "utf8")), rowIndex);
      } catch {
        // A timed-out process can leave a partial JSON file; the CLI log fallback below remains available.
      }
    }
  }

  const logDir = join(outputDir, ".cli-home", ".dreamina_cli", "logs");
  if (existsSync(logDir)) {
    const logPaths = readdirSync(logDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(logDir, entry.name))
      .sort((left, right) => statSync(left).mtimeMs - statSync(right).mtimeMs);
    for (const logPath of logPaths) {
      const lines = readFileSync(logPath, "utf8").split(/\r?\n/gu);
      for (const line of lines) {
        const match = /\[SubmitTask\] submit generation task finished\b.*?submit_id=([a-z0-9-]+)\b.*?task_status=(querying|success|fail)\b.*?\binput=(\{.*\})\s*$/iu.exec(line);
        if (!match) continue;
        try {
          const request = JSON.parse(match[3]) as Record<string, unknown>;
          append({
            submit_id: match[1],
            gen_status: match[2],
            prompt: typeof request.prompt === "string" ? request.prompt : "",
            fail_reason: "",
            request
          });
        } catch {
          // Ignore one malformed log line without hiding other recoverable task ids.
        }
      }
    }
  }

  const bySubmitId = new Map<string, DreaminaSubmittedTask>();
  discovered.forEach((task) => {
    const previous = bySubmitId.get(task.submitId);
    bySubmitId.set(task.submitId, {
      ...previous,
      ...task,
      rowIndex: task.rowIndex ?? previous?.rowIndex ?? null,
      prompt: task.prompt || previous?.prompt || "",
      failReason: task.failReason || previous?.failReason || ""
    });
  });
  return [...bySubmitId.values()].sort((left, right) => left.order - right.order);
}

export async function queryDreaminaTaskResult(input: {
  outputDir: string;
  rowIndex: number;
  submitId: string;
  signal?: AbortSignal;
}): Promise<DreaminaTaskQueryResult> {
  const cliHome = prepareDreaminaCliHome(input.outputDir);
  const downloadDir = join(input.outputDir, `row-${input.rowIndex}`);
  mkdirSync(downloadDir, { recursive: true });
  const result = await execDreamina(
    ["query_result", `--submit_id=${input.submitId}`, `--download_dir=${downloadDir}`],
    cliHome,
    input.signal
  );
  const parsed = parseLastJsonObject(result.stdout) as Record<string, unknown> | null;
  const status = normalizeDreaminaTaskStatus(parsed?.gen_status);
  if (!status) {
    throw new Error(`即梦任务 ${input.submitId} 返回了无法识别的状态。${result.stderr.trim() ? ` ${result.stderr.trim()}` : ""}`.trim());
  }
  return {
    submitId: typeof parsed?.submit_id === "string" ? parsed.submit_id : input.submitId,
    status,
    failReason: typeof parsed?.fail_reason === "string" ? parsed.fail_reason : ""
  };
}

export async function listDreaminaSubmittedTasks(input: {
  outputDir: string;
  hints: DreaminaTaskHint[];
  signal?: AbortSignal;
}): Promise<DreaminaSubmittedTask[]> {
  const cliHome = prepareDreaminaCliHome(input.outputDir);
  const result = await execDreamina(["list_task", "--limit=100"], cliHome, input.signal);
  const parsed = parseLastJsonObject(result.stdout);
  return parseDreaminaSubmittedTaskList(parsed, input.hints);
}

export function parseDreaminaSubmittedTaskList(input: unknown, hints: DreaminaTaskHint[]): DreaminaSubmittedTask[] {
  if (!Array.isArray(input)) throw new Error("即梦任务列表返回了无法识别的数据。");
  return input
    .map((task, index) => parseDreaminaTaskJson(task, hints, null, input.length - index))
    .filter((task): task is DreaminaSubmittedTask => Boolean(task));
}

function walkFiles(root: string): string[] {
  const files: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile() && statSync(path).size > 0) files.push(path);
    }
  }
  return files;
}

function isGeneratedMediaPath(filePath: string): boolean {
  const extension = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return imageExtensions.has(extension) || videoExtensions.has(extension);
}

function dreaminaOutputRowIndex(outputDir: string, filePath: string): number | null {
  const firstSegment = relative(outputDir, filePath).split(sep)[0] ?? "";
  const match = /^row-(\d+)$/iu.exec(firstSegment);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function newestModifiedAtMs(root: string): number {
  let newest = statSync(root).mtimeMs;
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      const stats = statSync(path);
      newest = Math.max(newest, stats.mtimeMs);
      if (entry.isDirectory()) pending.push(path);
    }
  }
  return newest;
}

function parseDreaminaTaskJson(
  input: unknown,
  hints: DreaminaTaskHint[],
  explicitRowIndex: number | null,
  order: number
): DreaminaSubmittedTask | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const submitId = typeof value.submit_id === "string" ? value.submit_id.trim() : "";
  const status = normalizeDreaminaTaskStatus(value.gen_status);
  if (!submitId || !status) return null;
  const request = value.request && typeof value.request === "object" && !Array.isArray(value.request)
    ? value.request as Record<string, unknown>
    : null;
  const prompt = typeof value.prompt === "string" ? value.prompt : typeof request?.prompt === "string" ? request.prompt : "";
  const referencePaths = request
    ? [request.image_paths, request.video_paths]
        .flatMap((paths) => (Array.isArray(paths) ? paths : []))
        .filter((path): path is string => typeof path === "string")
    : [];
  return {
    submitId,
    rowIndex: explicitRowIndex ?? matchDreaminaTaskHint(prompt, referencePaths, hints),
    prompt,
    status,
    failReason: typeof value.fail_reason === "string" ? value.fail_reason : "",
    order
  };
}

function matchDreaminaTaskHint(prompt: string, referencePaths: string[], hints: DreaminaTaskHint[]): number | null {
  const normalizedPrompt = normalizePrompt(prompt);
  const referencePathSet = new Set(referencePaths);
  const pathMatches = hints.filter((hint) => hint.referencePaths.some((path) => referencePathSet.has(path)));
  if (pathMatches.length === 1) return pathMatches[0].rowIndex;
  if (!normalizedPrompt) return null;
  const promptMatches = hints.filter((hint) => normalizePrompt(hint.prompt) === normalizedPrompt);
  return promptMatches.length === 1 ? promptMatches[0].rowIndex : null;
}

function normalizePrompt(input: string): string {
  return input.replace(/\s+/gu, " ").trim();
}

function normalizeDreaminaTaskStatus(input: unknown): DreaminaSubmittedTask["status"] | null {
  return input === "querying" || input === "success" || input === "fail" ? input : null;
}

function prepareDreaminaCliHome(outputDir: string): string {
  const cliHome = join(outputDir, ".cli-home");
  const cliStateDir = join(cliHome, ".dreamina_cli");
  const cliLibraryDir = join(cliHome, "Library");
  mkdirSync(join(cliStateDir, "logs"), { recursive: true });
  mkdirSync(cliLibraryDir, { recursive: true });
  const sourceVersion = join(homedir(), ".dreamina_cli", "version.json");
  if (existsSync(sourceVersion)) copyFileSync(sourceVersion, join(cliStateDir, "version.json"));
  const keychainsLink = join(cliLibraryDir, "Keychains");
  const sourceKeychains = join(homedir(), "Library", "Keychains");
  if (existsSync(keychainsLink)) {
    let target = "";
    try {
      target = readlinkSync(keychainsLink);
    } catch {
      throw new Error("即梦隔离运行目录中的 Keychains 路径不是符号链接，已停止同步以避免覆盖本地文件。");
    }
    if (target !== sourceKeychains) throw new Error("即梦隔离运行目录中的 Keychains 链接目标异常，已停止同步。");
  } else {
    symlinkSync(sourceKeychains, keychainsLink, "dir");
  }
  return cliHome;
}

function execDreamina(args: string[], cliHome: string, signal?: AbortSignal): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(dreaminaCliExecutable(), args, {
      env: { ...process.env, HOME: cliHome },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finishReject = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(error);
    };
    const abort = () => {
      child.kill("SIGTERM");
      finishReject(new Error("即梦任务同步已取消。"));
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finishReject(new Error("查询即梦服务端任务超时，请稍后再次同步。"));
    }, 60_000);
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", (error) => finishReject(error));
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        finishReject(new Error((stderr || stdout || `dreamina query_result exited with code ${code}`).trim()));
        return;
      }
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      resolve({ stdout, stderr });
    });
  });
}

function parseLastJsonObject(input: string): unknown {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue with a balanced-object scan when the CLI emits a warning before its JSON body.
  }
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let lastObject = "";
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) lastObject = input.slice(start, index + 1);
    }
  }
  return lastObject ? JSON.parse(lastObject) : null;
}

export function hasRegenerateMediaOperation(operations: AgentOperation[] | undefined): boolean {
  return Boolean(operations?.some((operation) => operation.type === "regenerate_media"));
}
