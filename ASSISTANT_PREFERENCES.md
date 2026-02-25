# Assistant Preferences

## Purpose

This file records assistant usage preferences for repository-related work. The assistant should read and follow these preferences at the start of any task in this repository when applicable.

## Preferences

- UI Design Style:
  - 在浅色模式下，严禁使用纯黑（#000000）背景色作为大面积区块。
  - 对于选中状态或详情面板，应使用浅灰色（如 neutral-100/200）或稍微加深的色调（如 neutral-50），配合边框和阴影来增加层次感，避免刺眼的对比。
  - 详情面板应保持浅色调，通过柔和的背景色和细微的阴影来区分。

## Behavioral notes

- The assistant SHOULD NOT modify this file without explicit user permission.
- The assistant SHOULD honor these preferences for documentation, commit messages, PR descriptions, and interactive conversation about the repo.
- If a task requires producing artifacts in other languages (e.g., localized README files), the assistant should confirm the target language with the user.

## How to use

1. At the start of a new task, the assistant reads ASSISTANT_PREFERENCES.md and sets its language for replies accordingly.
2. If the repository contains a different or conflicting preference, the assistant asks the user to resolve the conflict.

## Notes

This file is a human-readable helper for consistency. It is not enforced by any automation. Users may remove or modify it at any time.
