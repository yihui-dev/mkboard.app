import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MkboardStore } from "../src/main/database.ts";
import { getDefaultStoryboardColumns } from "../src/shared.ts";

function createStoreFixture() {
  const root = mkdtempSync(join(tmpdir(), "mkboard-template-test-"));
  return {
    root,
    store: new MkboardStore(join(root, "data", "mkboard.sqlite"), join(root, "projects"))
  };
}

test("custom templates support update, snapshot isolation, write protection, and reference-safe deletion", () => {
  const { root, store } = createStoreFixture();

  try {
    const templates = store.listTemplates("zh-CN");
    const builtInTemplate = templates.find((template) => template.scope === "system");
    assert.ok(builtInTemplate);

    const originalSkill = store.listSkills("zh-CN")[0];
    const taste = store.listTastes()[0];
    assert.ok(originalSkill);
    assert.ok(taste);

    const originalColumns = getDefaultStoryboardColumns("zh-CN");
    const template = store.createTemplate({
      name: "课程分镜",
      description: "适合课程视频",
      columns: originalColumns,
      storyboardSkillId: originalSkill.id,
      interfaceLanguage: "zh-CN"
    });

    assert.throws(
      () =>
        store.createTemplate({
          name: " 课程分镜 ",
          description: "同名",
          columns: originalColumns,
          storyboardSkillId: originalSkill.id,
          interfaceLanguage: "zh-CN"
        }),
      /同名/
    );

    const oldProject = store.createProject({
      name: "旧项目",
      icon: "clapperboard",
      templateId: template.id,
      tasteId: taste.id,
      imageRatio: "9:16",
      storyboardSkillId: originalSkill.id,
      interfaceLanguage: "zh-CN"
    });
    assert.equal(oldProject.imageRatio, "9:16");
    assert.equal(oldProject.project.imageRatio, "9:16");
    assert.equal(store.listProjects().find((project) => project.id === oldProject.project.id)?.imageRatio, "9:16");
    const oldColumnsSnapshot = oldProject.columns.map((column) => ({ ...column }));
    const oldSkillSnapshot = oldProject.storyboardSkill.id;

    const replacementSkill = store.createSkill({
      name: "课程分镜技能",
      description: "测试模板技能快照",
      content: "按课程结构拆分分镜。"
    });
    const updatedColumns = [
      ...originalColumns
        .filter((column) => column.id !== "note")
        .map((column) => {
          if (column.id === "shot") return { ...column, label: "镜次" };
          if (column.id === "custom-1") return { ...column, label: "画面描述", type: "select" };
          return column;
        }),
      { id: "custom-88", label: "教学目标", type: "text", visible: true, custom: true }
    ];
    const updatedTemplate = store.updateTemplate({
      id: template.id,
      name: "课程分镜 Pro",
      description: "适合结构化课程视频",
      columns: updatedColumns,
      storyboardSkillId: replacementSkill.id,
      interfaceLanguage: "zh-CN"
    });

    assert.equal(updatedTemplate.name, "课程分镜 Pro");
    assert.equal(updatedTemplate.description, "适合结构化课程视频");
    assert.equal(updatedTemplate.storyboardSkillId, replacementSkill.id);
    assert.ok(updatedTemplate.columns.some((column) => column.id === "custom-88"));
    assert.equal(updatedTemplate.columns.some((column) => column.id === "note"), false);
    assert.equal(updatedTemplate.columns.find((column) => column.id === "shot")?.label, "镜次");
    assert.deepEqual(
      updatedTemplate.columns.find((column) => column.id === "custom-1"),
      { id: "custom-1", label: "画面描述", type: "select", visible: true, custom: true }
    );

    assert.throws(
      () =>
        store.createTemplate({
          name: "课程分镜 pro",
          description: "同名",
          columns: originalColumns,
          storyboardSkillId: originalSkill.id,
          interfaceLanguage: "zh-CN"
        }),
      /同名/
    );

    const oldProjectAfterTemplateUpdate = store.getProject(oldProject.project.id, "zh-CN");
    assert.deepEqual(oldProjectAfterTemplateUpdate.columns, oldColumnsSnapshot);
    assert.equal(oldProjectAfterTemplateUpdate.storyboardSkill.id, oldSkillSnapshot);

    const newProject = store.createProject({
      name: "新项目",
      icon: "clapperboard",
      templateId: template.id,
      tasteId: taste.id,
      interfaceLanguage: "zh-CN"
    });
    assert.ok(newProject.columns.some((column) => column.id === "custom-88"));
    assert.equal(newProject.columns.some((column) => column.id === "note"), false);
    assert.equal(newProject.columns.find((column) => column.id === "shot")?.label, "镜次");
    assert.equal(newProject.columns.find((column) => column.id === "custom-1")?.type, "select");
    assert.equal(newProject.storyboardSkill.id, replacementSkill.id);
    assert.equal(newProject.imageRatio, "16:9");

    store.updateProject({ id: newProject.project.id, name: newProject.project.name, imageRatio: "3:4" });
    const resizedProject = store.getProject(newProject.project.id, "zh-CN");
    assert.equal(resizedProject.imageRatio, "3:4");
    assert.equal(resizedProject.project.imageRatio, "3:4");

    assert.throws(
      () =>
        store.updateTemplate({
          id: builtInTemplate.id,
          name: "不可修改",
          description: "",
          columns: builtInTemplate.columns,
          storyboardSkillId: builtInTemplate.storyboardSkillId,
          interfaceLanguage: "zh-CN"
        }),
      /内置/
    );
    assert.throws(() => store.deleteTemplate(builtInTemplate.id), /内置/);

    const remainingTemplates = store.deleteTemplate(template.id);
    assert.equal(remainingTemplates.some((item) => item.id === template.id), false);

    const oldProjectAfterDelete = store.getProject(oldProject.project.id, "zh-CN");
    const newProjectAfterDelete = store.getProject(newProject.project.id, "zh-CN");
    assert.equal(oldProjectAfterDelete.project.templateId, builtInTemplate.id);
    assert.equal(newProjectAfterDelete.project.templateId, builtInTemplate.id);
    assert.deepEqual(oldProjectAfterDelete.columns, oldColumnsSnapshot);
    assert.equal(oldProjectAfterDelete.storyboardSkill.id, oldSkillSnapshot);
    assert.ok(newProjectAfterDelete.columns.some((column) => column.id === "custom-88"));
    assert.equal(newProjectAfterDelete.storyboardSkill.id, replacementSkill.id);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
