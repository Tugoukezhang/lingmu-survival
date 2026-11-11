import { GAME_W, GAME_H, TILE, COLORS, FONT, DEBUG, SEED, TIMESCALE } from '../config.js';
import { ELEMENT_COLORS, petTextureKey, species } from '../data/pets.js';
import { mulberry32, valueNoise2D } from '../systems/rng.js';
import InputActions from '../systems/input.js';
import { GameClock, MS_PER_GAME_MIN, runSettlement, tintAt, phaseAt, formatClock } from '../systems/time.js';
import { survivalTick } from '../systems/survival.js';
import { generateIsland, applyChanges, blockedGrid, emptyChanges } from '../systems/islandGen.js';
import { wildLevel } from '../systems/petMath.js';
import { depart, returnHome, faint as faintState, pickUpLostBag, lostBagCount, goTown, leaveTown, enterHouse, leaveHouse } from '../systems/travel.js';
import { gather, gatherPreview, GATHER } from '../systems/crafting.js';
import { createBattle, makeWildGroup, canStartBattle } from '../systems/battle.js';
import { PETS } from '../data/pets.js';
import * as N from '../systems/night.js';
import { applyDamage } from '../systems/survival.js';
import * as CP from '../systems/camp.js';
import * as EX from '../systems/explore.js';
import * as GD from '../systems/guide.js';
import { countOf } from '../systems/inventory.js';
import { ITEMS } from '../data/items.js';
import { HOME_COLS, HOME_ROWS, CLIFF, SPEED, PET_HEIGHT, INTERACT_RANGE, FOOT } from './play/constants.js';
import worldMethods from './play/world.js';
import actorsMethods from './play/actors.js';
import nightMethods from './play/night.js';
import expeditionMethods from './play/expedition.js';
import flowMethods from './play/flow.js';
import interactionMethods from './play/interaction.js';
import farmMethods from './play/farm.js';
import townMethods from './play/town.js';
import houseMethods from './play/house.js';

// The world: either the home island (placeholder layout) or a generated
// expedition island (systems/islandGen.js), chosen by state.player.area.
// Changing area = update the state and restart this scene.


export default class PlayScene extends Phaser.Scene {
  constructor() { super('play'); }

  create() {
    this.session = this.game.session;
    this.state = this.session.state;
    this.rand = mulberry32(SEED);
    // the scene object is reused on restart: clear what belongs to the previous map
    this.fires = []; this.monsters = []; this.warnings = []; this.lastSpawn = null; this.fogWisps = []; this.torchFx = null;
    this.fireSprites = new Map(); this.chestSprites = new Map(); this.thornSprites = new Map(); this.water = null; this.storageSpot = null;
    this.wading = EX.canWade(this.state);
    this.wicks = []; this.wicksNight = null; this.npcs = null; this.homeBridge = null; this.townBridge = null; this.northBridge = null; this.expandSpot = null; this.cottageSpot = null; this.doorSpot = null; this.decorSpot = null; this.furnSprites = [];
    this.farmRect = null; this.plots = null; this.shipSpot = null; this.seedSpot = null;
    this.lostBag = null; this.bed = null; this.dock = null; this.airship = null; this.island = null; this.wild = null; this.resourceSprites = null; this.lastCanAct = undefined;
    this.traveling = false; this.fainted = false; this.inBattle = null; this.throwing = false; this.covers = null;
    const want = this.state.player.area;
    this.area = want === 'expedition' && this.state.expedition ? 'expedition' : ['town', 'house'].includes(want) ? want : 'home';
    if (this.area === 'expedition') this.buildExpedition(); else if (this.area === 'town') this.buildTown(); else if (this.area === 'house') this.buildHouse(); else this.buildIsland();
    this.buildBackdrop();
    if (this.area !== 'house') this.drawGround();
    if (this.area === 'expedition') this.placeExpeditionProps(); else if (this.area === 'town') this.placeTownProps(); else if (this.area === 'house') this.placeHouseProps(); else this.placeObstacles();
    this.createPlayer();
    this.createPets();
    if (this.area === 'expedition') this.createWildPets();

    this.createWorldUi();
    this.createDayNight();

    // HUD values (day, clock, hp, hunger, clover) are mirrored into the
    // registry by GameSession; this scene writes the player position back.
    this.registry.set('uiModal', false);
    const off = this.session.onBeforeSave((s) => {
      if (s.player.area !== this.area) return; // mid-travel: the position belongs to the old map
      s.player.x = Math.round(this.player.x);
      s.player.y = Math.round(this.player.y);
    });
    this.events.once('shutdown', off);
    this.events.once('shutdown', () => this.game.view3d?.detach());

    this.scene.launch('ui');
    this.actions = new InputActions(this, () => this.scene.get('ui')?.joystick?.vector);
    const onAction = () => this.actions.queueInteract();
    const onSleep = () => this.startSleep(true);
    const onDepart = (mode) => this.travel(() => depart(this.state, mode), mode === 'new' ? '到达新的雾林浮岛，天黑前记得回来' : '回到了上次的浮岛');
    const onReturn = () => this.travel(() => returnHome(this.state), '回到家园了');
    const onFaint = () => this.faint();
    const onBattleEnd = (r) => this.onBattleEnd(r);
    const onParty = () => this.syncParty();
    const onPlaceFire = () => this.placeCampfireNear();
    const onWood = (id) => this.onAddWood(id);
    const onCampSleep = (id) => this.onCampSleep(id);
    const onPlant = (r) => this.onPlant(r);
    const onPetForm = (uid) => this.onPetForm(uid);
    const onPetHappy = (uid) => this.onPetHappy(uid);
    const onPetEvolved = (uid) => this.onPetEvolved(uid);
    const onGoTown = () => this.travel(() => goTown(this.state), '来到了风铃小镇');
    const onLeaveTown = () => this.travel(() => leaveTown(this.state), '回到家园了');
    const onWorldChanged = (msg) => { this.travel(() => ({ ok: true }), msg); };
    const onEnterHouse = () => this.travel(() => enterHouse(this.state));
    const onLeaveHouse = () => this.travel(() => leaveHouse(this.state));
    const onHouseChanged = () => this.refreshHouse();
    const onFarmRefresh = () => this.refreshFarm();
    const ev = this.game.events;
    const handlers = [['action-pressed', onAction], ['sleep-confirm', onSleep], ['depart', onDepart], ['return-home', onReturn], ['player-faint', onFaint], ['battle-end', onBattleEnd], ['party-changed', onParty], ['place-campfire', onPlaceFire], ['camp-add-wood', onWood], ['camp-sleep', onCampSleep], ['plant', onPlant], ['farm-changed', onFarmRefresh], ['pet-form', onPetForm], ['pet-happy', onPetHappy], ['pet-evolved', onPetEvolved], ['go-town', onGoTown], ['leave-town', onLeaveTown], ['world-changed', onWorldChanged], ['enter-house', onEnterHouse], ['leave-house', onLeaveHouse], ['house-changed', onHouseChanged]];
    for (const [name, fn] of handlers) ev.on(name, fn);
    this.events.once('shutdown', () => { for (const [name, fn] of handlers) ev.off(name, fn); });

    const cam = this.cameras.main;
    if (this.area !== 'house') cam.setBounds(0, 0, this.cols * TILE, this.rows * TILE + CLIFF + TILE);
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.setRoundPixels(true);
    cam.fadeIn(400, 0, 0, 0);
  }

  // ---------- loop ----------

  update(time, delta) {
    const dt = Math.min(delta, 50) / 1000;
    this.actions.update();
    this.updateTime(Math.min(delta, 250));
    const busy = this.sleeping || this.fainted || this.traveling;   // no control during fades and fainting
    if (!busy) this.movePlayer(dt);
    this.updatePets(time, dt);
    this.updateWild(time, dt);
    this.wading = EX.canWade(this.state);
    if (time > (this.nextGuideCheck ?? 0)) { this.nextGuideCheck = time + 500; this.updateGuide(); }
    this.updateFires(time);
    this.updateNight(time, delta);
    this.drawLighting();
    if (!this.sleeping && !this.fainted) this.checkLostBag(time);
    this.updateInteraction();
    this.game.view3d?.update(this, time, dt);   // 3D trial (?3d=1): draws this scene's world in 3D
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.x > this.cols * TILE * 0.5 + 200) c.x = -200;
    }
    if (this.debugText) {
      const p = this.player;
      this.debugText.setText(`fps ${Math.round(this.game.loop.actualFps)}\ntile ${Math.floor(p.x / TILE)},${Math.floor(p.y / TILE)}\n${formatClock(this.state.clock)} ${phaseAt(this.state.clock)} ×${TIMESCALE}`);
    }
  }

  // Test helper: centre (px) of the first tile from which `len` tiles in
  // direction (dx, dy) are all walkable, searching outward from the spawn.
  findClearRun(dx, dy, len) {
    for (let r = 0; r < 20; r++) {
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          const tx = this.spawnTile.x + ox, ty = this.spawnTile.y + oy;
          let ok = true;
          for (let i = -1; i <= len && ok; i++) {
            // also require the side columns/rows clear so the foot box never clips
            for (let s = -1; s <= 1 && ok; s++) {
              ok = this.isWalkableTile(tx + dx * i + dy * s, ty + dy * i + dx * s);
            }
          }
          if (ok) return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
        }
      }
    }
    return null;
  }

  // State snapshot for the automated smoke test (tools/smoke-test.mjs).
  debugState() {
    return {
      player: { x: Math.round(this.player.x), y: Math.round(this.player.y) },
      follower: this.follower.data.id,
      followerHuman: this.follower.inst.form === 'human',
      onWalkable: this.footFits(this.player.x, this.player.y),
      day: this.state.day, clock: this.state.clock, phase: phaseAt(this.state.clock), tint: this.tintDark,
      sleeping: this.sleeping, bed: this.bed, dock: this.dock, airshipSpot: this.airship ? { x: this.airship.x, y: this.airship.y } : null, area: this.area,
      hunger: this.state.player.hunger, hp: this.state.player.hp, inBattle: !!this.inBattle, party: [...this.state.party], lostBag: this.lostBag ? { x: this.lostBag.x, y: this.lostBag.y } : null,
      island: this.island ? { seed: this.island.seed, resources: this.island.resources.length, pets: this.island.pets.length, chests: this.island.chests.length, landing: this.island.landing } : null,
    };
  }
}

// The rest of the scene lives in ./play/*.js, grouped by topic.
Object.assign(PlayScene.prototype, worldMethods, actorsMethods, nightMethods, expeditionMethods, flowMethods, interactionMethods, farmMethods, townMethods, houseMethods);
