# 项目内置 Skills

这些 skill 会在 Claude Code 打开本仓库时自动可用，按需加载。

## 来源

摘自 [gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills)
（Apache-2.0，提交 `19d93f97c9c1ea0f8b306e77aa81e0d3e352d3e9`，2026-11-07 取用）。
许可与署名见同目录 `LICENSE-awesome-gamedev-agent-skills.txt`、`NOTICE-awesome-gamedev-agent-skills.txt`。
取用时逐个审读过内容；仅删除了 `create-game-assets/agents/`（OpenAI 专用配置，本项目不用），其余未改动。

| Skill | 用途 | 本项目何时用 |
|---|---|---|
| `phaser-core` | Phaser 4 场景、加载、镜头 | 写任何游戏代码前 |
| `prototype-fast` | 快速原型、去留标准 | 每个里程碑的试玩验证 |
| `rpg` | 成长、背包、任务、战斗系统设计 | 宠物成长、战斗、任务 |
| `game-feel` | 打击感、缓动、反馈分级 | 战斗与收获反馈打磨 |
| `game-ui-ux` | HUD、菜单栈、缩放、安全区 | 横屏手机 UI |
| `input-systems` | 动作映射、触屏/键盘 | 虚拟摇杆与按钮 |
| `save-systems` | 存档版本、迁移、防损坏 | 存档实现 |
| `create-game-assets` | 美术方向、素材清单、切图校验 | 接收与整理美术素材 |

## 更新方式

到上游仓库对比新版本，审读差异后再替换对应目录，并更新上面的提交号和日期。
