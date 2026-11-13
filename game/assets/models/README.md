# 3D 模型

宠物和主角的 3D 模型（GLB）。**不要手改这些文件**：它们是用 Blender 按脚本生成的，改造型请改 `tools/blender/` 里的脚本再重新生成。

- 生成：`blender -b -P tools/blender/build.py -- fox pup`（不写名字 = 全部）。
- 查看：`kit3d.html?glb=fox,pup`（每个模型正面、背面各一个）。
- 接入：`src/view3d/kit/pets.js` 里把贴图名对应到模型，并给各部件加动作。
- 模型约 1 个单位高，脚踩 z = 0；部件名 body / head / tail / earL / earR / armL / armR / legL / legR / orb 是游戏里做动作用的。
