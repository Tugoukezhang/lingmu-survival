/**
 * 灵木求生 - 游戏主入口
 * 东方玄幻末世求生游戏 v1.0 MVP
 */

// 导入Phaser
import Phaser from 'phaser';

// 导入场景
import BootScene from './scenes/BootScene.js';
import MainMenuScene from './scenes/MainMenuScene.js';
import GameScene from './scenes/GameScene.js';

// 更新加载进度
window.updateLoadingProgress(10, '正在加载配置...');

// 游戏配置
const config = {
    type: Phaser.AUTO,
    width: 1280,
    height: 720,
    parent: 'game-container',
    backgroundColor: '#1a1a2e',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        min: {
            width: 640,
            height: 360
        },
        max: {
            width: 1920,
            height: 1080
        }
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    pixelArt: false,
    antialias: true
};

// 游戏实例
const game = new Phaser.Game(config);

// 注册场景
game.scene.add('Boot', BootScene);
game.scene.add('MainMenu', MainMenuScene);
game.scene.add('Game', GameScene);

// 全局游戏数据管理器
window.GameData = {
    // 玩家数据
    player: {
        level: 1,                    // 境界等级
        realm: '炼气期',             // 境界名称
        spiritStones: 100,           // 灵石
        spiritEssence: 10,            // 灵气
        merit: 0,                     // 功德
        immortalFate: 0,              // 仙缘
    },
    
    // 灵木数据
    tree: {
        level: 1,
        height: 5,
        spiritCapacity: 100,
        spirit: 50,
        rootType: null,               // 灵根类型
        rootQuality: 'C',             // 灵根品质
        tribulationReady: 0,          // 渡劫准备度
    },
    
    // 战斗数据
    battle: {
        currentWave: 0,
        maxWaves: 50,
        monstersKilled: 0,
        inBattle: false,
    },
    
    // 阵法数据
    formations: [],
    
    // 符箓数据
    talismans: {
        attack: 5,
        defense: 3,
        control: 2
    },
    
    // 游戏设置
    settings: {
        soundEnabled: true,
        musicVolume: 0.7,
        sfxVolume: 0.8,
    }
};

// 全局游戏常量
window.GameConstants = {
    // 五行属性
    ELEMENTS: {
        METAL: { name: '金', color: 0xC0C0C0, beats: 'WOOD', weakTo: 'FIRE' },
        WOOD: { name: '木', color: 0x4A7C59, beats: 'EARTH', weakTo: 'METAL' },
        WATER: { name: '水', color: 0x4169E1, beats: 'FIRE', weakTo: 'EARTH' },
        FIRE: { name: '火', color: 0xFF6347, beats: 'METAL', weakTo: 'WATER' },
        EARTH: { name: '土', color: 0xDAA520, beats: 'WATER', weakTo: 'WOOD' }
    },
    
    // 境界配置
    REALMS: [
        { name: '炼气期', level: 1, maxSpirit: 100, tribulationWave: 10 },
        { name: '筑基期', level: 10, maxSpirit: 500, tribulationWave: 20 },
        { name: '金丹期', level: 20, maxSpirit: 2000, tribulationWave: 30 },
        { name: '元婴期', level: 30, maxSpirit: 8000, tribulationWave: 40 },
        { name: '化神期', level: 40, maxSpirit: 30000, tribulationWave: 50 }
    ],
    
    // 波次时间（秒）
    WAVE_INTERVAL: 30,
    WAVE_DURATION: 25,
    
    // 妖兽配置
    MONSTER_TYPES: [
        { name: '游魂', element: 'WATER', hp: 50, damage: 5, speed: 30, reward: 10 },
        { name: '野狼妖', element: 'WOOD', hp: 100, damage: 10, speed: 40, reward: 20 },
        { name: '狐妖', element: 'METAL', hp: 150, damage: 15, speed: 35, reward: 30 },
        { name: '蛇妖', element: 'EARTH', hp: 200, damage: 20, speed: 25, reward: 40 },
        { name: '蛟龙', element: 'WATER', hp: 500, damage: 40, speed: 50, reward: 100 },
    ]
};

// 初始化完成
window.updateLoadingProgress(30, '场景加载完成');

console.log('🎮 灵木求生 - 游戏初始化完成');
