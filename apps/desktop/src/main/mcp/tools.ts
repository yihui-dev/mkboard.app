// MCP tool catalog for MkBoard Desktop. Pure data so the stdio server can list tools
// even while the desktop app is closed.

export type McpToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
};

const projectIdProperty = {
  type: "string",
  description: "MkBoard project id. Omit to use the project currently open in the MkBoard window."
};

const rowProperty = {
  type: "string",
  description: "Target shot: 1-based shot number as a string (e.g. \"3\"), or the row id returned by read_project."
};

const rowListProperty = {
  type: "array",
  items: rowProperty,
  minItems: 1,
  description: "Target shots: 1-based shot numbers as strings, or row ids from read_project."
};

const shotDraftProperties = {
  scene: { type: "string", description: "类别 column, usually A-ROLL or B-ROLL." },
  duration: { type: "string", description: "Duration in seconds, e.g. \"12\"." },
  content: { type: "string", description: "内容: the script/voice-over text this shot covers." },
  note: { type: "string", description: "备注: visual notes for the shot." },
  customValues: {
    type: "object",
    additionalProperties: { type: "string" },
    description:
      "Custom column values keyed by column id (or exact column label) from read_project, e.g. image prompt, video prompt and generation method (ChatGPT Image2 | Seedance 2.0 | Hyperframes | 自定义)."
  }
};

export const MKBOARD_MCP_TOOLS: McpToolDefinition[] = [
  {
    name: "get_active_project",
    title: "Get active MkBoard project",
    description:
      "Return the project currently open in the MkBoard Desktop window (id, name, local folder, shot count, current tab). Call this first when the user refers to \"the current MkBoard project\".",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "list_projects",
    title: "List MkBoard projects",
    description:
      "List MkBoard projects on this computer. status=active (default) lists projects in use; archived lists 归档; trash lists the 回收站; all lists everything. Each project has a status field.",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string", enum: ["active", "archived", "trash", "all"], description: "Which projects to list. Defaults to active." } },
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "update_project",
    title: "Update MkBoard project settings",
    description:
      "Change a project's settings like the app's 编辑项目 dialog: rename it, change the frame aspect ratio, switch the bound 拆分镜 skill (ids from list_skills) or the video style used by MkBoard's own generation (ids from list_tastes). Pass only what should change.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: projectIdProperty,
        name: { type: "string", description: "New project name." },
        imageRatio: { type: "string", enum: ["16:9", "9:16", "3:4", "4:3"], description: "Frame aspect ratio." },
        storyboardSkillId: { type: "string", description: "拆分镜 skill id from list_skills." },
        tasteId: { type: "string", description: "Video style id from list_tastes (only affects MkBoard's own image/video generation)." }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "archive_project",
    title: "Archive MkBoard project",
    description: "Move an active project to 归档 (hidden from the project list, nothing is deleted). Undo with unarchive_project.",
    inputSchema: { type: "object", properties: { projectId: { type: "string", description: "Project id from list_projects." } }, required: ["projectId"], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  {
    name: "unarchive_project",
    title: "Unarchive MkBoard project",
    description: "Bring an archived project back to the project list.",
    inputSchema: { type: "object", properties: { projectId: { type: "string", description: "Project id from list_projects status=archived." } }, required: ["projectId"], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  {
    name: "delete_project",
    title: "Delete MkBoard project (move to trash)",
    description:
      "Delete a project the way the app's 删除 does: it moves to the 回收站 (trash) with all files kept, and restore_project brings it back. Trashed projects still count toward the free-plan project limit until permanently deleted.",
    inputSchema: { type: "object", properties: { projectId: { type: "string", description: "Project id from list_projects." } }, required: ["projectId"], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
  },
  {
    name: "restore_project",
    title: "Restore MkBoard project from trash",
    description: "Restore a project from the 回收站.",
    inputSchema: { type: "object", properties: { projectId: { type: "string", description: "Project id from list_projects status=trash." } }, required: ["projectId"], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  {
    name: "delete_project_permanently",
    title: "Permanently delete MkBoard project",
    description:
      "Permanently delete a project that is already in the 回收站: its local folder (script, storyboard, every asset file) is removed and cannot be recovered. Only call this when the user explicitly asks to permanently delete or empty the trash; otherwise use delete_project.",
    inputSchema: { type: "object", properties: { projectId: { type: "string", description: "Project id from list_projects status=trash." } }, required: ["projectId"], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
  },
  {
    name: "export_project",
    title: "Export MkBoard project",
    description:
      "Export like the app's 导出 menu: storyboard-csv (the storyboard table), storyboard-assets-zip (media attached to shots) or all-assets-zip (the whole asset library). outputPath is an absolute file path or an existing folder (the file name is then generated); it must be outside the project folder.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: projectIdProperty,
        kind: { type: "string", enum: ["storyboard-csv", "storyboard-assets-zip", "all-assets-zip"] },
        outputPath: { type: "string", description: "Absolute destination file path or folder." },
        overwrite: { type: "boolean", description: "Overwrite an existing file. Defaults to false." }
      },
      required: ["kind", "outputPath"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  {
    name: "list_skills",
    title: "List 拆分镜 skills",
    description: "List the 拆分镜 skills a project can be bound to (update_project storyboardSkillId).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "list_tastes",
    title: "List MkBoard video styles",
    description: "List the video styles (Taste / 视频风格) that MkBoard's own image/video generation can use (update_project tasteId). Names only; do not imitate them in frames you generate yourself.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "open_project",
    title: "Open MkBoard project",
    description: "Open a project in the MkBoard Desktop window so the user can watch edits live.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project id from list_projects." },
        tab: { type: "string", enum: ["script", "storyboard", "assets"], description: "Workspace tab to show. Defaults to storyboard." }
      },
      required: ["projectId"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "list_templates",
    title: "List MkBoard project templates",
    description: "List project templates (storyboard columns and bound 拆分镜 skill) that create_project can start from.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "create_project",
    title: "Create MkBoard project",
    description:
      "Create a new local MkBoard project through the same entry as the app's 新建项目 button (free-plan project limit applies), optionally with an initial script, and open it in the MkBoard window. Only create a project when the user asks for a new one.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name." },
        templateId: { type: "string", description: "Template id from list_templates. Defaults to the built-in template." },
        imageRatio: { type: "string", enum: ["16:9", "9:16", "3:4", "4:3"], description: "Frame aspect ratio. Defaults to 16:9." },
        scriptHtml: { type: "string", description: "Initial script HTML." },
        scriptText: { type: "string", description: "Initial script as plain text (blank lines separate paragraphs). Used when scriptHtml is omitted." },
        open: { type: "boolean", description: "Open the new project in the MkBoard window. Defaults to true." }
      },
      required: ["name"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  {
    name: "read_project",
    title: "Read MkBoard project",
    description:
      "Read a project's script (HTML and plain text), storyboard columns (with semantic kind: imagePrompt / videoPrompt / generationMethod), every shot row (1-based index, row id, cell values, attached media with local file paths) and optionally the asset library. Always read before editing so you use current row ids and column ids.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: projectIdProperty,
        include: {
          type: "array",
          items: { type: "string", enum: ["script", "storyboard", "assets"] },
          description: "Sections to return. Defaults to script and storyboard."
        }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "update_script",
    title: "Update MkBoard script",
    description:
      "Replace the whole script document. Pass scriptHtml (paragraph HTML such as <h1>, <p>) or scriptText (plain text; blank lines separate paragraphs). Read the current script first and keep text the user did not ask to change.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: projectIdProperty,
        scriptHtml: { type: "string", description: "Full script HTML." },
        scriptText: { type: "string", description: "Full script as plain text. Used when scriptHtml is omitted." }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "get_storyboard_guide",
    title: "Get storyboard splitting guide",
    description:
      "Return the 拆分镜 skill bound to the project (the same rules MkBoard's AI 解析分镜 follows), the storyboard columns with their semantic kind, and the row format replace_storyboard expects. Read it before splitting a script into shots yourself.",
    inputSchema: { type: "object", properties: { projectId: projectIdProperty }, additionalProperties: false },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "split_storyboard",
    title: "Run MkBoard AI storyboard split",
    description:
      "Ask MkBoard to split the project's current script into shots with its own AI 解析分镜 (runs the Codex CLI or Claude Code selected in MkBoard with the project's 拆分镜 skill; progress shows in the MkBoard sidebar). Replaces all existing shots and waits until the run finishes, which can take several minutes. To split the script yourself instead, use get_storyboard_guide + replace_storyboard.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: projectIdProperty,
        agent: { type: "string", enum: ["codex", "claude-code"], description: "Local CLI MkBoard runs. Defaults to the one selected in MkBoard." },
        instructions: { type: "string", description: "Extra request from the user for this split, e.g. \"每个镜头不超过 12 秒\"." }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
  },
  {
    name: "replace_storyboard",
    title: "Replace whole storyboard",
    description:
      "Write a complete storyboard (拆分镜) and replace all existing shots, the same way MkBoard's AI 解析分镜 does. Existing shot media links are cleared (files stay in the asset library). Use for splitting a script into shots; use insert_shots / update_shot_cells for partial edits.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: projectIdProperty,
        rows: {
          type: "array",
          minItems: 1,
          maxItems: 300,
          items: { type: "object", properties: shotDraftProperties, additionalProperties: false },
          description: "Shots in order."
        }
      },
      required: ["rows"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
  },
  {
    name: "insert_shots",
    title: "Insert shots",
    description: "Insert new shots before/after a shot, or at the end. Each item in rows becomes one new shot.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: projectIdProperty,
        row: { ...rowProperty, description: "Anchor shot for placement before/after. Omit to append at the end." },
        placement: { type: "string", enum: ["before", "after", "end"], description: "Defaults to end, or after when row is given." },
        rows: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: { type: "object", properties: shotDraftProperties, additionalProperties: false }
        }
      },
      required: ["rows"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  {
    name: "update_shot_cells",
    title: "Update shot cells",
    description:
      "Update cells of one or more shots. field is scene, duration, content, note, or a custom column id / exact label from read_project (e.g. the image prompt, video prompt or generation method column).",
    inputSchema: {
      type: "object",
      properties: {
        projectId: projectIdProperty,
        updates: {
          type: "array",
          minItems: 1,
          maxItems: 300,
          items: {
            type: "object",
            properties: {
              row: rowProperty,
              cells: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  properties: { field: { type: "string" }, value: { type: "string" } },
                  required: ["field", "value"],
                  additionalProperties: false
                }
              }
            },
            required: ["row", "cells"],
            additionalProperties: false
          }
        }
      },
      required: ["updates"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "delete_shots",
    title: "Delete shots",
    description: "Delete shots. Their media files stay in the asset library.",
    inputSchema: {
      type: "object",
      properties: { projectId: projectIdProperty, rows: rowListProperty },
      required: ["rows"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
  },
  {
    name: "duplicate_shots",
    title: "Duplicate shots",
    description: "Duplicate shots; each copy is inserted right after its source.",
    inputSchema: {
      type: "object",
      properties: { projectId: projectIdProperty, rows: rowListProperty },
      required: ["rows"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  {
    name: "reorder_shot",
    title: "Move shot",
    description: "Move one shot before or after another shot.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: projectIdProperty,
        row: rowProperty,
        target: { ...rowProperty, description: "Shot to move next to." },
        placement: { type: "string", enum: ["before", "after"] }
      },
      required: ["row", "target", "placement"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  {
    name: "import_shot_media",
    title: "Import media into a shot",
    description:
      "Put images or videos you created (for example with your own image/video generation skills) into a shot's 画面 cell. Accepts absolute local file paths and/or http(s) URLs; files are copied into the project's assets folder. mode=replace makes the imported files the shot's only media; append (default) keeps existing media. A shot holds at most 10 media items.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: projectIdProperty,
        row: rowProperty,
        filePaths: { type: "array", items: { type: "string" }, description: "Absolute paths of local image/video files." },
        urls: { type: "array", items: { type: "string" }, description: "http(s) URLs of image/video files to download." },
        mode: { type: "string", enum: ["append", "replace"], description: "Defaults to append." }
      },
      required: ["row"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
  },
  {
    name: "set_shot_media",
    title: "Set shot media",
    description: "Set the ordered list of asset ids shown in a shot's 画面 cell (use asset ids from read_project include=assets). Pass an empty list to clear.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: projectIdProperty,
        row: rowProperty,
        assetIds: { type: "array", items: { type: "string" }, maxItems: 10 }
      },
      required: ["row", "assetIds"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "update_columns",
    title: "Edit storyboard columns",
    description:
      "Edit the storyboard table's columns like the column menu: add custom columns, rename, change a custom column's type, show/hide, delete, or reorder. Address columns by id or exact label from read_project. Locked columns (镜号) cannot be hidden, deleted or moved. Deleting a column hides its values; the shot data stays in the database.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: projectIdProperty,
        add: {
          type: "array",
          items: {
            type: "object",
            properties: { label: { type: "string" }, type: { type: "string", enum: ["text", "select", "number"], description: "Defaults to text." } },
            required: ["label"],
            additionalProperties: false
          },
          description: "New custom columns, appended at the end."
        },
        update: {
          type: "array",
          items: {
            type: "object",
            properties: {
              column: { type: "string", description: "Column id or exact label." },
              label: { type: "string" },
              type: { type: "string", enum: ["text", "select", "number"], description: "Custom columns only." },
              visible: { type: "boolean" }
            },
            required: ["column"],
            additionalProperties: false
          }
        },
        remove: { type: "array", items: { type: "string" }, description: "Column ids or labels to delete." },
        order: {
          type: "array",
          items: { type: "string" },
          description: "Columns (ids or labels) in their new order; unlisted movable columns follow in their current order. Locked columns keep their place."
        }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
  },
  {
    name: "rename_asset",
    title: "Rename asset",
    description: "Rename a file in the project's asset library (asset ids from read_project include=assets). The extension is kept when omitted.",
    inputSchema: {
      type: "object",
      properties: { projectId: projectIdProperty, assetId: { type: "string" }, name: { type: "string", description: "New file name." } },
      required: ["assetId", "name"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: "replace_asset",
    title: "Replace asset file",
    description: "Swap an asset's file for another local file, like the asset menu's 修改素材文件. Every shot that shows the asset shows the new file (non-image/video files are detached from shots).",
    inputSchema: {
      type: "object",
      properties: { projectId: projectIdProperty, assetId: { type: "string" }, filePath: { type: "string", description: "Absolute local file path." } },
      required: ["assetId", "filePath"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
  },
  {
    name: "delete_assets",
    title: "Delete assets",
    description: "Delete files from the project's asset library. They are removed from every shot and deleted from disk.",
    inputSchema: {
      type: "object",
      properties: { projectId: projectIdProperty, assetIds: { type: "array", items: { type: "string" }, minItems: 1 } },
      required: ["assetIds"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
  },
  {
    name: "list_voices",
    title: "List voiceover voices",
    description:
      "List the ElevenLabs voices available to MkBoard's 配音 (uses the ElevenLabs API key saved in the user's MkBoard account) and the default voice selected in MkBoard settings.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true }
  },
  {
    name: "generate_voiceover",
    title: "Generate voiceover",
    description:
      "Make 配音 MP3s with ElevenLabs and save them to the project's asset library: source=script reads the whole script as one file; source=shots makes one file per shot from its 内容 (all shots, or the given rows); source=text reads custom text. Uses the default voice from MkBoard settings unless voiceId is given. Charges the user's own ElevenLabs quota (not MkBoard credits); text already voiced with the same voice is reused from cache.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: projectIdProperty,
        source: { type: "string", enum: ["script", "shots", "text"], description: "Defaults to shots when rows is given, otherwise script." },
        rows: { ...rowListProperty, description: "Shots to voice for source=shots. Defaults to every shot with 内容." },
        text: { type: "string", description: "Text to voice for source=text." },
        voiceId: { type: "string", description: "ElevenLabs voice id from list_voices." },
        fileName: { type: "string", description: "File name for source=script or text (without .mp3)." }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: "get_credits",
    title: "Get MkBoard credits",
    description: "Show whether the user is signed in to MkBoard, the credits available for cloud generation, and the per-shot pricing (images 8 credits; Seedance 2.0 50 credits/s at 720p, 100 at 1080p; Hyperframes renders locally for free).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true }
  },
  {
    name: "generate_shot_images",
    title: "Generate shot images with MkBoard",
    description:
      "Run MkBoard's own AI image generation (the storyboard toolbar's 生成图片) for shots whose 生成方式 is ChatGPT Image2 or Seedance 2.0 (Seedance shots get the 2x2 four-panel reference), using each shot's image prompt column. Spends MkBoard credits (8 per image). By default only shots without an image; pass rows or mode=all to regenerate. Use dryRun first to see shots and credits, and tell the user the cost before large batches. Waits up to waitSeconds for results and puts finished images into the shots; anything still running can be collected with get_generation_status.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: projectIdProperty,
        rows: { ...rowListProperty, description: "Shots to generate. Defaults to every eligible shot." },
        mode: { type: "string", enum: ["missing", "all"], description: "missing = only shots without an image (default unless rows is given)." },
        overwrite: { type: "boolean", description: "Replace the shot's current generated image instead of adding one. Defaults to false." },
        dryRun: { type: "boolean", description: "Only report which shots would be generated and the estimated credits." },
        waitSeconds: { type: "number", description: "How long to wait for results (0-540). Defaults to 300." }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
  },
  {
    name: "generate_shot_videos",
    title: "Generate shot videos with MkBoard",
    description:
      "Run MkBoard's own video generation (the storyboard toolbar's 生成视频) for B-ROLL shots whose 生成方式 is Seedance 2.0 (MkBoard cloud, uses the shot's first image as reference, spends credits: 50/s at 720p, 100/s at 1080p, 10-15 s per shot) or Hyperframes (rendered locally by the Codex / Claude Code CLI selected in MkBoard, no credits), using each shot's video prompt column. Defaults to shots without a video; pass rows or mode=all to regenerate. Use dryRun first and tell the user the credits before Seedance batches. Waits up to waitSeconds; longer runs keep going in MkBoard (progress shows in the storyboard) and get_generation_status reports them.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: projectIdProperty,
        rows: { ...rowListProperty, description: "Shots to generate. Defaults to every eligible shot." },
        method: { type: "string", enum: ["all", "seedance", "hyperframes"], description: "Only generate shots of this method. Defaults to all." },
        mode: { type: "string", enum: ["missing", "all"], description: "missing = only shots without a video (default unless rows is given)." },
        seedanceResolution: { type: "string", enum: ["720p", "1080p"], description: "Defaults to the resolution chosen in MkBoard settings (720p)." },
        hyperframesResolution: { type: "string", enum: ["1080p", "2k", "4k"], description: "Defaults to the resolution chosen in MkBoard settings (1080p)." },
        seedanceAspectRatio: { type: "string", enum: ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9"], description: "Override the project ratio for Seedance shots." },
        overwrite: { type: "boolean", description: "Replace the shot's current generated video instead of adding one. Defaults to false." },
        dryRun: { type: "boolean", description: "Only report which shots would be generated, their duration and the estimated credits." },
        waitSeconds: { type: "number", description: "How long to wait for results (0-540). Defaults to 300." }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
  },
  {
    name: "get_generation_status",
    title: "Get generation status",
    description: "Check MkBoard image and video generations for a project, and put any finished images into their shots. Use after generate_shot_images / generate_shot_videos returned before everything finished.",
    inputSchema: { type: "object", properties: { projectId: projectIdProperty }, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: "cancel_video_generation",
    title: "Cancel video generation",
    description: "Stop the video generations running for a project, like the storyboard's 中止 button. Cloud tasks that already started may still be charged.",
    inputSchema: { type: "object", properties: { projectId: projectIdProperty }, additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }
  },
  {
    name: "import_assets",
    title: "Import assets",
    description: "Copy local files (reference images, character/scene images, videos, audio, documents) into the project's asset library without attaching them to a shot.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: projectIdProperty,
        filePaths: { type: "array", items: { type: "string" }, minItems: 1, description: "Absolute local file paths." }
      },
      required: ["filePaths"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }
];

export const MKBOARD_MCP_SERVER_INSTRUCTIONS = [
  "These tools control the MkBoard Desktop app (storyboard / 分镜 tool) on this computer. Use them only when the user explicitly asks to work in MkBoard or on an MkBoard project/storyboard.",
  "Start with get_active_project (or list_projects + open_project), then read_project before editing so row ids and column ids are current. Edits appear live in the MkBoard window.",
  "To add frames made by your own skills, save the image/video locally (or get a URL) and call import_shot_media for the target shot.",
  "Style: MkBoard's project style (Taste / 视频风格) is not provided and must not be applied. When you generate B-ROLL or other frames with your own skills, the user's skills and request decide the look; do not ask about or imitate the MkBoard project style.",
  "Rules for prompts written into MkBoard columns (used later by MkBoard's own generators): Seedance 2.0 shots need a 2x2 four-panel storyboard reference image (no numbers, captions, borders or UI marks); Hyperframes shots have no pre-generated image; video prompts stay short (framing + what happens), say no BGM/music (only diegetic sound effects), and shots hard-cut without transitions.",
  "New projects: create_project uses MkBoard's own create entry and its free-plan project limit; only create one when the user asks. To split a script into shots, either write the shots yourself (get_storyboard_guide, then replace_storyboard) or let MkBoard run its AI 解析分镜 with split_storyboard. Both replace existing shots, so confirm first when shots already exist.",
  "Projects: update_project renames or changes ratio / 拆分镜 skill / style; archive_project and unarchive_project; delete_project moves a project to the 回收站 (restore_project undoes it); delete_project_permanently erases a trashed project for good, only when the user explicitly asks. export_project writes the storyboard CSV or asset ZIPs to a path.",
  "Columns and assets: update_columns edits storyboard columns; rename_asset, replace_asset and delete_assets manage the asset library (delete_assets removes files from disk).",
  "Voiceover (配音): generate_voiceover makes MP3s with the ElevenLabs key saved in the user's MkBoard account (list_voices shows voices and the default) and puts them in the asset library. It uses the user's own ElevenLabs quota.",
  "MkBoard generation: generate_shot_images and generate_shot_videos run MkBoard's own generators on shots, reading each shot's 生成方式 and prompt columns, so write those prompts first (update_shot_cells). Images and Seedance videos run in MkBoard cloud and spend the user's credits; Hyperframes renders locally. Call dryRun (and get_credits) first and tell the user the estimated credits before a batch. get_generation_status collects results that finish later; cancel_video_generation stops running videos.",
  "These tools never read account credentials."
].join("\n");
