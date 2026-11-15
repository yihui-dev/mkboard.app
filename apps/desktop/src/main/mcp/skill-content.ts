export const MKBOARD_MCP_SKILL_NAME = "mkboard-storyboard";
export const MKBOARD_MCP_SKILL_MARKER = ".mkboard-managed";

// Installed into ~/.claude/skills and ~/.codex/skills by MkBoard Desktop (see integration.ts).
export function mkboardMcpSkillMarkdown(): string {
  return `---
name: ${MKBOARD_MCP_SKILL_NAME}
description: Work on MkBoard projects and storyboards from Claude Code or Codex through the MkBoard MCP tools. Use when the user asks to create, rename, archive, delete, restore or export an MkBoard project, edit an MkBoard script, split a script into shots (拆分镜), rewrite shot cells or prompts, edit storyboard columns, reorder/insert/delete shots, manage the asset library, make 配音 (voiceover), generate shot images/videos with MkBoard's own generators, or put images/videos made with their own skills into MkBoard shots (分镜画面).
---

# MkBoard Storyboard

MkBoard Desktop exposes its current project through MCP tools (server \`mkboard\`; development builds use \`mkboard_dev\`). Every edit shows up live in the MkBoard window. Only use these tools when the user is working in MkBoard.

## Workflow

1. \`get_active_project\` to find the project open in MkBoard. If none is open, \`list_projects\` then \`open_project\`. When the user asks for a new project, \`create_project\` (optionally with \`templateId\` from \`list_templates\`, \`imageRatio\` and the initial script); it uses MkBoard's own create entry, so the free-plan project limit applies. Never create a project the user did not ask for.
2. \`read_project\` before editing. It returns the script, columns (with \`semantic\`: imagePrompt / videoPrompt / generationMethod), and every shot with its 1-based \`index\`, \`id\`, cells and attached media paths. Re-read after structural edits; shot numbers shift when shots are inserted, deleted or moved.
3. Edit with the smallest tool that fits:
   - Script: \`update_script\` (full document; keep text the user did not ask to change).
   - Split a script into shots, two ways. Both replace all shots, so confirm with the user first when shots already exist.
     - Write the shots yourself: \`get_storyboard_guide\` returns the project's 拆分镜 skill, columns and prompt rules; follow it, then \`replace_storyboard\` with every shot in order.
     - Let MkBoard do it: \`split_storyboard\` runs MkBoard's own AI 解析分镜 with the CLI selected in MkBoard (optional \`instructions\`, \`agent\`). It can take several minutes; progress shows in the MkBoard sidebar. The script must not be empty.
   - Partial edits: \`update_shot_cells\`, \`insert_shots\`, \`delete_shots\`, \`duplicate_shots\`, \`reorder_shot\`.
   - Custom columns: address them by the column id or exact label from \`read_project\`.
4. Frames and clips: generate them with whatever skill the user prefers, save them to disk (or keep the URL), then call \`import_shot_media\` for the target shot (\`mode: "replace"\` to swap the current frame, default append). \`import_assets\` adds reference files to the asset library without attaching them.
5. Columns: \`update_columns\` adds custom columns, renames, changes a custom column's type, shows/hides, deletes or reorders columns. The locked 镜号 column stays put.
6. Asset library: \`read_project\` with \`include: ["assets"]\` lists asset ids; \`rename_asset\`, \`replace_asset\` (swap the file everywhere it is used) and \`delete_assets\` (removes the files from disk and from every shot).
7. 配音 (voiceover): \`generate_voiceover\` reads the whole script (\`source: "script"\`), each shot's 内容 (\`source: "shots"\`, optionally \`rows\`) or custom \`text\` with ElevenLabs and saves the MP3s into the asset library. It uses the voice chosen in MkBoard settings unless you pass \`voiceId\` from \`list_voices\`, and charges the user's own ElevenLabs quota, so do not regenerate without a reason (unchanged text is served from cache).
8. Let MkBoard generate frames and clips: fill each shot's 生成方式 and image / video prompt columns first, then \`generate_shot_images\` (ChatGPT Image2 and Seedance 2.0 shots) or \`generate_shot_videos\` (Seedance 2.0 in the cloud, Hyperframes locally). Run with \`dryRun: true\` first and tell the user the shots and estimated credits (\`get_credits\` shows the balance); images cost 8 credits each, Seedance 50 credits/s at 720p and 100 at 1080p. Long runs keep going in MkBoard: \`get_generation_status\` collects finished results and \`cancel_video_generation\` stops videos.

## Projects

- \`list_projects\` lists projects in use; \`status: "archived" | "trash" | "all"\` shows the 归档 and 回收站 too.
- \`update_project\` renames a project or changes its aspect ratio, 拆分镜 skill (\`list_skills\`) or the style MkBoard's own generation uses (\`list_tastes\`).
- \`archive_project\` / \`unarchive_project\` hide and bring back a project without deleting anything.
- \`delete_project\` is the app's 删除: the project goes to the 回收站 and \`restore_project\` brings it back. Trashed projects still count toward the free-plan limit.
- \`delete_project_permanently\` erases a trashed project's folder and every file in it. Only call it when the user explicitly asks to delete permanently or empty the trash, and name the project when you confirm.
- \`export_project\` writes the storyboard CSV (\`storyboard-csv\`), the media attached to shots (\`storyboard-assets-zip\`) or the whole asset library (\`all-assets-zip\`) to an absolute path outside the project folder.

## Style

MkBoard's project style (Taste / 视频风格) is not part of this integration. When you generate B-ROLL or any other frame with the user's own skills, follow those skills and the user's request for the look. Do not ask about, look up or imitate the MkBoard project style, and do not write style descriptions into shots just to match it.

## Storyboard rules

These rules apply to prompts written into MkBoard's columns, which MkBoard's own generators consume later. Media you generate yourself follows the user's skills.

- Scene (类别) is usually \`A-ROLL\` (talking head / recorded footage) or \`B-ROLL\` (visual cutaway).
- Generation method (生成方式) values: \`ChatGPT Image2\` (one normal image), \`Seedance 2.0\` (video), \`Hyperframes\` (HTML motion graphics video), \`自定义\` (user supplies media).
- A shot that MkBoard will render with Seedance 2.0 needs a 2x2 four-panel storyboard reference image first (also when you make that image yourself). Ask for a four-panel storyboard reference and forbid single keyframes, shot numbers, titles, captions, description bars, watermarks, borders and any UI marks.
- Hyperframes shots have no pre-generated image; do not create images for them unless the user asks.
- Video prompts stay short: framing plus what actually happens, then only necessary duration, aspect ratio, on-screen text language and constraints. No metaphors, mood prose or generic quality words.
- When a shot already has reference media, tell the video prompt to follow the references instead of re-describing subjects, wardrobe, sets, colors or style.
- Every video prompt says no BGM / no background music; only diegetic sound effects matching the action (silence is fine).
- Shots hard-cut. Never ask for transitions, transition clips, intros or outros.
- Seedance 2.0 durations are 10-15 s (12 s typical); Hyperframes durations are 10-20 s.
- Write prompts in the script's main language; fall back to English when unclear.

## Limits

- Only \`generate_shot_images\` and Seedance shots in \`generate_shot_videos\` spend MkBoard credits; every other tool is free. Never start a paid batch the user did not ask for, and never regenerate shots that already have media unless asked. These tools never touch account credentials.
- Voiceover runs on the user's own ElevenLabs key and quota. Audio files live in the asset library; shots' 画面 cells only hold images and videos.
- A shot holds at most 10 media items. Imported files are copied into the project's \`assets\` folder.
`;
}
