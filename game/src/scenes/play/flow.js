// PlayScene methods — Scene-level flows: pet battles, airship travel, fainting, new-player guide.
// Mixed into PlayScene.prototype (see ../PlayScene.js); `this` is the scene.
/* eslint-disable no-unused-vars */
import { GAME_W, GAME_H, TILE, COLORS, FONT, DEBUG, SEED, TIMESCALE } from '../../config.js';
import { ELEMENT_COLORS, petTextureKey, species } from '../../data/pets.js';
import { mulberry32, valueNoise2D } from '../../systems/rng.js';
import InputActions from '../../systems/input.js';
import { GameClock, MS_PER_GAME_MIN, runSettlement, tintAt, phaseAt, formatClock } from '../../systems/time.js';
import { survivalTick } from '../../systems/survival.js';
import { generateIsland, applyChanges, blockedGrid, emptyChanges } from '../../systems/islandGen.js';
import { wildLevel } from '../../systems/petMath.js';
import { depart, returnHome, faint as faintState, pickUpLostBag, lostBagCount } from '../../systems/travel.js';
import { gather, gatherPreview, GATHER } from '../../systems/crafting.js';
import { createBattle, makeWildGroup, canStartBattle } from '../../systems/battle.js';
import { PETS } from '../../data/pets.js';
import * as N from '../../systems/night.js';
import { applyDamage } from '../../systems/survival.js';
import * as CP from '../../systems/camp.js';
import * as EX from '../../systems/explore.js';
import * as GD from '../../systems/guide.js';
import * as DY from '../../systems/daily.js';
import { countOf } from '../../systems/inventory.js';
import { ITEMS } from '../../data/items.js';
import { HOME_COLS, HOME_ROWS, CLIFF, SPEED, PET_HEIGHT, INTERACT_RANGE, FOOT } from './constants.js';

export default {
  // ---------- pet battle (T06) ----------
  partyInsts() { return this.state.party.map((uid) => this.state.pets.find((x) => x.uid === uid)).filter(Boolean); },

  // Returns false when no battle started (tired party).
  startBattle(w) {
    if (this.inBattle || this.traveling || this.sleeping || this.fainted) return false;
    const party = this.partyInsts();
    if (!canStartBattle(party)) { this.showToast('伙伴们累了，回家休息吧'); return false; }   // A06
    this.session.pullFromRegistry();
    const enemies = makeWildGroup({ species: w.species, level: w.level, islandSeed: this.island.seed, wildIndex: Number(w.id.slice(1)), day: this.state.day, pool: PETS.map((x) => x.id) });
    const battle = createBattle({ party, enemies, inventory: this.state.inventory });
    this.inBattle = w;
    this.clock.pause('battle');            // A07: time stops during the battle
    this.session.store.block('battle');    // A03: refreshing mid-battle loads the state from before it
    this.actions.queueInteract && this.actions.consumeInteract();
    this.scene.get('ui').joystick?.release();
    this.scene.sleep('ui');
    this.scene.launch('battle', { battle, wildId: w.id });
    this.scene.pause();
    return true;
  },

  onBattleEnd({ result, wildId, summary }) {
    const w = this.inBattle;
    this.inBattle = null;
    this.scene.resume();
    this.scene.wake('ui');
    this.clock.resume('battle');
    this.session.store.unblock('battle');
    const now = this.time.now;
    if (w) {
      if (result === 'win' || result === 'caught') {   // defeated or caught: gone for good (in the island record)
        this.tweens.add({ targets: [w.sprite, w.shadow, w.tag], alpha: 0, duration: 400, onComplete: () => { w.sprite.destroy(); w.shadow.destroy(); w.tag.destroy(); } });
        this.wild = this.wild.filter((x) => x !== w);
        this.island.pets = this.island.pets.filter((x) => x.id !== wildId);
      } else {
        w.cooldown = now + (result === 'lose' ? 8000 : 4000);
        this.hopAway(w, now);
        if (result === 'lose') this.showToast('伙伴们玩累了，野生宠物跑开了');
      }
    }
    // a caught pet that joined the party comes along right away
    if (result === 'caught' && summary?.caught?.joined) {
      const inst = this.state.pets.find((x) => x.uid === summary.caught.uid);
      if (inst) {
        const pet = this.addPetSprite(inst, { x: w?.sprite.x ?? this.player.x, y: w?.sprite.y ?? this.player.y });
        this.pets.push(pet);
      }
    }
    this.session.save('battle');
  },

  // ---------- travel ----------
  // fade out → change the state (area, time) → save → rebuild the scene
  travel(change, notice) {
    if (this.traveling || this.sleeping) return;
    this.traveling = true;
    this.session.pullFromRegistry();
    const cam = this.cameras.main;
    cam.fadeOut(450, 0, 0, 0);
    cam.once('camerafadeoutcomplete', () => {
      const r = change();
      if (r && r.ok === false) { this.traveling = false; cam.fadeIn(300); return; }
      if (notice) this.session.notice = notice;
      this.session.pushToRegistry();
      this.session.save('travel');
      this.scene.restart();
    });
  },

  // Fainting (docs/06 第 2 节): the whole result is applied and saved at once,
  // then the animation plays (refreshing mid-animation is safe, E10).
  faint() {
    if (this.fainted || this.area !== 'expedition') return;
    this.fainted = true;
    this.clock.pause('faint');
    this.session.pullFromRegistry();
    const r = faintState(this.state, { x: this.player.x, y: this.player.y });
    this.session.pushToRegistry();
    this.session.save('faint');
    const n = r.dropped.reduce((s, x) => s + x.count, 0);
    const notice = n
      ? `在家里醒来了。${n} 件东西掉在了那座岛上，坐飞艇「回到上次的岛」可以捡回来。${r.replaced ? '（之前的失物包找不回来了）' : ''}`
      : r.protected ? '在家里醒来了。新手保护期（前 3 天）倒下不掉东西，东西都还在身上' : '在家里醒来了，生命 50、饱食 50';
    this.showToast('你倒下了……');
    this.tweens.add({ targets: this.player, angle: 90, duration: 400 });
    this.time.delayedCall(900, () => { this.fainted = false; this.travel(() => ({ ok: true }), notice); });
  },

  // test hooks
  travelTo(seed) {
    this.state.expedition = { seed, biome: 'mistwood', changes: emptyChanges() };
    this.state.player.area = 'expedition';
    this.state.player.x = null; this.state.player.y = null;
    this.session.save('travel');
    this.scene.restart();
  },

  goHome() { this.travel(() => returnHome(this.state)); },

  // New-player goals and one-time tips (systems/guide.js).
  updateGuide() {
    if (this.sleeping || this.fainted || this.traveling || this.registry.get('uiModal')) return;
    this.session.pullFromRegistry();
    const done = GD.checkGuide(this.state);
    if (done) {
      this.session.markDirty();
      this.game.events.emit('guide-changed');
      this.showToast(GD.guideDone(this.state) ? '新手目标全部完成！接下来自由探索吧' : `目标完成！下一步：${GD.currentGoal(this.state).text}`);
      return;
    }
    const tip = GD.nextTip(this.state);
    if (tip) { this.session.markDirty(); this.showToast(tip); return; }
    // daily tasks: rewards are given as soon as a task is done
    const dy = DY.checkDaily(this.state);
    if (dy.done.length || dy.bonus) {
      this.session.pushToRegistry();
      this.session.markDirty();
      this.game.events.emit('daily-changed');
      if (dy.bonus) this.showToast(`今天的 3 个任务全部完成！四叶草 +${dy.bonus.clover}，还有一包${ITEMS[dy.bonus.seed].name}`);
      else this.showToast(`每日任务完成：${dy.done.map((t) => t.text).join('、')}　四叶草 +${DY.TASK_REWARD * dy.done.length}`);
    }
  },

};
