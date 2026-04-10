/**
 * GameScene - 游戏主场景
 * 核心玩法：灵木培养 + 阵法防御 + 妖兽抵御
 */

import Phaser from 'phaser';

export default class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'Game' });
    }

    init() {
        // 引用全局数据
        this.gameData = window.GameData;
        this.constants = window.GameConstants;
        
        // 游戏状态
        this.gameState = {
            isPaused: false,
            isWaveActive: false,
            selectedFormation: null,
            gameTime: 0,
            waveTimer: 0
        };
        
        // 阵法位置（可放置点）
        this.formationSlots = [];
        
        // 阵法实例
        this.formations = [];
        
        // 妖兽实例
        this.monsters = [];
        
        // 特效组
        this.effects = null;
    }

    create() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        
        // 创建场景
        this.createBackground();
        this.createUI();
        this.createTree();
        this.createFormationSlots();
        this.createToolbar();
        
        // 创建特效组
        this.effects = this.add.group();
        
        // 初始化波次计时器
        this.initWaveTimer();
        
        // 更新加载进度
        window.updateLoadingProgress(100, '游戏开始！');
        
        console.log('🎮 GameScene 创建完成');
    }
    
    createBackground() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        
        // 地面背景
        const groundArea = this.add.zone(width/2, height * 0.75, width, height * 0.5);
        
        // 绘制地面
        for (let x = 0; x < width; x += 64) {
            for (let y = height * 0.6; y < height; y += 64) {
                const tile = this.add.image(x + 32, y + 32, 'ground');
                tile.setAlpha(0.8);
            }
        }
        
        // 天空渐变（用矩形模拟）
        const skyGradient = this.add.graphics();
        skyGradient.fillGradientStyle(0x0f0f23, 0x0f0f23, 0x1a1a2e, 0x1a1a2e, 1);
        skyGradient.fillRect(0, 0, width, height * 0.6);
        
        // 月亮
        const moon = this.add.circle(width - 150, 120, 50, 0xFFFFDD, 0.9);
        moon.setShadow(0, 0, 0xFFFFAA, 100);
        
        // 星星
        for (let i = 0; i < 50; i++) {
            this.add.circle(
                Phaser.Math.Between(0, width),
                Phaser.Math.Between(0, height * 0.5),
                Phaser.Math.Between(1, 2),
                0xFFFFFF,
                Phaser.Math.FloatBetween(0.3, 0.8)
            );
        }
        
        // 战斗区域标记
        const battleZone = this.add.graphics();
        battleZone.lineStyle(2, 0x9B7ED9, 0.3);
        battleZone.strokeRect(width * 0.1, height * 0.35, width * 0.8, height * 0.25);
        
        const zoneText = this.add.text(width * 0.5, height * 0.475, '👹 妖兽来袭区域', {
            fontSize: '16px',
            color: '#9B7ED9',
            alpha: 0.5
        }).setOrigin(0.5);
    }
    
    createUI() {
        const width = this.cameras.main.width;
        
        // 顶部面板背景
        const topPanel = this.add.graphics();
        topPanel.fillStyle(0x000000, 0.6);
        topPanel.fillRoundedRect(10, 10, 400, 80, 10);
        
        // 境界信息
        this.realmText = this.add.text(25, 20, `境界: ${this.gameData.player.realm}`, {
            fontSize: '18px',
            fontFamily: 'Microsoft YaHei',
            color: '#9B7ED9'
        });
        
        // 灵石显示
        this.stoneIcon = this.add.image(25, 55, 'spirit_stone').setScale(0.8);
        this.stoneText = this.add.text(50, 48, `${this.gameData.player.spiritStones}`, {
            fontSize: '20px',
            fontFamily: 'Microsoft YaHei',
            color: '#FFD700'
        });
        
        // 灵气条
        this.add.text(130, 20, '灵气', { fontSize: '14px', color: '#4A7C59' });
        
        const spiritBarBg = this.add.image(230, 30, 'bar_bg');
        this.spiritBarFill = this.add.image(130, 30, 'bar_fill').setOrigin(0, 0.5);
        this.spiritText = this.add.text(200, 50, `${this.gameData.tree.spirit}/${this.gameData.tree.spiritCapacity}`, {
            fontSize: '12px',
            color: '#FFFFFF'
        }).setOrigin(0.5);
        
        // 波次信息（右上角）
        const wavePanel = this.add.graphics();
        wavePanel.fillStyle(0x000000, 0.6);
        wavePanel.fillRoundedRect(width - 210, 10, 200, 80, 10);
        
        this.waveText = this.add.text(width - 110, 25, '波次', {
            fontSize: '18px',
            color: '#FF6347'
        }).setOrigin(0.5);
        
        this.waveCountText = this.add.text(width - 110, 55, `第 ${this.gameData.battle.currentWave}/${this.gameData.battle.maxWaves} 波`, {
            fontSize: '24px',
            color: '#FFFFFF',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        
        // 波次计时条
        this.waveTimerBg = this.add.graphics();
        this.waveTimerBg.fillStyle(0x333333, 1);
        this.waveTimerBg.fillRoundedRect(width - 200, 70, 180, 10, 3);
        this.waveTimerBar = this.add.graphics();
        
        // 暂停按钮
        this.createButton(width - 50, 50, '⏸️', () => this.togglePause(), 40);
        
        // 菜单按钮
        this.createButton(width - 100, 50, '📋', () => this.showGameMenu(), 40);
    }
    
    createButton(x, y, text, callback, size = 30) {
        const btn = this.add.text(x, y, text, {
            fontSize: `${size}px`
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        
        btn.on('pointerover', () => btn.setScale(1.2));
        btn.on('pointerout', () => btn.setScale(1));
        btn.on('pointerdown', callback);
        
        return btn;
    }
    
    createTree() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        
        // 灵木位置（屏幕中央下方）
        const treeX = width / 2;
        const treeY = height * 0.65;
        
        // 创建灵木
        this.tree = this.add.image(treeX, treeY, 'tree').setScale(3);
        
        // 灵木光环
        this.treeGlow = this.add.circle(treeX, treeY - 50, 80, 0x4A7C59, 0.2);
        
        // 灵木数值显示
        this.treeLevelText = this.add.text(treeX, treeY + 80, `Lv.${this.gameData.tree.level}`, {
            fontSize: '18px',
            color: '#4A7C59',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        
        // 灵根显示（如果有）
        if (this.gameData.tree.rootType) {
            const element = this.constants.ELEMENTS[this.gameData.tree.rootType];
            this.rootText = this.add.text(treeX, treeY + 100, `灵根: ${element.name}`, {
                fontSize: '14px',
                color: '#' + element.color.toString(16).padStart(6, '0')
            }).setOrigin(0.5);
        }
        
        // 灵木呼吸动画
        this.tweens.add({
            targets: this.treeGlow,
            scaleX: 1.2,
            scaleY: 1.2,
            alpha: 0.1,
            duration: 2000,
            yoyo: true,
            repeat: -1
        });
    }
    
    createFormationSlots() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        
        // 创建阵法放置槽位（围绕灵木形成环形）
        const slotCount = 8;
        const centerX = width / 2;
        const centerY = height * 0.65;
        const radius = 150;
        
        for (let i = 0; i < slotCount; i++) {
            const angle = (i / slotCount) * Math.PI * 2 - Math.PI / 2;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;
            
            // 放置槽位
            const slot = this.add.container(x, y);
            
            const slotBg = this.add.circle(0, 0, 35, 0x333333, 0.5);
            slotBg.setStrokeStyle(2, 0x9B7ED9, 0.5);
            slot.add(slotBg);
            
            const plusText = this.add.text(0, 0, '+', {
                fontSize: '24px',
                color: '#9B7ED9'
            }).setOrigin(0.5);
            slot.add(plusText);
            
            // 让槽位可点击
            slot.setSize(70, 70);
            slot.setInteractive({ useHandCursor: true });
            
            slot.on('pointerover', () => {
                this.tweens.add({
                    targets: slot,
                    scale: 1.1,
                    duration: 100
                });
                slotBg.setFillStyle(0x4A7C59, 0.3);
            });
            
            slot.on('pointerout', () => {
                this.tweens.add({
                    targets: slot,
                    scale: 1,
                    duration: 100
                });
                slotBg.setFillStyle(0x333333, 0.5);
            });
            
            slot.on('pointerdown', () => {
                if (this.gameState.selectedFormation) {
                    this.placeFormation(slot, this.gameState.selectedFormation);
                } else {
                    this.showSlotMenu(slot);
                }
            });
            
            this.formationSlots.push({
                container: slot,
                x: x,
                y: y,
                occupied: false,
                formation: null
            });
        }
    }
    
    createToolbar() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        
        // 底部工具栏背景
        const toolbar = this.add.graphics();
        toolbar.fillStyle(0x000000, 0.7);
        toolbar.fillRoundedRect(10, height - 80, width - 20, 70, 10);
        
        // 工具栏按钮
        const tools = [
            { icon: '⚔️', name: '金剑阵', element: 'METAL', cost: 50 },
            { icon: '🌿', name: '木缠绕', element: 'WOOD', cost: 50 },
            { icon: '💧', name: '水冰阵', element: 'WATER', cost: 50 },
            { icon: '🔥', name: '火烈阵', element: 'FIRE', cost: 50 },
            { icon: '🪨', name: '土厚阵', element: 'EARTH', cost: 50 },
            { icon: '📜', name: '符箓', element: 'TALISMAN', cost: 0 },
        ];
        
        const startX = width * 0.25;
        const spacing = 100;
        
        tools.forEach((tool, index) => {
            const x = startX + index * spacing;
            const y = height - 45;
            
            const btn = this.add.container(x, y);
            
            const bg = this.add.graphics();
            bg.fillStyle(0x333333, 1);
            bg.fillRoundedRect(-35, -25, 70, 50, 8);
            
            if (tool.element !== 'TALISMAN') {
                const element = this.constants.ELEMENTS[tool.element];
                bg.lineStyle(2, element.color, 0.8);
                bg.strokeRoundedRect(-35, -25, 70, 50, 8);
            } else {
                bg.lineStyle(2, 0xFFFF00, 0.8);
                bg.strokeRoundedRect(-35, -25, 70, 50, 8);
            }
            
            btn.add(bg);
            
            const icon = this.add.text(0, -8, tool.icon, {
                fontSize: '24px'
            }).setOrigin(0.5);
            btn.add(icon);
            
            const cost = this.add.text(0, 15, tool.cost > 0 ? `${tool.cost}` : '∞', {
                fontSize: '12px',
                color: tool.cost > 0 ? '#FFD700' : '#FFFFFF'
            }).setOrigin(0.5);
            btn.add(cost);
            
            // 按钮交互
            btn.setSize(70, 50);
            btn.setInteractive({ useHandCursor: true });
            
            btn.on('pointerover', () => {
                if (!btn.getData('selected')) {
                    this.tweens.add({
                        targets: btn,
                        scale: 1.1,
                        duration: 100
                    });
                }
            });
            
            btn.on('pointerout', () => {
                if (!btn.getData('selected')) {
                    this.tweens.add({
                        targets: btn,
                        scale: 1,
                        duration: 100
                    });
                }
            });
            
            btn.on('pointerdown', () => {
                this.selectFormation(tool, btn);
            });
            
            btn.setData('tool', tool);
        });
        
        // 开始波次按钮
        this.startWaveBtn = this.add.container(width * 0.88, height - 45);
        const startBtnBg = this.add.graphics();
        startBtnBg.fillStyle(0xFF6347, 1);
        startBtnBg.fillRoundedRect(-50, -25, 100, 50, 10);
        this.startWaveBtn.add(startBtnBg);
        
        const startBtnText = this.add.text(0, 0, '🚀 开始', {
            fontSize: '20px',
            color: '#FFFFFF',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        this.startWaveBtn.add(startBtnText);
        
        this.startWaveBtn.setInteractive({ useHandCursor: true });
        this.startWaveBtn.on('pointerdown', () => this.startWave());
    }
    
    selectFormation(tool, btn) {
        // 取消之前的选中状态
        this.formationSlots.forEach(slot => {
            slot.container.getAt(0)?.setFillStyle(0x333333, 0.5);
        });
        
        // 如果已选中，取消选中
        if (this.gameState.selectedFormation === tool) {
            this.gameState.selectedFormation = null;
            btn.setScale(1);
            btn.clearTint();
            return;
        }
        
        // 检查灵石是否足够
        if (tool.cost > 0 && this.gameData.player.spiritStones < tool.cost) {
            this.showFloatingText(this.cameras.main.width / 2, 200, '灵石不足！', '#FF0000');
            return;
        }
        
        // 选中阵法
        this.gameState.selectedFormation = tool;
        btn.setData('selected', true);
        this.tweens.add({
            targets: btn,
            scale: 1.2,
            duration: 100
        });
        
        this.showFloatingText(this.cameras.main.width / 2, 150, `选择 ${tool.name}，点击放置位置`, '#4A7C59');
    }
    
    placeFormation(slot, formation) {
        if (slot.occupied) {
            this.showFloatingText(slot.x, slot.y, '已有阵法！', '#FF0000');
            return;
        }
        
        // 消耗灵石
        if (formation.cost > 0) {
            this.gameData.player.spiritStones -= formation.cost;
            this.updateStoneDisplay();
        }
        
        // 创建阵法
        const element = this.constants.ELEMENTS[formation.element];
        const formationSprite = this.add.image(0, 0, 'formation').setTint(element.color);
        
        // 阵法动画
        formationSprite.setScale(0);
        this.tweens.add({
            targets: formationSprite,
            scale: 1,
            duration: 300,
            ease: 'Back.easeOut'
        });
        
        // 旋转动画
        this.tweens.add({
            targets: formationSprite,
            angle: 360,
            duration: 10000,
            repeat: -1
        });
        
        slot.add(formationSprite);
        slot.getAt(1)?.destroy(); // 移除+号
        
        slot.occupied = true;
        slot.formation = {
            type: formation.element,
            sprite: formationSprite,
            level: 1
        };
        
        // 刷新阵法列表
        this.formations.push(slot);
        
        // 取消选中状态
        this.gameState.selectedFormation = null;
        
        this.showFloatingText(slot.x, slot.y, `${formation.name} 布置完成！`, '#' + element.color.toString(16).padStart(6, '0'));
    }
    
    showSlotMenu(slot) {
        // 已有阵法的槽位，显示升级/拆除选项
        if (slot.occupied) {
            const menu = this.add.container(slot.x, slot.y - 60);
            
            const menuBg = this.add.graphics();
            menuBg.fillStyle(0x1a1a2e, 0.95);
            menuBg.fillRoundedRect(-60, -25, 120, 50, 8);
            menuBg.lineStyle(1, 0x9B7ED9, 1);
            menuBg.strokeRoundedRect(-60, -25, 120, 50, 8);
            
            // 升级按钮
            const upgradeBtn = this.add.text(-30, 0, '⬆️ 升级', {
                fontSize: '14px'
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });
            
            upgradeBtn.on('pointerdown', () => {
                this.upgradeFormation(slot);
                menu.destroy();
            });
            
            // 拆除按钮
            const removeBtn = this.add.text(30, 0, '🗑️ 拆除', {
                fontSize: '14px'
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });
            
            removeBtn.on('pointerdown', () => {
                this.removeFormation(slot);
                menu.destroy();
            });
            
            menu.add([menuBg, upgradeBtn, removeBtn]);
            
            // 点击其他地方关闭
            this.time.delayedCall(3000, () => {
                if (menu.scene) menu.destroy();
            });
        }
    }
    
    upgradeFormation(slot) {
        if (!slot.formation) return;
        
        const cost = 100 * slot.formation.level;
        if (this.gameData.player.spiritStones < cost) {
            this.showFloatingText(slot.x, slot.y, '灵石不足！', '#FF0000');
            return;
        }
        
        this.gameData.player.spiritStones -= cost;
        slot.formation.level++;
        this.updateStoneDisplay();
        
        this.showFloatingText(slot.x, slot.y, `升级至 Lv.${slot.formation.level}`, '#4A7C59');
        
        // 升级特效
        const effect = this.add.circle(slot.x, slot.y, 40, 0xFFD700, 0.5);
        this.tweens.add({
            targets: effect,
            scale: 2,
            alpha: 0,
            duration: 500,
            onComplete: () => effect.destroy()
        });
    }
    
    removeFormation(slot) {
        if (!slot.formation) return;
        
        slot.formation.sprite.destroy();
        slot.occupied = false;
        slot.formation = null;
        
        // 重新显示+号
        const plusText = this.add.text(0, 0, '+', {
            fontSize: '24px',
            color: '#9B7ED9'
        }).setOrigin(0.5);
        slot.add(plusText);
        
        // 移除阵法引用
        const index = this.formations.indexOf(slot);
        if (index > -1) this.formations.splice(index, 1);
        
        this.showFloatingText(slot.x, slot.y, '阵法已拆除', '#888888');
    }
    
    initWaveTimer() {
        // 波次间隔计时器
        this.gameState.waveTimer = this.constants.WAVE_INTERVAL;
        
        // 更新计时显示
        this.time.addEvent({
            delay: 1000,
            callback: this.updateWaveTimer,
            callbackScope: this,
            loop: true
        });
    }
    
    updateWaveTimer() {
        if (this.gameState.isPaused || this.gameState.isWaveActive) return;
        
        this.gameState.waveTimer--;
        
        // 更新计时条
        const width = this.cameras.main.width;
        const progress = 1 - (this.gameState.waveTimer / this.constants.WAVE_INTERVAL);
        
        this.waveTimerBar.clear();
        this.waveTimerBar.fillStyle(0xFF6347, 1);
        this.waveTimerBar.fillRoundedRect(width - 200, 70, 180 * progress, 10, 3);
        
        if (this.gameState.waveTimer <= 0) {
            this.startWave();
        }
    }
    
    startWave() {
        if (this.gameState.isWaveActive) return;
        
        this.gameState.isWaveActive = true;
        this.gameData.battle.inBattle = true;
        this.gameData.battle.currentWave++;
        
        // 更新波次显示
        this.updateWaveDisplay();
        
        // 按钮状态变化
        this.startWaveBtn.getAt(0)?.setFillStyle(0x666666, 1);
        
        // 开始生成妖兽
        this.spawnWaveMonsters();
        
        // 显示波次开始提示
        this.showWaveAnnouncement();
    }
    
    showWaveAnnouncement() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        
        const announcement = this.add.text(width / 2, height / 2, `第 ${this.gameData.battle.currentWave} 波来袭！`, {
            fontSize: '48px',
            color: '#FF6347',
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 4
        }).setOrigin(0.5).setAlpha(0);
        
        this.tweens.add({
            targets: announcement,
            alpha: 1,
            scale: { from: 0.5, to: 1 },
            duration: 500,
            yoyo: true,
            hold: 1000,
            onComplete: () => announcement.destroy()
        });
    }
    
    spawnWaveMonsters() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        
        // 根据波次计算妖兽数量和类型
        const wave = this.gameData.battle.currentWave;
        const monsterCount = Math.min(3 + Math.floor(wave / 5), 15);
        const monsterTypeIndex = Math.min(Math.floor(wave / 5), this.constants.MONSTER_TYPES.length - 1);
        const monsterType = this.constants.MONSTER_TYPES[monsterTypeIndex];
        
        // 波次持续时间
        const waveDuration = this.constants.WAVE_DURATION;
        const spawnInterval = (waveDuration * 1000) / monsterCount;
        
        // 定时生成妖兽
        for (let i = 0; i < monsterCount; i++) {
            this.time.delayedCall(spawnInterval * i, () => {
                if (!this.gameState.isWaveActive) return;
                this.spawnMonster(monsterType, width, height);
            });
        }
        
        // 波次结束计时
        this.time.delayedCall(waveDuration * 1000, () => {
            this.endWave();
        });
    }
    
    spawnMonster(monsterType, width, height) {
        // 生成位置（屏幕左右两侧）
        const side = Phaser.Math.Between(0, 1);
        const x = side === 0 ? -30 : width + 30;
        const y = Phaser.Math.Between(height * 0.35, height * 0.55);
        
        // 创建妖兽
        const monster = this.add.image(x, y, 'monster');
        monster.setTint(monsterType.element ? this.constants.ELEMENTS[monsterType.element].color : 0x8B0000);
        
        // 缩放（根据波次）
        const scale = 0.8 + (this.gameData.battle.currentWave * 0.05);
        monster.setScale(Math.min(scale, 2));
        
        // 血条
        const hpBarBg = this.add.graphics();
        hpBarBg.fillStyle(0x333333, 1);
        hpBarBg.fillRect(-20, -30, 40, 6);
        
        const hpBar = this.add.graphics();
        
        const maxHp = monsterType.hp * (1 + this.gameData.battle.currentWave * 0.1);
        monster.setData('hp', maxHp);
        monster.setData('maxHp', maxHp);
        monster.setData('damage', monsterType.damage * (1 + this.gameData.battle.currentWave * 0.1));
        monster.setData('speed', monsterType.speed);
        monster.setData('element', monsterType.element);
        monster.setData('reward', monsterType.reward);
        
        // 移动到灵木
        const targetX = width / 2;
        const targetY = height * 0.65;
        
        // 计算移动方向
        const direction = side === 0 ? 1 : -1;
        monster.setFlipX(side === 0);
        
        // 移动动画
        this.tweens.add({
            targets: monster,
            x: targetX + direction * 50,
            duration: (1000 / monsterType.speed) * 100,
            ease: 'Linear',
            onUpdate: () => {
                // 更新血条
                hpBar.clear();
                hpBar.fillStyle(0xFF0000, 1);
                const hpPercent = monster.getData('hp') / monster.getData('maxHp');
                hpBar.fillRect(-20, -30, 40 * hpPercent, 6);
            }
        });
        
        // 存储血条引用
        monster.setData('hpBar', hpBar);
        monster.setData('hpBarBg', hpBarBg);
        
        // 妖兽到达灵木时的处理
        this.time.delayedCall((1000 / monsterType.speed) * 100, () => {
            if (monster.active) {
                this.monsterAttackTree(monster);
            }
        });
        
        this.monsters.push(monster);
    }
    
    monsterAttackTree(monster) {
        if (!monster.active) return;
        
        const damage = monster.getData('damage');
        
        // 扣除灵气
        this.gameData.tree.spirit -= damage;
        this.updateSpiritDisplay();
        
        // 灵木受伤效果
        this.tweens.add({
            targets: this.tree,
            tint: 0xFF0000,
            duration: 100,
            yoyo: true
        });
        
        // 显示伤害数字
        this.showFloatingText(this.tree.x, this.tree.y - 50, `-${Math.floor(damage)}`, '#FF0000');
        
        // 检查是否灵气耗尽
        if (this.gameData.tree.spirit <= 0) {
            this.gameOver();
            return;
        }
        
        // 妖兽死亡（攻击后消失）
        this.killMonster(monster);
    }
    
    killMonster(monster) {
        const reward = monster.getData('reward');
        
        // 奖励灵石
        this.gameData.player.spiritStones += reward;
        this.updateStoneDisplay();
        
        // 击杀计数
        this.gameData.battle.monstersKilled++;
        
        // 死亡动画
        this.tweens.add({
            targets: monster,
            alpha: 0,
            scale: 0,
            angle: 180,
            duration: 300,
            onComplete: () => {
                monster.getData('hpBar')?.destroy();
                monster.getData('hpBarBg')?.destroy();
                monster.destroy();
            }
        });
        
        // 击杀特效
        const effect = this.add.image(monster.x, monster.y, 'attack_effect');
        this.tweens.add({
            targets: effect,
            alpha: 0,
            scale: 2,
            duration: 300,
            onComplete: () => effect.destroy()
        });
        
        // 灵石飞向UI
        this.showFloatingText(monster.x, monster.y, `+${reward}灵石`, '#FFD700');
        
        // 从列表移除
        const index = this.monsters.indexOf(monster);
        if (index > -1) this.monsters.splice(index, 1);
    }
    
    endWave() {
        this.gameState.isWaveActive = false;
        this.gameData.battle.inBattle = false;
        
        // 清理剩余妖兽
        this.monsters.forEach(monster => {
            monster.getData('hpBar')?.destroy();
            monster.getData('hpBarBg')?.destroy();
            monster.destroy();
        });
        this.monsters = [];
        
        // 恢复按钮状态
        this.startWaveBtn.getAt(0)?.setFillStyle(0xFF6347, 1);
        
        // 重置波次计时器
        this.gameState.waveTimer = this.constants.WAVE_INTERVAL;
        
        // 检查是否渡劫波次
        const realm = this.constants.REALMS.find(r => r.name === this.gameData.player.realm);
        if (realm && this.gameData.battle.currentWave % realm.tribulationWave === 0) {
            this.triggerTribulation();
        }
        
        // 检查是否通关
        if (this.gameData.battle.currentWave >= this.gameData.battle.maxWaves) {
            this.victory();
        }
        
        // 显示波次结束
        this.showFloatingText(this.cameras.main.width / 2, this.cameras.main.height / 2, '波次结束，准备下一波...', '#4A7C59');
    }
    
    triggerTribulation() {
        // 渡劫触发
        const realmIndex = this.constants.REALMS.findIndex(r => r.name === this.gameData.player.realm);
        
        this.showFloatingText(this.cameras.main.width / 2, this.cameras.main.height / 2 - 100, '⚡ 渡劫时刻降临！', '#FFD700');
        
        // 渡劫特效
        for (let i = 0; i < 5; i++) {
            this.time.delayedCall(i * 200, () => {
                const lightning = this.add.line(0, 0, 
                    Phaser.Math.Between(200, 1080), 0,
                    this.tree.x, this.tree.y,
                    0xFFFF00, 1
                );
                lightning.setLineWidth(3, 1);
                
                this.tweens.add({
                    targets: lightning,
                    alpha: 0,
                    duration: 300,
                    onComplete: () => lightning.destroy()
                });
            });
        }
        
        // 渡劫判定
        const successRate = realmIndex < this.constants.REALMS.length ? 
            (1 - realmIndex * 0.1) : 0.4;
        const success = Math.random() < successRate;
        
        this.time.delayedCall(1500, () => {
            if (success && realmIndex < this.constants.REALMS.length - 1) {
                // 升级境界
                this.gameData.player.realm = this.constants.REALMS[realmIndex + 1].name;
                this.gameData.player.level = this.constants.REALMS[realmIndex + 1].level;
                this.updateRealmDisplay();
                this.showFloatingText(this.tree.x, this.tree.y - 100, `渡劫成功！晋升${this.gameData.player.realm}！`, '#4A7C59');
            } else {
                // 渡劫失败
                this.showFloatingText(this.tree.x, this.tree.y - 100, '渡劫失败...但保留了修为', '#888888');
            }
        });
    }
    
    gameOver() {
        this.gameState.isPaused = true;
        
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        
        // 遮罩
        const overlay = this.add.rectangle(width/2, height/2, width, height, 0x000000, 0.8);
        
        // 游戏结束面板
        const panel = this.add.container(width/2, height/2);
        
        const panelBg = this.add.graphics();
        panelBg.fillStyle(0x1a1a2e, 1);
        panelBg.fillRoundedRect(-200, -150, 400, 300, 16);
        panelBg.lineStyle(2, 0xFF0000, 1);
        panelBg.strokeRoundedRect(-200, -150, 400, 300, 16);
        panel.add(panelBg);
        
        const title = this.add.text(0, -100, '💀 灵气耗尽', {
            fontSize: '36px',
            color: '#FF0000',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        panel.add(title);
        
        const stats = `存活波次: ${this.gameData.battle.currentWave}\n击杀妖兽: ${this.gameData.battle.monstersKilled}\n当前境界: ${this.gameData.player.realm}`;
        
        const statsText = this.add.text(0, -20, stats, {
            fontSize: '20px',
            color: '#CCCCCC',
            align: 'center',
            lineSpacing: 10
        }).setOrigin(0.5);
        panel.add(statsText);
        
        // 重新开始按钮
        const restartBtn = this.add.text(0, 80, '🔄 重新开始', {
            fontSize: '24px',
            color: '#4A7C59'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        
        restartBtn.on('pointerdown', () => {
            this.scene.restart();
            this.gameData.battle.currentWave = 0;
            this.gameData.battle.monstersKilled = 0;
            this.gameData.tree.spirit = this.gameData.tree.spiritCapacity;
        });
        panel.add(restartBtn);
        
        // 返回菜单按钮
        const menuBtn = this.add.text(0, 130, '🏠 返回主菜单', {
            fontSize: '18px',
            color: '#9B7ED9'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        
        menuBtn.on('pointerdown', () => {
            this.scene.start('MainMenu');
        });
        panel.add(menuBtn);
    }
    
    victory() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        
        const overlay = this.add.rectangle(width/2, height/2, width, height, 0x000000, 0.8);
        
        const panel = this.add.container(width/2, height/2);
        
        const panelBg = this.add.graphics();
        panelBg.fillStyle(0x1a1a2e, 1);
        panelBg.fillRoundedRect(-200, -150, 400, 300, 16);
        panelBg.lineStyle(2, 0xFFD700, 1);
        panelBg.strokeRoundedRect(-200, -150, 400, 300, 16);
        panel.add(panelBg);
        
        const title = this.add.text(0, -100, '🏆 恭喜通关！', {
            fontSize: '36px',
            color: '#FFD700',
            fontStyle: 'bold'
        }).setOrigin(0.5);
        panel.add(title);
        
        const stats = `最终境界: ${this.gameData.player.realm}\n击杀妖兽: ${this.gameData.battle.monstersKilled}\n获得灵石: ${this.gameData.player.spiritStones}`;
        
        const statsText = this.add.text(0, -20, stats, {
            fontSize: '20px',
            color: '#CCCCCC',
            align: 'center',
            lineSpacing: 10
        }).setOrigin(0.5);
        panel.add(statsText);
        
        const continueBtn = this.add.text(0, 100, '🔄 继续挑战更高波次', {
            fontSize: '20px',
            color: '#4A7C59'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        
        continueBtn.on('pointerdown', () => {
            this.gameData.battle.maxWaves += 50;
            this.scene.restart();
        });
        panel.add(continueBtn);
    }
    
    togglePause() {
        this.gameState.isPaused = !this.gameState.isPaused;
        
        if (this.gameState.isPaused) {
            this.scene.pause();
        } else {
            this.scene.resume();
        }
    }
    
    showGameMenu() {
        // 简化实现
        this.togglePause();
    }
    
    // UI更新方法
    updateStoneDisplay() {
        this.stoneText.setText(`${this.gameData.player.spiritStones}`);
    }
    
    updateSpiritDisplay() {
        const spirit = Math.max(0, this.gameData.tree.spirit);
        this.gameData.tree.spirit = spirit;
        
        const percent = spirit / this.gameData.tree.spiritCapacity;
        this.spiritBarFill.setScale(percent, 1);
        this.spiritText.setText(`${spirit}/${this.gameData.tree.spiritCapacity}`);
        
        // 灵气低时改变颜色
        if (percent < 0.3) {
            this.spiritBarFill.setTint(0xFF0000);
        } else if (percent < 0.5) {
            this.spiritBarFill.setTint(0xFFA500);
        } else {
            this.spiritBarFill.clearTint();
        }
    }
    
    updateWaveDisplay() {
        this.waveCountText.setText(`第 ${this.gameData.battle.currentWave}/${this.gameData.battle.maxWaves} 波`);
    }
    
    updateRealmDisplay() {
        this.realmText.setText(`境界: ${this.gameData.player.realm}`);
    }
    
    showFloatingText(x, y, text, color = '#FFFFFF') {
        const floatingText = this.add.text(x, y, text, {
            fontSize: '24px',
            color: color,
            fontStyle: 'bold',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5);
        
        this.tweens.add({
            targets: floatingText,
            y: y - 50,
            alpha: 0,
            duration: 1000,
            onComplete: () => floatingText.destroy()
        });
    }
    
    update() {
        // 持续检测阵法攻击范围内的妖兽
        this.formations.forEach(slot => {
            if (!slot.formation) return;
            
            const formationX = slot.x;
            const formationY = slot.y;
            const range = 100 * slot.formation.level;
            
            // 检测范围内的妖兽
            this.monsters.forEach(monster => {
                if (!monster.active) return;
                
                const distance = Phaser.Math.Distance.Between(
                    formationX, formationY, monster.x, monster.y
                );
                
                if (distance < range) {
                    // 攻击妖兽
                    const damage = 10 * slot.formation.level;
                    const element = this.constants.ELEMENTS[slot.formation.type];
                    
                    // 五行相克
                    const monsterElement = monster.getData('element');
                    if (monsterElement) {
                        const targetElement = this.constants.ELEMENTS[monsterElement];
                        if (targetElement.beats === slot.formation.type) {
                            damage *= 1.5; // 克制
                        } else if (targetElement.weakTo === slot.formation.type) {
                            damage *= 0.5; // 被克
                        }
                    }
                    
                    monster.setData('hp', monster.getData('hp') - damage * 0.016); // 每帧伤害
                    
                    // 攻击特效
                    if (Math.random() < 0.05) {
                        const bullet = this.add.circle(formationX, formationY, 5, element.color);
                        this.tweens.add({
                            targets: bullet,
                            x: monster.x,
                            y: monster.y,
                            duration: 100,
                            onComplete: () => {
                                bullet.destroy();
                                if (monster.getData('hp') <= 0) {
                                    this.killMonster(monster);
                                }
                            }
                        });
                    }
                }
            });
        });
    }
}
