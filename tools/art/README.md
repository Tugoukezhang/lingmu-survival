# 美术素材处理脚本

AI 出的原图放 `art/raw/`（不提交），处理结果放 `game/assets/`（提交）。

依赖（装一次）：`python -m pip install --user pillow numpy "rembg[cpu]"`。rembg 第一次运行会下载约 180MB 的抠图模型到 `~/.rembg/`。

## 抠图：`cutout.py`
```
python -E -P tools/art/cutout.py art/raw game/assets/pets preview.jpg pet_fox_idle_01 pet_pup_idle_01
```
- 参数：原图目录、输出目录、预览图路径、一个或多个文件名（不带 .png）。
- 输出：`<名字>.png`（默认 256×256）和 `<名字>@2x.png`，角色居中、底部对齐、透明背景；预览图是深色棋盘格底，方便检查残边。
- 环境变量：
  - `CUT_UNION=1`：白毛、白色编织物多的图必开。rembg 模型会把大片白色当成背景，这个模式把「模型结果」和「从图片边缘连通的白底」两种判断取并集，被描边包住的白色会保留；同时按实心像素裁边，去掉边缘残点。
  - `CUT_SIZE=128`：输出尺寸（物品图标用 128）。
  - `CUT_MODEL=flood`：不用模型，只用边缘连通判断（适合描边清楚、没有白毛的图）。

## 无缝地块：`seamless.py`
```
python -E -P tools/art/seamless.py art/raw/tile_grass_raw.png game/assets/tiles/tile_grass.png preview_3x3.jpg 384
```
- 取原图中间最大的正方形，先横向、再纵向和错开半张的自己做渐变混合，四边就能无缝拼接；输出指定尺寸，并拼一张 3×3 预览检查接缝。
- 注意：横竖必须分两次做；同时做会在每块中间留下淡淡的十字线。

## 检查清单
- 预览图上看：边缘有没有白边或残影、白色部位有没有被抠成半透明、3×3 拼接有没有接缝。
- 放进游戏后跑 `tools/smoke-test.mjs`，看截图里的大小和画风是否协调。
