# Immersive-Input Git 提交规范门禁

本仓库使用 Husky 和 commitlint 校验提交信息，确保提交历史可以按产品能力和功能分组阅读。

## 必须满足

1. 标题符合 `type(scope): 中文摘要`。
2. `type` 为小写英文，并属于允许列表：`feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`build`、`ci`、`chore`、`revert`、`i18n`。
3. subject 必须包含中文摘要。
4. body 非空，且至少包含一项有序编号列表（`N. 说明`）。
5. 编号项下可使用 `-` 或 `*` 表达子项。

## 推荐格式

```text
feat(reader): 增加文档阅读能力

功能分组
  1. 新增阅读入口
     - 保留现有配置
     - 增加失败提示

测试
  1. 更新相关测试
```

编号前的两个空格是排版建议，不是单独的强制规则。

## 本地验证

```powershell
pnpm exec commitlint --edit .tmp\commit-message.txt
git diff --check
```
