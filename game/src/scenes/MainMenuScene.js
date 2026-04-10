/**
 * MainMenuScene - 主菜单场景
 */

import Phaser from 'phaser';

export default class MainMenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainMenu' });
    }

    create() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        
        // 背景渐变效果
        this.createBackground();
        
        // 标题
        this.createTitle(width, height);
        
        // 菜单按钮
        this.createMenuButtons(width, height);
        
        // 装饰元素
        this.createDecorations(width, height);
        
        // 飘落粒子效果
        this.createParticles();
        
        // 音频
        this.setupAudio();
    }
    
    createBackground() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        
        // 渐变背景
        const bg = this.add.graphics();
        bg.fillGradientStyle(0x1a1a2e, 0x1a1a2e, 0x16213e, 0x16213e, 1);
        bg.fillRect(0, 0, width, height);
        
        // 添加云雾效果
        for (let i = 0; i < 5; i++) {
            const cloud = this.add.ellipse(
                Phaser.Math.Between(0, width),
                Phaser.Math.Between(height * 0.6, height),
                Phaser.Math.Between(200, 400),
                50,
                0x4A7C59,
                0.1
            );
            this.tweens.add({
                targets: cloud,
                x: cloud.x + 200,
                alpha: 0,
                duration: 10000 + i * 2000,
                repeat: -1,
                yoyo: true
            });
        }
    }
    
    createTitle(width, height) {
        // 主标题
        const title = this.add.text(width / 2, height * 0.25, '🌳 灵木求生', {
            fontSize: '72px',
            fontFamily: 'Microsoft YaHei',
            color: '#4A7C59',
            stroke: '#1A3D2A',
            strokeThickness: 8,
            shadow: {
                offsetX: 0,
                offsetY: 4,
                color: '#4A7C59',
                blur: 20,
                fill: true
            }
        }).setOrigin(0.5);
        
        // 标题发光动画
        this.tweens.add({
            targets: title,
            alpha: 0.8,
            duration: 1500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
        
        // 副标题
        const subtitle = this.add.text(width / 2, height * 0.35, '东方玄幻 · 末世求生', {
            fontSize: '28px',
            fontFamily: 'Microsoft YaHei',
            color: '#9B7ED9'
        }).setOrigin(0.5);
        
        // 境界提示
        const realm = this.add.text(width / 2, height * 0.42, '修仙问道，渡劫长生', {
            fontSize: '20px',
            fontFamily: 'Microsoft YaHei',
            color: '#888888',
            fontStyle: 'italic'
        }).setOrigin(0.5);
    }
    
    createMenuButtons(width, height) {
        const btnY = height * 0.6;
        const btnSpacing = 80;
        
        // 开始游戏按钮
        this.createMenuButton(width / 2, btnY, '🎮 开始游戏', () => {
            this.cameras.main.fade(500, 0, 0, 0);
            this.time.delayedCall(500, () => {
                this.scene.start('Game');
            });
        });
        
        // 继续游戏按钮（灰色，暂不可用）
        this.createMenuButton(width / 2, btnY + btnSpacing, '📜 继续游戏', null, true);
        
        // 游戏设置按钮
        this.createMenuButton(width / 2, btnY + btnSpacing * 2, '⚙️ 游戏设置', () => {
            this.showSettings();
        });
        
        // 关于游戏按钮
        this.createMenuButton(width / 2, btnY + btnSpacing * 3, '📖 游戏介绍', () => {
            this.showAbout();
        });
    }
    
    createMenuButton(x, y, text, callback, disabled = false) {
        // 按钮容器
        const container = this.add.container(x, y);
        
        // 按钮背景
        const bg = this.add.graphics();
        bg.fillStyle(disabled ? 0x333333 : 0x4A7C59, disabled ? 0.5 : 1);
        bg.fillRoundedRect(-120, -25, 240, 50, 10);
        if (!disabled) {
            bg.lineStyle(2, 0x9B7ED9, 0.8);
            bg.strokeRoundedRect(-120, -25, 240, 50, 10);
        }
        container.add(bg);
        
        // 按钮文字
        const btnText = this.add.text(0, 0, text, {
            fontSize: '22px',
            fontFamily: 'Microsoft YaHei',
            color: disabled ? '#666666' : '#FFFFFF'
        }).setOrigin(0.5);
        container.add(btnText);
        
        // 可点击
        if (callback && !disabled) {
            const hitArea = this.add.rectangle(0, 0, 240, 50, 0x000000, 0)
                .setInteractive({ useHandCursor: true });
            container.add(hitArea);
            
            // 悬停效果
            hitArea.on('pointerover', () => {
                this.tweens.add({
                    targets: container,
                    scaleX: 1.05,
                    scaleY: 1.05,
                    duration: 100
                });
            });
            
            hitArea.on('pointerout', () => {
                this.tweens.add({
                    targets: container,
                    scaleX: 1,
                    scaleY: 1,
                    duration: 100
                });
            });
            
            hitArea.on('pointerdown', () => {
                this.tweens.add({
                    targets: container,
                    scaleX: 0.95,
                    scaleY: 0.95,
                    duration: 50,
                    yoyo: true,
                    onComplete: callback
                });
            });
        }
        
        return container;
    }
    
    createDecorations(width, height) {
        // 左侧装饰树
        const leftTree = this.add.image(100, height - 100, 'tree')
            .setScale(2)
            .setAlpha(0.3);
        this.tweens.add({
            targets: leftTree,
            y: height - 110,
            duration: 3000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
        
        // 右侧装饰树
        const rightTree = this.add.image(width - 100, height - 100, 'tree')
            .setScale(1.8)
            .setAlpha(0.3);
        this.tweens.add({
            targets: rightTree,
            y: height - 90,
            duration: 3500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
        
        // 版本信息
        this.add.text(width / 2, height - 30, 'v1.0 MVP | 炼气期版本', {
            fontSize: '14px',
            color: '#666666'
        }).setOrigin(0.5);
    }
    
    createParticles() {
        // 灵气粒子
        for (let i = 0; i < 20; i++) {
            const particle = this.add.circle(
                Phaser.Math.Between(0, 1280),
                Phaser.Math.Between(0, 720),
                Phaser.Math.Between(2, 5),
                0x4A7C59,
                0.5
            );
            
            this.tweens.add({
                targets: particle,
                y: particle.y - 200,
                alpha: 0,
                duration: Phaser.Math.Between(3000, 6000),
                repeat: -1,
                delay: Phaser.Math.Between(0, 3000)
            });
        }
    }
    
    setupAudio() {
        // 暂时没有音频文件，预留接口
        // this.sound.play('menu_bgm');
    }
    
    showSettings() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        
        // 遮罩
        const overlay = this.add.rectangle(width/2, height/2, width, height, 0x000000, 0.7)
            .setInteractive();
        
        // 设置面板
        const panel = this.add.container(width/2, height/2);
        
        const panelBg = this.add.graphics();
        panelBg.fillStyle(0x1a1a2e, 1);
        panelBg.fillRoundedRect(-200, -150, 400, 300, 16);
        panelBg.lineStyle(2, 0x9B7ED9, 1);
        panelBg.strokeRoundedRect(-200, -150, 400, 300, 16);
        panel.add(panelBg);
        
        const title = this.add.text(0, -120, '⚙️ 游戏设置', {
            fontSize: '24px',
            color: '#FFFFFF'
        }).setOrigin(0.5);
        panel.add(title);
        
        const closeText = this.add.text(180, -130, '✕', {
            fontSize: '24px',
            color: '#FF6666'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        panel.add(closeText);
        
        closeText.on('pointerdown', () => {
            this.tweens.add({
                targets: [overlay, panel],
                alpha: 0,
                duration: 200,
                onComplete: () => {
                    overlay.destroy();
                    panel.destroy();
                }
            });
        });
        
        panel.add(overlay);
        
        // 显示面板动画
        panel.setScale(0.8);
        panel.setAlpha(0);
        this.tweens.add({
            targets: panel,
            scale: 1,
            alpha: 1,
            duration: 200
        });
    }
    
    showAbout() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        
        const overlay = this.add.rectangle(width/2, height/2, width, height, 0x000000, 0.7)
            .setInteractive();
        
        const panel = this.add.container(width/2, height/2);
        
        const panelBg = this.add.graphics();
        panelBg.fillStyle(0x1a1a2e, 1);
        panelBg.fillRoundedRect(-250, -200, 500, 400, 16);
        panelBg.lineStyle(2, 0x4A7C59, 1);
        panelBg.strokeRoundedRect(-250, -200, 500, 400, 16);
        panel.add(panelBg);
        
        const title = this.add.text(0, -170, '📖 游戏介绍', {
            fontSize: '28px',
            color: '#4A7C59'
        }).setOrigin(0.5);
        panel.add(title);
        
        const aboutText = `🌳 《灵木求生》是一款东方玄幻末世求生游戏。

🎯 核心玩法：
• 培养灵木，经历渡劫，提升境界
• 布置五行阵法，炼制符箓抵御妖兽
• 问道修仙，考验道心，获取机缘

⏰ 游戏节奏：
• 子时（23:00-01:00）：妖潮来袭
• 其他时辰：休整准备阶段

💎 特色系统：
• 五行相克：合理搭配阵法属性
• 灵根系统：觉醒灵根增强实力
• 天命劫系统：随机事件影响命运

健康游戏理念：不逼氪不逼肝`;

        const text = this.add.text(-220, -130, aboutText, {
            fontSize: '16px',
            color: '#CCCCCC',
            lineSpacing: 8,
            wordWrap: { width: 440 }
        });
        panel.add(text);
        
        const closeText = this.add.text(230, -180, '✕', {
            fontSize: '24px',
            color: '#FF6666'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        panel.add(closeText);
        
        closeText.on('pointerdown', () => {
            this.tweens.add({
                targets: [overlay, panel],
                alpha: 0,
                duration: 200,
                onComplete: () => {
                    overlay.destroy();
                    panel.destroy();
                }
            });
        });
        
        panel.add(overlay);
        
        panel.setScale(0.8);
        panel.setAlpha(0);
        this.tweens.add({
            targets: panel,
            scale: 1,
            alpha: 1,
            duration: 200
        });
    }
}
