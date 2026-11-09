# 项目接续入口（每次会话先读）

## 项目一句话
横屏 2.5D 手游（暂名未定），**饥荒 + 浮岛 + 星露谷 + 宝可梦**：在云海上的家园浮岛种田、照顾宠物、和居民来往；带着宠物乘飞艇去随机生成的远征浮岛采集、制作、熬过有雾怪的夜晚（中度生存）；遇到野生宠物进行回合制对战，打弱后用捕宠网捕捉。画面和 UI 以负责人自己的 7 张风格示例为准。

**产品形态**：国内手游（安卓 + 苹果），免费下载，收入来自外观 + 季节通行证 + 月卡，**不卖数值**。宠物有完整养成线。美术用 AI 出图（GPT Image 2.6，负责人出图，AI 写提示词和做后期）。

## 负责人与协作方式
- 项目负责人：游戏运营出身，非技术背景。决定核心体验、范围、取舍和验收结论。
- AI（Claude）：在授权范围内做策划拆解、写代码、整理素材、做验证。
- 和负责人沟通用**中文**，少用术语；需要决策时给推荐项和理由。
- 负责人授权（2026-11-08）：玩法细节和数值由 AI 判断，写进文档标【建议】并在汇报里说明；只有方向性问题（美术风格、商业化、范围取舍、花钱的事）才停下来问。

## 当前状态（2026-11-09）
- 阶段：M1。**M1 开发任务全部实现（T02–T08、T10、T19、T20、T25），M2 开发任务全部实现（T21–T24），待负责人验收**：Phaser 4.2.1 横屏占位岛、摇杆/键盘移动、宠物跟随与切换、焰尾狐化形演示；界面框架（HUD、面板栈、演示面板）；宠物/技能/性格数据和属性、伤害、经验、捕捉、进化公式（`systems/petMath.js`）；存档（`systems/save.js` + `GameSession.js`：校验码、备份回退、版本迁移、自动存档）；时间昼夜与每日结算（`systems/time.js`，占位帐篷睡觉）；生命与饱食、吃东西（`systems/survival.js`、`inventory.js`）。远征岛随机生成（`systems/islandGen.js`）；飞艇出发与返回、倒下临时处理（`systems/travel.js`）；采集与制作（`systems/crafting.js`、`data/recipes.js`）；回合制宠物对战与捕捉（`systems/battle.js`、`scenes/BattleScene.js`）、队伍面板（`systems/party.js`）；倒下与失物包（`systems/travel.js`）；夜晚雾怪与光照（`systems/night.js`）；扎营、营火燃料、帐篷、开宝箱（`systems/camp.js`）；宠物探索技能、地图、家园仓库（`systems/explore.js`）；新手引导（`systems/guide.js`，T42）；M3：新手保护（前 3 天倒下不掉）、种田与出货（`systems/farm.js`、`data/crops.js`、`scenes/play/farm.js`，T11）；宠物照顾、打工、羁绊（`systems/petcare.js`，T12）；每日小任务（`systems/daily.js`，T44）；养成：进化、升星结晶异色图鉴、技能书、化形（`systems/growth.js`，T27/T28/T29/T39）。**M3 开发任务全部实现**。M4：风铃小镇（`systems/town.js`、`data/npcs.js`、`data/quests.js`、`scenes/play/town.js`，T13）；买地扩建与修桥（`systems/progress.js`，T14）；家园小屋与布置家具（`systems/house.js`、`scenes/play/house.js`，T15）；标题页与开局三选一（`scenes/TitleScene.js`，开局宠物 4 级，T16）。**M4 开发任务全部实现**。界面自动检查 157/157、逻辑检查 448/448、长测通过。存档版本 5。
- 界面零件：负责人正在逐个手绘（T41），到了再换进 `widgets.js`；main 分支上的矢量重绘包只作参考和备用，不直接接入。
- 已完成：方向确认；知识库搭建；引入游戏开发 skills；冒险探索、捕捉、宠物养成、商业化设计（开工图 v0.4、`docs/06`–`09`）；参考视频笔记；风格示例图入库。
- 宠物名单（2026-11-08）：橡果刺猬（森）、航海鲨（水）、冰蓝小狼（水）、月影狐猫（暗）、星星熊仔（光）、焰尾狐（火）及其人形态（化形）全部定稿并抠图（`game/assets/pets/`，7 张待机图）。素材处理脚本和用法见 `tools/art/README.md`（抠图 `cutout.py`、无缝地块 `seamless.py`）。草地地块 `game/assets/tiles/tile_grass.png` 和 3 个物品图标 `game/assets/items/` 已入库，草地已用在游戏里。属性 5 种：森水火光暗。
- 美术原创要求：出图不上传他人角色图；新图要和负责人提供的原截图并排对比原创度。抠图用 rembg（isnet-general-use 模型），已装在负责人电脑的 Python 里。
- 等负责人：手机实测 T02；看一眼游戏里的新草地确认 T17；通读 07、08。
- 参考游戏对照（2026-11-09）：`docs/11_参考游戏对照.md`；已完成 ① 饥饿放慢、② 好感节奏。参考资料库：`docs/参考资料/拆解/`（四款游戏流程拆解；wiki 原文只放本地 `docs/参考资料/wiki原文/`，不进仓库）。
- **完整流程 v0.3** `docs/12_完整流程.md`：负责人定 A 点亮群岛 + B 研究员星级 + C 复兴小镇三条线都做，逐步解锁、防臃肿（见 12 第 2.1 节五条规矩）。开发顺序建议：③ 野外扔网 → ④ 图鉴调查 → 收集包 + 研究所 → ⑤ 头领 + 灯塔 + 目标面板（第 1 章闭环）→ ⑥ → 沙丘。待负责人确认首发范围和顺序。 手游参考见 `docs/参考资料/拆解/手游参考.md`；社交档位待负责人定（12 第 9 节）。
- 下一步：M4 开发已完成，等负责人验收和手机实测（T18）。之后：T43 宽屏适配与大字号（配合 T41 手绘界面零件）、M5 商业化与上架准备。居民立绘、进化 / 异色立绘、界面零件等负责人出图后替换。试玩（T09、T26）等负责人安排。
- 工作副本：负责人电脑 `C:\Users\1\Desktop\lingmu-survival`（Windows，VS Code 本地会话）；云端会话也用同一个 GitHub 仓库。

## 文档索引（有效规则以这里为准）
| 文件 | 内容 |
|---|---|
| `docs/00_开工图.md` | 玩法循环、需求 R-ID、系统 S-ID、首版范围、里程碑、未决策项 |
| `docs/01_美术风格指南.md` | 风格示例要点、配色、UI 组件规范 |
| `docs/02_宠物战斗与数值.md` | 宠物、技能、属性克制、公式与演算例子 |
| `docs/03_素材规范.md` | 美术交图要求、命名、尺寸 |
| `docs/04_研发待办.csv` | 任务 T-ID、依赖、完成标准、状态（UTF-8 BOM，可用 Excel 打开） |
| `docs/05_开发日志.md` | 每次会话做了什么、决策和变更记录 |
| `docs/06_远征与生存.md` | 制作、生存状态、倒下与失物包、夜晚雾怪与光照、远征岛随机生成 |
| `docs/07_宠物养成.md` | 进化、资质与升星、性格、技能学习、羁绊、异色、装扮 |
| `docs/08_商业化设计.md` | 付费原则（不卖数值）、货币、商品、活动、广告、国内上架清单 |
| `docs/09_AI出图提示词.md` | GPT Image 出图流程、风格段落、第一批素材提示词 |
| `docs/10_手游适配评估.md` | 当前玩法作为手游的逐项评估、必须改 / 要验证的事项和顺序 |
| `docs/参考资料/风格示例/` | 负责人的 7 张风格示例图（画面和 UI 的标准） |
| `docs/参考资料/README.md` | 外部资料说明（资料包原件不入库） |

## 技术约定
- 引擎：Phaser 4.2（网页），库文件放进仓库本地引用，不依赖 CDN。后期用 Capacitor 打包安卓/iOS。
- 视角：2.5D 固定 3/4 俯视角手绘风，按网格摆放；不做真 3D（2026-11-08 负责人看过实时 3D 方案后再次确认）。
- 手工地图用整张背景；随机远征岛用拼接地块 + 摆件（见 `docs/03_素材规范.md`）。
- 战斗：探索中的危险（夜晚雾怪）是即时的，宠物对战是回合制。
- 随机生成用固定的伪随机算法 + 种子，同一种子必须生成同一座岛；存档只存种子和变化记录。
- 逻辑分辨率 960×540 横屏，FIT 缩放；触屏为主（左下虚拟摇杆、右下动作按钮），键盘为辅。
- 内容（宠物、技能、作物、物品、NPC、任务）写成数据文件，不硬编码在逻辑里。
- 存档：localStorage，带 `version` 字段和迁移函数，保留上一份备份。进度唯一来源是 `game.session.state`（纯 JSON，不存属性等可现算的值）；HUD 数值镜像在 registry；场景用 `session.onBeforeSave()` 写回自己管的部分（如玩家位置），改了状态调 `markDirty()` 或重要时刻 `save()`。改存档格式时：`SAVE_VERSION` +1 并在 `MIGRATIONS` 加一步，旧步骤不改。对战、倒下动画期间 `session.store.block(原因)`。
- 代码目录：`game/index.html`（入口）、`game/src/main.js`、`game/src/config.js`（分辨率、配色、URL 参数）、`game/src/scenes/`（BootScene 加载与占位贴图、TitleScene 标题页与开局选宠物、PlayScene 世界（本体只有 create/update 调度，具体方法按主题放在 `scenes/play/`：world 建图碰撞、actors 角色宠物、night 时间夜晚、expedition 采集营火宝箱、flow 对战转场倒下引导、interaction 互动按钮，用 Object.assign 挂到 PlayScene 上）、UIScene 屏幕界面、BattleScene 宠物对战）、`game/src/systems/`（input 动作映射、rng 种子随机、petMath 宠物属性与战斗公式、save 存档读写与校验、GameSession 当前进度与自动存档、time 时钟昼夜与每日结算、survival 生命饱食与进食、inventory 背包增减、islandGen 远征岛生成与变化记录、travel 飞艇往返与倒下临时处理、crafting 采集制作与背包容量、battle 回合制对战与捕捉、party 队伍管理、night 雾怪与光源、camp 营火帐篷宝箱、explore 探索技能与仓库、guide 新手目标与提示、farm 农田与出货、petcare 喂食摸摸打工羁绊、daily 每日任务、growth 进化升星技能书化形、town 小镇居民任务商店、progress 扩建与修桥、house 小屋布置家具）、`game/src/ui/`（widgets 木框奶油色组件与矢量图标、PanelStack 面板栈、panels 演示面板、VirtualJoystick）、`game/src/data/`（pets、skills、natures、elements、items、recipes、crops 作物与出货价；物品 ID 统一 `item_xxx`，宠物喜好食物也用它）、`game/assets/`、`game/vendor/phaser.min.js`（4.2.1，MIT）。无构建步骤，原生 ES 模块。
- 占位图都在 BootScene 里用 canvas 画（主角、树、石头、云、影子），正式素材到位后换成图片，键名不变。
- 两层场景：PlayScene 只管世界；UIScene 叠在上面，放 HUD、摇杆、互动按钮、提示条、面板。两层不互相调用，只通过 registry（共享状态：day、clock、hp、hunger、clover、uiModal 等，HUD 监听变化自动刷新）和 game.events（`toast`、`interact-available`、`action-pressed`）通信。
- 文字一律用 `widgets.js` 的 `text()`（最小字号 14，手机上约 10 像素；新界面正文尽量 16+）。新系统里玩家完成的关键动作要 `guide.bump(state, 计数名)`，引导和以后的每日任务都读这些计数。
- 界面按钮一律用 `widgets.js` 的 `makeClickable`：按下和松开都在同一个按钮上才算点击，防止关弹窗时误触下面的按钮；面板关闭后 150ms 内忽略点击。触控区域 ≥ 44、HUD 离屏幕边 ≥ 24，自动检查会验证。
- 美术素材未到位时用代码绘制的占位图，素材到位后替换，不改逻辑。AI 原图放 `art/raw/`（不提交），处理后放 `game/assets/`。
- 任何付费点都要对照 `docs/08_商业化设计.md` 第 1 节原则（不卖数值、不卖惩罚豁免）。

## 工作规则（来自负责人提供的《AI 游戏开发资料包 v1.2》方法）
1. 需求、系统、任务分别用稳定编号 R01 / S01 / T01，变更时保留编号，删除的标记「取消」并写原因。
2. 结论标注来源：「用户已确认」「计划已批准」「建议」「待验证」。不要把建议写成已确认。
3. 任务状态只用：待澄清、待开始、执行中、待验收、已完成、阻塞、取消。
4. 没有实际运行验证不能标「已完成」，只能标「待验收」；记录验证环境和证据（截图、操作步骤）。
5. 执行任务按五项任务卡：期望结果、工作范围、边界与批准、完成标准、验证与汇报。
6. 规则改动要同步检查：需求、系统分案、数据、任务、存档兼容、验收。
7. 每次会话结束前更新 `docs/05_开发日志.md` 和本文件的「当前状态」。

## 运行与验证
- 本地运行：`python -m http.server 8000 --directory game`，浏览器打开 `http://localhost:8000`。URL 参数：`?debug=1` 显示帧率、格子坐标和时钟，`?seed=数字` 换一座占位岛，`?timescale=60` 时间加快 60 倍。
- 逻辑检查：`cd tools && node logic-test.mjs`（不开浏览器，核对文档里的演算例子和验收用例；纯规则代码放 `systems/`、`data/`，不能引用 Phaser）。
- 长时间游玩测试：`cd tools && node soak-test.mjs [天数] [开局宠物 acorn|shark|fox]`（从标题页真实开局，默认 fox）（默认 6 天，真实游戏里连续玩，检查存档、数值、泄漏、报错；大改后跑一次）。
- 自动检查：`cd tools && npm install && node smoke-test.mjs`。主流程用 `?demo=1`（跳过标题页、6 只宠物的演示开局），最后另开一个干净浏览器测标题页和选宠物。用本机 Edge（playwright-core，不下载浏览器）以 844×390 手机横屏 + 触屏打开游戏，测加载、缩放、键盘、触屏摇杆、岛边碰撞、互动、按钮、竖屏提示、报错；截图在 `tools/out/`（不提交）。**改完代码都要跑一遍，并看截图。**
- 夜色与光：PlayScene 的 `tint` 是 MULTIPLY 混合的 RenderTexture，每帧 `clear → fill(夜色) → erase(光刷, 每个光源) → render()`（Phaser 4 的 RenderTexture 要调 `render()` 才生效）。光源来自 `night.lights()`：`this.fires`（家园是固定营火；远征岛每帧由 `updateFires` 从存档 `expedition.fires` 里还在烧的营火算出）+ 玩家身边的光。要在夜里看得见的东西（雾怪、预警圈）深度设在 8500 以上。
- 互动按钮：PlayScene `setActionVerb(动作名)` 发 `interact-available(ready, verb)`，UIScene 把按钮文字换成动作名；新增可互动的东西时在 spots 里写 `verb`。
- 时间：PlayScene 每帧调 `GameClock.advance()`，时钟写回 state 和 registry；每 10 游戏分钟发 `time-tick`，阶段变化发 `phase-change`，结算后发 `day-summary`。新系统要在每日结算里做事，就在 `time.js` 的 `SETTLEMENT_STEPS` 对应步骤里填，别另起结算。
- 地图：PlayScene 按 `state.player.area`（home / expedition / town / house）建图，换地图就改存档再 `scene.restart()`。Phaser 的场景对象重启时会复用，**create()/init() 开头要把上一次留下的字段清空**（已踩过三次坑：帐篷提示、HUD 图标、对战结算面板）。存档前的位置钩子只在「存档里的区域 = 当前地图」时写位置，否则转场时会把旧地图坐标带到新地图。远征岛只存种子 + `expedition.changes`（collected / chests / pets 编号）。
- 对战：PlayScene.startBattle 暂停自己和 UIScene、挡住存档和时钟，launch BattleScene；BattleScene 结束时调 finishBattle 一次提交，发 `battle-end`。测试里设 `window.__battleFast = true` 加快动画；BattleScene 有 `debugBattle()`、`findTarget()`。
- 测试钩子：PlayScene 的 `debugState()`、`teleport()`、`findClearRun()`、`debugAdvance(分钟)`、`travelTo(种子)`、`goHome()`；UIScene 的 `debugUi()`、`findTarget(按钮名)`。`window.__game` 是游戏实例。

## Git
- 开发分支：`claude/sweet-mccarthy-tbgtnu`。仓库是**公开**的：不要提交第三方资料原件、未授权素材或任何密钥。
