# apps/desktop/AGENTS.md

## 桌面端定位

`apps/desktop/` 是 MkBoard 正式 Electron 桌面客户端。这里的 UI、交互和本地数据读写以当前桌面端产品为准，不再参考旧客户端原型。

## HeroUI 使用规划

- 可由 HeroUI 覆盖的基础控件优先使用 `@heroui/react`，包括 `Button`、`Input`、`TextArea`、`Tabs`、`Select`、`ListBox`、`Popover`、`Switch`、弹窗动作按钮和菜单项。
- 替换现有控件时，优先保持原有 MkBoard className 和交互语义，再把底层元素换成 HeroUI 组件；不要因为使用组件库而改成通用模板风格。
- 导航按钮、工具栏按钮、菜单项、确认弹窗按钮、批量操作条按钮、筛选 Tabs、下拉选择器等，默认都应先评估 HeroUI 实现。
- 表格单元格、拖拽手柄、列宽调整、媒体预览区域、富文本编辑器和 Electron 原生文件路径相关入口，如果原生元素承载了特殊事件或浏览器能力，可以暂时保留原生实现，但要在代码附近保持明确语义和可访问性属性。
- HeroUI 组件的禁用态优先使用 `isDisabled`，点击动作优先使用 `onPress`；只有需要阻止冒泡、读取原始鼠标事件或表单提交时，才保留 `onClick` / `type="submit"` 等原生事件接口。
- `Popover`、`Select`、`Tabs` 等复合组件应使用 HeroUI 推荐的组合结构，并用项目内专用 className 控制样式，避免使用容易和库内部样式冲突的通用命名。

## 样式约束

- 不要为了迁移 HeroUI 删除 MkBoard 已形成的视觉语言。组件库负责基础行为、焦点、禁用态和键盘交互，产品样式仍由桌面端 CSS 控制。
- 新增样式必须限定在桌面端本地 className 下，不要写会影响 `apps/web`、`apps/admin` 或全局 HeroUI 组件默认表现的选择器。
- 图标按钮继续优先使用 `lucide-react` 图标，并提供 `aria-label` 或可见文本。

## 校验

- UI 组件替换后至少运行 `pnpm --filter @mkboard/desktop typecheck`。
- 涉及构建产物或组件组合较多时，再运行 `pnpm --filter @mkboard/desktop build`。
