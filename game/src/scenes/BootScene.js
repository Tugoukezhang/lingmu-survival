/**
 * BootScene - 资源加载与初始化场景
 */

import Phaser from 'phaser';

export default class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'Boot' });
    }

    preload() {
        this.updateLoading(10, '加载资源中...');
        
        // 创建加载进度条
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        
        // 背景
        this.add.rectangle(width/2, height/2 - 50, 400, 20, 0x333333).setOrigin(0.5);
        const progressBar = this.add.rectangle(width/2 - 195, height/2 - 55, 0, 10, 0x4A7C59).setOrigin(0, 0.5);
        
        // 加载文本
        const loadingText = this.add.text(width/2, height/2 + 20, '正在初始化...', {
            fontSize: '18px',
            fontFamily: 'Microsoft YaHei',
            color: '#9B7ED9'
        }).setOrigin(0.5);
        
        // 监听加载进度
        this.load.on('progress', (value) => {
            progressBar.width = 390 * value;
            loadingText.setText(`加载中... ${Math.floor(value * 100)}%`);
            window.updateLoadingProgress(30 + value * 40, `加载资源... ${Math.floor(value * 100)}%`);
        });
        
        this.load.on('fileprogress', (file) => {
            loadingText.setText(`加载: ${file.key}`);
        });
        
        // 生成占位精灵（因为还没有实际资源）
        this.createPlaceholderAssets();
        
        this.updateLoading(80, '准备场景...');
    }

    createPlaceholderAssets() {
        // 创建占位纹理 - 这些后续会用AI生成的图片替换
        
        // 1. 灵木（树）占位 - 绿色圆形
        const treeGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        treeGraphics.fillStyle(0x4A7C59, 1);
        treeGraphics.fillCircle(32, 32, 28);
        treeGraphics.fillStyle(0x2D5A3D, 1);
        treeGraphics.fillCircle(32, 38, 20);
        treeGraphics.fillStyle(0x1A3D2A, 1);
        treeGraphics.fillRect(28, 50, 8, 15);
        treeGraphics.generateTexture('tree', 64, 70);
        treeGraphics.destroy();
        
        // 2. 灵石占位 - 黄色六边形
        const stoneGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        stoneGraphics.fillStyle(0xFFD700, 1);
        stoneGraphics.fillCircle(16, 16, 12);
        stoneGraphics.fillStyle(0xFFA500, 1);
        stoneGraphics.fillCircle(16, 18, 8);
        stoneGraphics.generateTexture('spirit_stone', 32, 32);
        stoneGraphics.destroy();
        
        // 3. 妖兽占位 - 红色三角形
        const monsterGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        monsterGraphics.fillStyle(0x8B0000, 1);
        monsterGraphics.fillTriangle(24, 8, 8, 40, 40, 40);
        monsterGraphics.fillStyle(0xFF0000, 1);
        monsterGraphics.fillCircle(20, 25, 4);
        monsterGraphics.fillCircle(28, 25, 4);
        monsterGraphics.generateTexture('monster', 48, 48);
        monsterGraphics.destroy();
        
        // 4. 阵法占位 - 八卦阵
        const formationGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        formationGraphics.lineStyle(3, 0xFFFFFF, 0.8);
        formationGraphics.strokeCircle(48, 48, 40);
        formationGraphics.lineBetween(48, 8, 48, 88);
        formationGraphics.lineBetween(8, 48, 88, 48);
        formationGraphics.generateTexture('formation', 96, 96);
        formationGraphics.destroy();
        
        // 5. 符箓占位 - 黄色纸符
        const talismanGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        talismanGraphics.fillStyle(0xFFFF00, 1);
        talismanGraphics.fillRoundedRect(4, 2, 24, 40, 3);
        talismanGraphics.lineStyle(2, 0xFF6600, 1);
        talismanGraphics.lineBetween(8, 10, 24, 10);
        talismanGraphics.lineBetween(8, 20, 24, 20);
        talismanGraphics.lineBetween(8, 30, 24, 30);
        talismanGraphics.generateTexture('talisman', 32, 44);
        talismanGraphics.destroy();
        
        // 6. UI按钮背景
        const btnGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        btnGraphics.fillStyle(0x4A7C59, 1);
        btnGraphics.fillRoundedRect(0, 0, 120, 50, 8);
        btnGraphics.lineStyle(2, 0x9B7ED9, 1);
        btnGraphics.strokeRoundedRect(0, 0, 120, 50, 8);
        btnGraphics.generateTexture('button', 120, 50);
        btnGraphics.destroy();
        
        // 7. 灵气条背景
        const barGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        barGraphics.fillStyle(0x333333, 1);
        barGraphics.fillRoundedRect(0, 0, 200, 24, 4);
        barGraphics.generateTexture('bar_bg', 200, 24);
        barGraphics.destroy();
        
        // 8. 灵气条填充
        const barFillGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        barFillGraphics.fillGradientStyle(0x4A7C59, 0x4A7C59, 0x9B7ED9, 0x9B7ED9, 1);
        barFillGraphics.fillRoundedRect(0, 0, 200, 24, 4);
        barFillGraphics.generateTexture('bar_fill', 200, 24);
        barFillGraphics.destroy();
        
        // 9. 地面瓦片
        const groundGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        groundGraphics.fillStyle(0x2D2D44, 1);
        groundGraphics.fillRect(0, 0, 64, 64);
        groundGraphics.fillStyle(0x3D3D54, 1);
        groundGraphics.fillRect(2, 2, 60, 60);
        groundGraphics.generateTexture('ground', 64, 64);
        groundGraphics.destroy();
        
        // 10. 攻击特效
        const attackGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        attackGraphics.fillStyle(0xFFFF00, 0.8);
        attackGraphics.fillCircle(24, 24, 20);
        attackGraphics.fillStyle(0xFFFFFF, 1);
        attackGraphics.fillCircle(24, 24, 10);
        attackGraphics.generateTexture('attack_effect', 48, 48);
        attackGraphics.destroy();
        
        // 11. 波次指示器
        const waveGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        waveGraphics.fillStyle(0x9B7ED9, 1);
        waveGraphics.fillCircle(24, 24, 20);
        waveGraphics.generateTexture('wave_icon', 48, 48);
        waveGraphics.destroy();
    }

    create() {
        this.updateLoading(95, '初始化完成...');
        
        // 延迟一下显示主菜单
        this.time.delayedCall(500, () => {
            this.scene.start('MainMenu');
        });
    }
    
    updateLoading(percent, text) {
        window.updateLoadingProgress(percent, text);
    }
}
