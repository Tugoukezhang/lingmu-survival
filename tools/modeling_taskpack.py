# Builds docs/16_建模任务包/: the list of modelling / rigging jobs for the owner (Tripo web), with every input picture
# and the models that only need rigging. Re-run to refresh (statuses are kept in STATUS below).
import os, io, csv, shutil
from PIL import Image

ROOT = 'C:/Users/1/Desktop/lingmu-survival/'
OUT = ROOT + 'docs/16_建模任务包/'
IMG, MOD, DONE = OUT + '图片/', OUT + '模型/', OUT + '完成的模型放这里/'
for d in (IMG, MOD, DONE):
    os.makedirs(d, exist_ok=True)
INC = ROOT + 'art/raw/incoming/'
RAW = ROOT + 'art/raw/'

def picture(src, name):
    """white background, at most 1280 px, JPEG"""
    im = Image.open(src).convert('RGBA')
    bb = im.getbbox()
    if bb: im = im.crop(bb)
    pad = int(max(im.size) * 0.06)
    bg = Image.new('RGBA', (im.width + pad * 2, im.height + pad * 2), (255, 255, 255, 255))
    bg.alpha_composite(im, (pad, pad))
    bg = bg.convert('RGB')
    if max(bg.size) > 1280:
        k = 1280 / max(bg.size); bg = bg.resize((round(bg.width * k), round(bg.height * k)), Image.LANCZOS)
    bg.save(IMG + name, quality=92)
    return '图片/' + name

rows = []
def add(tid, pri, kind, name, what, upload, faces, tex, rig, anims, deliver, credits, note=''):
    rows.append(dict(编号=tid, 优先级=pri, 类别=kind, 名称=name, 做什么=what, 上传的文件=upload, 面数上限=faces, 贴图=tex, 骨骼类型=rig, 动作=anims, 导出=('GLB，带动画，原地播放' if rig != '不绑' else 'GLB'), 交付文件名=deliver, 参考积分=credits, 备注=note, 状态='待做'))

# ---- A: models already generated, only need a skeleton and motions ----
A = [('player', '主角'), ('pup', '冰蓝小狼'), ('acorn', '橡果刺猬'), ('shark', '航海鲨'), ('starbear', '星星熊仔'), ('shadecat', '月影狐猫')]
import glob
for i, (key, cn) in enumerate(A, 1):
    cands = glob.glob(ROOT + f'art/raw/models/tripo/{key}/**/model.glb', recursive=True)
    cands = [c for c in cands if 'rig' not in c.replace('\\', '/').split('/')[-2] and 'anim' not in c.replace('\\', '/').split('/')[-2]]
    if cands:
        shutil.copyfile(cands[0], MOD + f'A{i:02d}_{cn}.glb')
    add(f'A{i:02d}', 'P0', '只绑骨骼', cn, '上传模型 → 绑骨骼 → 加动作 → 导出', f'模型/A{i:02d}_{cn}.glb', '不改（已是约 1.5 万面）', '不改', '两足（先点「检查」，以网页建议为准）', '待机 idle、走路 walk', f'{key}_rig.glb', 45,
        '航海鲨如果检查结果不是两足，按网页建议的类型绑；绑不上就告诉 AI' if key == 'shark' else '')

# ---- B: new characters: picture → model → skeleton → motions ----
B = [
    ('P0', 'npc_granny', '铃奶奶（杂货铺）', INC + 'npc_granny.png', 15000, '两足', '待机、走路', ''),
    ('P0', 'npc_ali', '阿栗（木工坊）', INC + 'npc_ali.png', 15000, '两足', '待机、走路', ''),
    ('P0', 'npc_lumi', '露米（研究所）', INC + 'npc_lumi.png', 15000, '两足', '待机、走路', ''),
    ('P1', 'pet_fox_human', '焰尾狐·人形', RAW + 'pet_fox_human_idle_01.png', 15000, '两足', '待机、走路', ''),
    ('P1', 'pet_fox_evo', '灯焰狐（焰尾狐进化）', INC + 'pet_fox_evo_idle_01.png', 15000, '两足', '待机、走路', ''),
    ('P1', 'pet_pup_evo', '霜原狼（冰蓝小狼进化）', INC + 'pet_pup_evo_idle_01.png', 15000, '两足或四足，以检查为准', '待机、走路', ''),
    ('P1', 'pet_acorn_evo', '橡冠刺猬（橡果刺猬进化）', INC + 'pet_acorn_evo_idle_01.png', 15000, '两足', '待机、走路', ''),
    ('P1', 'pet_shark_evo', '船长鲨（航海鲨进化）', INC + 'pet_shark_evo_idle_01.png', 15000, '以检查为准', '待机、走路', ''),
    ('P1', 'pet_starbear_evo', '星梦熊（星星熊仔进化）', INC + 'pet_starbear_evo_idle_01.png', 15000, '两足', '待机、走路', ''),
    ('P1', 'pet_shadecat_evo', '夜冕狐猫（月影狐猫进化）', INC + 'pet_shadecat_evo_idle_01.png', 15000, '两足', '待机、走路', ''),
    ('P2', 'npc_innkeeper', '旅店老板（第二章）', INC + 'npc_innkeeper.png', 15000, '两足', '待机、走路', '游戏里还没用到'),
    ('P2', 'pet_camel', '驼铃驼（第二章）', INC + 'pet_new_camel_idle_01.png', 15000, '四足，以检查为准', '待机、走路', '游戏里还没用到'),
    ('P2', 'pet_cactusbunny', '仙掌兔（第二章）', INC + 'pet_new_cactusbunny_idle_01.png', 15000, '两足', '待机、走路', '游戏里还没用到'),
    ('P2', 'pet_sundial', '日晷蜥（第二章）', INC + 'pet_new_sundial_idle_01.png', 15000, '以检查为准', '待机、走路', '游戏里还没用到'),
    ('P2', 'boss_mistwood', '雾林头领', INC + 'boss_mistwood_idle_01.png', 20000, '以检查为准', '待机、走路；有「攻击」类预设就再加一个', '游戏里还没用到'),
    ('P2', 'boss_dune', '沙丘头领', INC + 'boss_dune_idle_01.png', 20000, '以检查为准', '待机、走路；有「攻击」类预设就再加一个', '游戏里还没用到'),
    ('P2', 'mon_fog', '雾怪', INC + 'mon_fog_idle_01.png', 10000, '绑不上就不绑', '待机', '半透明的雾，模型效果可能不如现在的图片，可最后再试'),
]
for i, (pri, key, cn, src, faces, rig, anims, note) in enumerate(B, 1):
    tid = f'B{i:02d}'
    up = picture(src, f'{tid}_{cn.split("（")[0].replace("·", "")}.jpg') if os.path.exists(src) else '（缺原图）'
    add(tid, pri, '新角色', cn, '图片生成模型 → 绑骨骼 → 加动作 → 导出', up, faces, '精细 / 高清（2K），不要 PBR', rig, anims, f'{key}.glb', 165, note)

# ---- C: scenery that a generated model would improve (no skeleton) ----
C = [
    ('P0', 'bld_cottage', '我的小屋', INC + 'bld_cottage.png', 10000), ('P0', 'bld_shop_granny', '铃奶奶杂货铺', INC + 'bld_shop_granny.png', 10000),
    ('P0', 'bld_workshop', '阿栗木工坊', INC + 'bld_workshop.png', 10000), ('P0', 'bld_lab', '露米宠物研究所', INC + 'bld_lab.png', 10000),
    ('P0', 'airship', '飞艇', INC + 'prop_airship.png', 10000), ('P0', 'fountain', '喷泉', INC + 'prop_fountain.png', 6000),
    ('P1', 'tent', '帐篷', INC + 'prop_tent.png', 4000), ('P1', 'chest', '宝箱（合）', INC + 'prop_chest_closed.png', 3000), ('P1', 'chest_open', '宝箱（开）', INC + 'prop_chest_open.png', 3000),
    ('P1', 'storage', '仓库箱', INC + 'prop_storage.png', 3000), ('P1', 'shipbox', '出货箱', INC + 'prop_shipping_box.png', 3000), ('P1', 'seedstand', '种子摊', INC + 'prop_seed_stand.png', 4000),
    ('P1', 'dock', '码头', INC + 'prop_dock.png', 5000), ('P1', 'lamp', '路灯', INC + 'prop_lamp.png', 2000), ('P1', 'campfire_lit', '营火', INC + 'prop_campfire_lit.png', 3000),
    ('P1', 'bed', '床', INC + 'furn_bed.png', 3000), ('P1', 'furn_table', '桌子', INC + 'furn_table.png', 2500), ('P1', 'furn_chair', '椅子', INC + 'furn_chair.png', 2000),
    ('P1', 'furn_shelf', '书架', INC + 'furn_shelf.png', 3000), ('P1', 'furn_lamp', '落地灯', INC + 'furn_lamp.png', 2000), ('P1', 'furn_plant', '盆栽', INC + 'furn_plant.png', 2500),
    ('P1', 'furn_chime', '风铃架', INC + 'furn_chime.png', 2500), ('P1', 'furn_horse', '摇摇马', INC + 'furn_horse.png', 3000), ('P1', 'furn_petbed', '宠物窝', INC + 'furn_petbed.png', 2500),
    ('P2', 'bld_inn', '旅店', INC + 'bld_inn.png', 10000), ('P2', 'bld_market', '集市', INC + 'bld_market.png', 10000),
    ('P2', 'lighthouse_on', '灯塔（亮）', INC + 'prop_lighthouse_on.png', 10000), ('P2', 'lighthouse_dune_on', '沙丘灯塔（亮）', INC + 'prop_lighthouse_dune_on.png', 10000),
    ('P2', 'bridge_rope', '吊桥', INC + 'prop_bridge_rope.png', 5000), ('P2', 'lostbag', '遗失的背包', INC + 'prop_lostbag.png', 2500), ('P2', 'board', '告示牌', INC + 'prop_board.png', 2500),
    ('P2', 'rock', '石头 1', INC + 'prop_rock_01.png', 2500), ('P2', 'rock_b', '石头 2', INC + 'prop_rock_02.png', 2500), ('P2', 'crystal', '雾晶矿', INC + 'prop_crystal_ore.png', 3000),
    ('P2', 'sandrock', '沙岩', INC + 'prop_sandrock.png', 2500), ('P2', 'cactus', '仙人掌', INC + 'prop_cactus.png', 3000), ('P2', 'palm', '棕榈树', INC + 'prop_palm.png', 5000),
    ('P3', 'tree', '苹果树', INC + 'prop_tree_01.png', 6000), ('P3', 'tree_b', '松树', INC + 'prop_tree_02.png', 6000), ('P3', 'tree_c', '开花灌木', INC + 'prop_tree_03.png', 5000),
    ('P3', 'bush', '浆果丛', INC + 'prop_bush_berry.png', 4000), ('P3', 'thorn', '荆棘', INC + 'prop_thorn.png', 3000),
]
NOTE = {'campfire_lit': '火苗由程序做；模型里带火也可以，AI 会处理', 'tree': '现在代码做的树会随风动；换成模型后是静止的，不一定更好，最后再定', 'tree_b': '同上', 'tree_c': '同上', 'bush': '同上',
        'chest_open': '和「宝箱（合）」要像同一个箱子；对不上就只做合的，开的由 AI 处理', 'fountain': '水由程序做；模型只要石头水池'}
for i, (pri, key, cn, src, faces) in enumerate(C, 1):
    tid = f'C{i:02d}'
    up = picture(src, f'{tid}_{cn.split("（")[0]}{"_开" if key == "chest_open" else ""}.jpg') if os.path.exists(src) else '（缺原图）'
    add(tid, pri, '场景物件', cn, '图片生成模型 → 导出', up, faces, '标准或精细（1K–2K），不要 PBR', '不绑', '—', f'{key}.glb', 110, NOTE.get(key, ''))

cols = ['编号', '优先级', '类别', '名称', '做什么', '上传的文件', '面数上限', '贴图', '骨骼类型', '动作', '导出', '交付文件名', '参考积分', '备注', '状态']
with io.open(OUT + '任务清单.csv', 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows(rows)

def table(kind):
    rs = [r for r in rows if r['类别'] == kind]
    head = ['编号', '优先级', '名称', '上传的文件', '面数上限', '骨骼类型', '动作', '交付文件名', '参考积分', '备注'] if kind != '场景物件' else ['编号', '优先级', '名称', '上传的文件', '面数上限', '交付文件名', '参考积分', '备注']
    out = ['| ' + ' | '.join(head) + ' |', '|' + '|'.join(['---'] * len(head)) + '|']
    for r in rs:
        out.append('| ' + ' | '.join(str(r[h]) for h in head) + ' |')
    return '\n'.join(out), rs
tA, rA = table('只绑骨骼'); tB, rB = table('新角色'); tC, rC = table('场景物件')
def total(rs, pri=None): return sum(r['参考积分'] for r in rs if pri is None or r['优先级'] == pri)
md = f"""# 16 建模任务包（给负责人在 Tripo 网页上做）

更新：2026-11-14。这份清单由脚本生成（`tools/modeling_taskpack.py`），改任务请告诉 AI，不要手改表格。

## 怎么用
1. 按下面的顺序，一个任务一个任务做。每个任务要上传的图片或模型都在本文件夹里（`图片/`、`模型/`）。
2. 做完导出的文件，按表里的「交付文件名」改好名字，放进 `完成的模型放这里/`。
3. 攒几个就告诉 AI「A01、B02 做好了」，AI 负责整理（落地、统一大小、压贴图、转方向）、接进游戏、测试。
4. 哪一步网页上找不到对应的按钮，截图给 AI。

## 通用设置（每个任务都一样）
- 模型版本：选最新的。
- **面数上限**：按表里写的填（三角面）。这是手机能不能流畅跑的关键，不要用默认的高面数。
- 贴图：按表里写的；**不要勾 PBR**。
- 导出格式：**GLB**。带骨骼的任务导出时要包含动画，动作选「原地播放 / in place」。
- 一次生成不满意可以重新生成，挑最像原图的那个；重点看脸和背面。
- 绑骨骼前先点「检查 / 可绑定检测」，骨骼类型以网页给的建议为准。
- 原图大多是坐姿或挥手，不是标准站姿：绑出来的走路幅度会偏小，这是已知情况，AI 会在游戏里补弹跳、前倾、拖尾和特效。

## 建议顺序
先 A（6 个，只绑骨骼，最便宜、见效最快）→ B 的 P0（3 位居民）→ C 的 P0（4 栋房子、飞艇、喷泉）→ 其余按优先级。
P2 里标了「游戏里还没用到」的可以等做到第二章再说；P3 不建议现在做。

## 参考积分（按命令行价格估的，网页的价格可能不同，以网页为准）
- 只绑骨骼：绑定 25 + 每个动作 10 → 一个角色两个动作 45。
- 新角色：生成约 120 + 绑定 25 + 两个动作 20 → 约 165。
- 场景物件：生成约 110。
- A 组合计 {total(rA)}；B 组 P0 {total(rB, 'P0')}、P1 {total(rB, 'P1')}、P2 {total(rB, 'P2')}；C 组 P0 {total(rC, 'P0')}、P1 {total(rC, 'P1')}、P2 {total(rC, 'P2')}、P3 {total(rC, 'P3')}。
- 全部做完约 {total(rows)} 积分，超过 3000：请按优先级做，做到哪算哪。

## A 组：模型已经有了，只绑骨骼和加动作（{len(rA)} 个）
焰尾狐已经做完，不在表里。上传 `模型/` 里对应的文件。

{tA}

## B 组：新角色，图片生成模型 + 绑骨骼 + 动作（{len(rB)} 个）
贴图选「精细 / 高清（2K）」，不要 PBR。

{tB}

## C 组：场景物件，图片生成模型，不绑骨骼（{len(rC)} 个）
现在这些是 AI 用代码搭的，能用，但没有原图那么精致；换成生成的模型会更接近原图。贴图选「标准或精细」，不要 PBR。

{tC}

## 不在清单里的
- 农作物（5 种 × 3 个生长阶段）：个头小、数量多，用代码做的够用。
- 地毯：平铺在地上的图片就行。
- 地形、草、水、云、山：只能用代码做。
"""
io.open(OUT + '任务清单.md', 'w', encoding='utf-8', newline='\n').write(md)
io.open(DONE + '说明.txt', 'w', encoding='utf-8').write('把做好的模型按「任务清单」里的交付文件名放在这个文件夹里，然后告诉 AI 做好了哪几个编号。\n')
print(len(rows), 'tasks;', len(os.listdir(IMG)), 'pictures;', len(os.listdir(MOD)), 'models')
print('missing pictures:', [r['编号'] for r in rows if r['上传的文件'] == '（缺原图）'])
sz = sum(os.path.getsize(IMG + f) for f in os.listdir(IMG)) // 1024
print('pictures total KB', sz, '; models total KB', sum(os.path.getsize(MOD + f) for f in os.listdir(MOD)) // 1024)
