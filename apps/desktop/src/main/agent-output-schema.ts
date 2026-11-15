import { seedanceAspectRatioValues, type StoryboardColumn } from "../shared";

export type JsonSchema = Record<string, unknown>;

export type AgentOutputSchemaOptions = {
  requireRows?: boolean;
};

export function buildAgentOutputSchema(columns: StoryboardColumn[], options: AgentOutputSchemaOptions = {}): JsonSchema {
  const customValuesSchema = buildAgentCustomValuesSchema(columns);
  const rowRefSchema = buildAgentRowRefSchema();
  const insertedShotSchema = strictObjectSchema({
    scene: { type: ["string", "null"] },
    duration: { type: ["string", "null"] },
    content: { type: ["string", "null"] },
    note: { type: ["string", "null"] },
    imageAssetIds: nullableArraySchema({ type: "string" }),
    customValues: customValuesSchema
  });
  const operationSchema = strictObjectSchema({
    type: {
      type: "string",
      enum: [
        "update_script",
        "sync_script_a_roll_tags",
        "parse_storyboard",
        "update_shot_cells",
        "insert_shots",
        "delete_shots",
        "duplicate_shots",
        "reorder_shot",
        "update_shot_media",
        "regenerate_media"
      ]
    },
    scriptHtml: { type: ["string", "null"] },
    rowRef: nullableSchema(rowRefSchema),
    cells: nullableArraySchema(
      strictObjectSchema({
        field: { type: "string" },
        value: { type: "string" }
      })
    ),
    placement: { type: ["string", "null"], enum: ["before", "after", "end", null] },
    count: { type: ["number", "null"] },
    rows: nullableArraySchema(insertedShotSchema),
    rowRefs: nullableArraySchema(rowRefSchema),
    targetRowRef: nullableSchema(rowRefSchema),
    assetIds: nullableArraySchema({ type: "string" }),
    kind: { type: ["string", "null"], enum: ["image", "video", null] },
    provider: { type: ["string", "null"], enum: ["dreamina_cli", null] },
    aspectRatio: { type: ["string", "null"], enum: [...seedanceAspectRatioValues, null] },
    overwriteExisting: { type: ["boolean", "null"] }
  });
  const storyboardRowSchema = strictObjectSchema({
    id: { type: "string" },
    shot: { type: "string" },
    scene: { type: "string" },
    duration: { type: "string" },
    content: { type: "string" },
    note: { type: "string" },
    imageAssetIds: {
      type: "array",
      maxItems: 10,
      items: { type: "string" }
    },
    imageAssetId: { type: ["string", "null"] },
    customValues: customValuesSchema
  });

  return strictObjectSchema({
    reply: { type: "string" },
    operations: nullableArraySchema(operationSchema),
    scriptHtml: { type: ["string", "null"] },
    rows: options.requireRows ? arraySchema(storyboardRowSchema, { minItems: 1 }) : nullableArraySchema(storyboardRowSchema)
  });
}

function strictObjectSchema(properties: Record<string, JsonSchema>): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required: Object.keys(properties)
  };
}

function nullableSchema(schema: JsonSchema): JsonSchema {
  return {
    anyOf: [schema, { type: "null" }]
  };
}

function arraySchema(items: JsonSchema, extra: JsonSchema = {}): JsonSchema {
  return {
    items,
    type: "array",
    ...extra
  };
}

function nullableArraySchema(items: JsonSchema): JsonSchema {
  return {
    anyOf: [
      {
        type: "array",
        items
      },
      { type: "null" }
    ]
  };
}

function buildAgentRowRefSchema(): JsonSchema {
  return strictObjectSchema({
    kind: { type: "string", enum: ["id", "index"] },
    value: {
      anyOf: [{ type: "string" }, { type: "number" }]
    }
  });
}

function buildAgentCustomValuesSchema(columns: StoryboardColumn[]): JsonSchema {
  const properties = Object.fromEntries(
    columns
      .filter((column) => column.custom && column.visible)
      .map((column) => [column.id, { type: "string" }])
  ) as Record<string, JsonSchema>;
  return strictObjectSchema(properties);
}
