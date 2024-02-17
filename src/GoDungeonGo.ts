import { GameEventType, GameState, GameUpdate, HURT_GRACE, getSpikeState } from "./logic";
import gfxTilesUrl from "./assets/tileset.png";
import gfxTilesRedUrl from "./assets/tilesetred.png";
import gfxTiles2xUrl from "./assets/tileset2x.png";
import gfxLogo from "./assets/logo.png";
import sfxCountdown from "./assets/countdown.mp3";
import sfxCollect from "./assets/collect.mp3";
import sfxDead from "./assets/dead.mp3";
import sfxKey from "./assets/key.mp3";
import sfxWin from "./assets/win.mp3";
import sfxFail from "./assets/fail.mp3";
import sfxHurt from "./assets/hurt.mp3";
import sfxHealUp from "./assets/healup.mp3";
import sfxSpeedUp from "./assets/speedup.mp3";

import { Controls, Entity, EntityType, RUN } from "./entity";
import { Direction, Room, findAllRoomsAt, findRoomAt } from "./room";
import { Interpolator, Players } from "rune-games-sdk";
import nipplejs, { JoystickManager } from 'nipplejs';
import { Game, Sound, TileSet, graphics, sound } from "togl";
import { intersects } from "./util";
import { GameImage, RendererType } from "togl";
import { GameFont } from "togl/dist/graphics";


// a predictable random used to generate the random
// tiles that build up the world. Same seed
// everywhere = same tiles everywhere
function seededRandom(a: number) {
    return function () {
        a |= 0; a = a + 0x9e3779b9 | 0;
        let t = a ^ a >>> 16; t = Math.imul(t, 0x21f0aaad);
        t = t ^ t >>> 15; t = Math.imul(t, 0x735a2d97);
        return ((t = t ^ t >>> 15) >>> 0) / 4294967296;
    }
}

// The puffs of smoke/dust that appear behind the player
// as they run around

// The time the puffs last for
const PUFF_TIME = 250;
// colors for normal running
const PUFF_COLORS = [
    "rgba(255,255,255,0.5)",
    "rgba(230,230,230,0.5)",
    "rgba(200,200,200,0.5)",
    "rgba(180,180,180,0.5)"
];
// colors for speed running
const SPEED_PUFF_COLORS = [
    "rgba(100,100,255,0.7)",
    "rgba(100,100,230,0.7)",
    "rgba(100,100,200,0.7)",
    "rgba(100,100,180,0.7)"
];

// The tile indices for the different floors available. Repeats are to up the chances
// of that tile being picked 
const FLOOR_VARIANTS = [64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 65, 66, 80, 81, 82];
// The tile indices for the different floors walls. Repeats are to up the chances
// of that tile being picked 
const WALL_VARIANTS = [16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 32, 33, 34, 48, 49, 50];

// A random list of floor tiles used to generate an interesting dungeon
const FLOOR_MAP: number[] = [];
// A random list of wall tiles used to generate an interesting dungeon
const WALL_MAP: number[] = [];

// a seeded random number generate used to keep the floor/wall variations consistent 
// between clients
const RNG = seededRandom(12345);

for (let i = 0; i < 1000; i++) {
    FLOOR_MAP[i] = FLOOR_VARIANTS[Math.floor(RNG() * FLOOR_VARIANTS.length)];
    WALL_MAP[i] = WALL_VARIANTS[Math.floor(RNG() * WALL_VARIANTS.length)];
}

// the character names for each fo the different sprites. Humour
// central.
const CHAR_NAMES: Record<EntityType, string> = {
    [EntityType.MONSTER]: "",
    [EntityType.FEMALE_ELF]: "Awen",
    [EntityType.PINK_KNIGHT]: "Sir Gadabout",
    [EntityType.MALE_ELF]: "Legolas",
    [EntityType.ORANGE_KNIGHT]: "Sir Howey",
    [EntityType.FEMALE_MAGE]: "Morgana",
    [EntityType.MALE_MAGE]: "Merlin",
    [EntityType.DINO1]: "Dino",
    [EntityType.DINO2]: "Little Foot",
    [EntityType.FACE_GUY]: "Face Guy",
    [EntityType.ORC]: "Urgg",
    [EntityType.ORC_CHIEF]: "Graar",
    [EntityType.SKELLY]: "Boney",
}

// A puff of smoke/dust behind the player while they run
interface Puff {
    // the x position in the game world of the puff
    x: number;
    // the y position in the game world of the puff
    y: number;
    // the time at which the puff should disappear
    dieAt: number;
    // The size of the puff
    size: number;
    // the offset from the position of the puff
    offset: number;
    // The color of the puff
    col: string;
    // The color to use if the player is using a speed potion
    speedCol: string;
}

// Renderer representation of an entity. Using a Rune interpolator 
// to smooth out movement
export class EntitySprite {
    // the animation frame
    frame = 0;
    // the interpolator used to smooth movement
    interpolator: Interpolator<number[]>
    // the last few locations where the puffs of smoke are generated
    lastFrames: Puff[] = [];

    constructor(localPlayer: boolean) {
        this.interpolator = localPlayer ? Rune.interpolator() : Rune.interpolatorLatency({ maxSpeed: 15 })
    }

    update(x: number, y: number, controls: Controls) {
        // generate some puffs of smoke based on the current
        // movement 
        const controlsDown = Object.values(controls).filter(e => e).length;

        if (controlsDown) {
            const lastX = controls.left ? x + 5 : controls.right ? x - 5 : x;
            const lastY = controls.up ? y + 5 : controls.down ? y - 5 : y;

            this.lastFrames.push({
                x: (x + lastX) / 2, y: (y + lastY) / 2, dieAt: Rune.gameTime() + PUFF_TIME,
                size: 5 + Math.floor(Math.random() * 7), offset: -1 + Math.floor(Math.random() * 3),
                speedCol: SPEED_PUFF_COLORS[Math.floor(Math.random() * PUFF_COLORS.length)],
                col: PUFF_COLORS[Math.floor(Math.random() * PUFF_COLORS.length)]
            });
            this.lastFrames.push({
                x: x, y: y, dieAt: Rune.gameTime() + PUFF_TIME,
                size: 5 + Math.floor(Math.random() * 7), offset: -1 + Math.floor(Math.random() * 3),
                speedCol: SPEED_PUFF_COLORS[Math.floor(Math.random() * PUFF_COLORS.length)],
                col: PUFF_COLORS[Math.floor(Math.random() * PUFF_COLORS.length)]
            });
        }
        this.lastFrames = this.lastFrames.filter(f => f.dieAt > Rune.gameTime());
    }
}

// Renderer representation of the data model's 
// room. Used to record which rooms the local player
// has discovered and the fade as they appear.
// Note: Players see all rooms discovered by any player on the
//       the mini-map but only see rooms they have discovered
//       in the actual game room
export class LocalRoom {
    // True if the room has been discovered by the local player
    discovered = false;
    // The fade in alpha value for the room appearing
    fade = 0;
}

// Effect of a picking something up. Grow the sprite and fade
// out on pick up
interface CollectEffect {
    // The x coordinate in pixels in the game world of the effect
    x: number;
    // The x coordinate in pixels in the game world of the effect
    y: number;
    // The sprite/tile to display
    tile: number;
    // The life of the effect remaining - used to scale the sprite
    // up and fade it out
    life: number;
}

// 
// GO DUNGEON GO! 
//
// It's a race round the dungeon. All players start in the same room and have to 
// find 3 keys to unlock the door to the egg room. First to the egg wins.
//
// As players explore the mini-map updates for everyone, so the first player to find 
// the gold key has also given it's location away to the other players etc.
//
export class GoDungeonGo implements Game {
    // 2x scaled up versions of the tile set, saves us doing any scaling manipulation
    // at runtime.
    tiles2x: TileSet;
    // The tile set being used to render the game
    tiles: TileSet;
    // A red tinted version of the tiles used when someone gets hurt. Again saves run
    // time tinting.
    tilesRed: TileSet;

    // The latest game state received 
    game?: GameState;
    // True if we've joined the game
    joined = false;
    // The size of the dpad and button on the screen. Proportional to screen size
    controlSize = 0;
    // padding from the edge of the screen for the controls
    controlHorizontalPadding = 0;
    // padding from the edge of the screen for the controls
    controlVerticalPadding = 0;
    // The ID of the local player in the shared game world
    playerId?: string;

    // The x coordinate of the view/camera location
    viewX = 0;
    // The y coordinate of the view/camera location
    viewY = 0;

    // A collection of renderer representations of the entities in the game, keyed on the entity ID
    entitySprites: Record<string, EntitySprite> = {};
    // A collection of renderer representations of the rooms in the game, keyed on Room ID
    localRooms: Record<number, LocalRoom> = {};

    // The list of players that joined the Rune room
    players?: Players;
    // The images for the avatars provided by Rune
    avatarImages: Record<string, GameImage> = {}
    // The game logo 
    logo: GameImage;

    // the character the player has selected
    selectedType: EntityType = EntityType.PINK_KNIGHT;
    // the list of potential characters
    typeOptions: EntityType[] = [EntityType.FEMALE_ELF, EntityType.PINK_KNIGHT, EntityType.MALE_ELF, EntityType.FEMALE_MAGE, EntityType.MALE_MAGE, EntityType.DINO1, EntityType.ORANGE_KNIGHT, EntityType.DINO2, EntityType.FACE_GUY, EntityType.ORC, EntityType.ORC_CHIEF, EntityType.SKELLY];

    // animation frame for the start up screen
    frame = 0;

    // the list of pick up effects that are currently rendered. 
    effects: CollectEffect[] = [];

    // sound for picking up a key
    sfxKey: Sound;
    // sound for collecting an item
    sfxCollect: Sound;
    // sound for the countdown beeps
    sfxCountdown: Sound;
    // sound for when we win
    sfxWin: Sound;
    // sound for when we run out of time
    sfxFail: Sound;
    // sound for a player death
    sfxDead: Sound;
    // sound for a player getting hurt
    sfxHurt: Sound;
    // sound for when a player drinks a heal potion
    sfxHealUp: Sound;
    // sound for when a player drinks a speed potion
    sfxSpeedUp: Sound;

    font10Black: GameFont;
    font10White: GameFont;
    font50Red: GameFont;
    font20White: GameFont;
    font50White: GameFont;

    // joystick
    joystick?: JoystickManager;

    // local controls
    controls: Controls = {
        left: false,
        right: false,
        up: false,
        down: false
    };
    lastActionedControls = { ...this.controls };

    constructor() {
        // load all the resources
        graphics.init(RendererType.WEBGL, true);

        this.font10Black = graphics.generateFont(10, "black");
        this.font10White = graphics.generateFont(10, "white");
        this.font50Red = graphics.generateFont(50,  "#da4e38", "TIMEOUT!");
        this.font50White = graphics.generateFont(50,  "white");
        this.font20White = graphics.generateFont(20, "white");

        this.tiles = graphics.loadTileSet(gfxTilesUrl, 32, 32);
        this.tilesRed = graphics.loadTileSet(gfxTilesRedUrl, 32, 32);
        this.tiles2x = graphics.loadTileSet(gfxTiles2xUrl, 64, 64);
        this.logo = graphics.loadImage(gfxLogo);
        this.sfxKey = sound.loadSound(sfxKey);
        this.sfxCollect = sound.loadSound(sfxCollect);
        this.sfxCountdown = sound.loadSound(sfxCountdown);
        this.sfxWin = sound.loadSound(sfxWin);
        this.sfxFail = sound.loadSound(sfxFail);
        this.sfxDead = sound.loadSound(sfxDead);
        this.sfxHurt = sound.loadSound(sfxHurt);
        this.sfxHealUp = sound.loadSound(sfxHealUp);
        this.sfxSpeedUp = sound.loadSound(sfxSpeedUp);

        // select a random type, might help players get familiar with possible characters
        this.selectedType = this.typeOptions[Math.floor(Math.random() * this.typeOptions.length)];

        this.joystick = nipplejs.create({
            mode: "static",
            zone: document.getElementById("joystick") ?? document.body,
            position: { left: '40%', bottom: '35%' }
        });
        this.joystick.on("move", (event, joystick) => {
            if (Math.abs(joystick.vector.x) > 0.1) {
                this.controls.left = joystick.direction.x === "left";
                this.controls.right = joystick.direction.x === "right";
            } else {
                this.controls.left = false;
                this.controls.right = false;
            }
            if (Math.abs(joystick.vector.y) > 0.1) {
                this.controls.up = joystick.direction.y === "up";
                this.controls.down = joystick.direction.y === "down";
            } else {
                this.controls.up = false;
                this.controls.down = false;
            }
        });
        this.joystick.on("end", () => {
            this.controls.left = false;
            this.controls.right = false;
            this.controls.up = false;
            this.controls.down = false;
        });
    }
    resourcesLoaded(): void {
        // tell rune to let us know when a game
        // update happens
        Rune.initClient({
            onChange: (update) => {
                this.gameUpdate(update);
            },
        });
    }

    // start the game
    start(): void {
        // register ourselves as the input listener so
        // we get nofified of mouse presses
        graphics.startRendering(this);
    }

    // notification of a new game state from the Rune SDK
    gameUpdate(update: GameUpdate) {
        // process any events that have taken place
        for (const event of update.game.events) {
            // when the game restart we need to clear up our 
            // representation of the world
            if (event.type === GameEventType.RESTART) {
                this.entitySprites = {};
                this.localRooms = {};
                this.effects = [];
            }
            // if we got hurt play the SFX
            if (event.type === GameEventType.HURT) {
                if (event.who === this.playerId) {
                    sound.playSound(this.sfxHurt);
                }
            }
            // if we died play the SFX
            if (event.type === GameEventType.DEATH) {
                if (event.who === this.playerId) {
                    sound.playSound(this.sfxDead);
                }
                if (event.who) {
                    delete this.entitySprites[event.who];
                }
            }
            // play the win SFX
            if (event.type === GameEventType.WIN) {
                sound.playSound(this.sfxWin);
            }
            // play the ran out of time SFX
            if (event.type === GameEventType.TIME_OUT) {
                sound.playSound(this.sfxFail);
            }
            if (event.type === GameEventType.START_COUNTDOWN) {
                // delay the countdown by one second since for 
                // some reason it only has 5 beeps 
                setTimeout(() => {
                    sound.playSound(this.sfxCountdown);
                }, 1000);
            }
            // if we used a speed potion play the sound
            if (event.type === GameEventType.SPEED_UP) {
                if (event.who === this.playerId) {
                    sound.playSound(this.sfxSpeedUp);
                }
            }
            // if we used a heal potion play the sound
            if (event.type === GameEventType.HEAL_UP) {
                if (event.who === this.playerId) {
                    sound.playSound(this.sfxHealUp);
                }
            }
            // if its us who picked up the item play the SFX and run the effect
            if (event.type === GameEventType.GOT_HEALTH) {
                if (event.who === this.playerId) {
                    if (event.x && event.y) {
                        this.effects.push({ x: event.x * 32, y: event.y * 32, life: 30, tile: 27 })
                    }
                    sound.playSound(this.sfxCollect);
                }
            }
            // if its us who picked up the item play the SFX and run the effect
            if (event.type === GameEventType.GOT_SPEED) {
                if (event.who === this.playerId) {
                    if (event.x && event.y) {
                        this.effects.push({ x: event.x * 32, y: event.y * 32, life: 30, tile: 28 })
                    }
                    sound.playSound(this.sfxCollect);
                }
            }
            // if its us who picked up the item play the SFX and run the effect
            if (event.type === GameEventType.GOT_TREASURE) {
                if (event.who === this.playerId) {
                    if (event.x && event.y) {
                        this.effects.push({ x: event.x * 32, y: event.y * 32, life: 30, tile: 6 })
                    }
                    sound.playSound(this.sfxCollect);
                }
            }
            // if its us who picked up the item play the SFX and run the effect
            if (event.type === GameEventType.GOT_BRONZE) {
                if (event.who === this.playerId) {
                    if (event.x && event.y) {
                        this.effects.push({ x: event.x * 32, y: event.y * 32, life: 30, tile: 11 })
                    }
                    sound.playSound(this.sfxKey);
                }
            }
            // if its us who picked up the item play the SFX and run the effect
            if (event.type === GameEventType.GOT_SILVER) {
                if (event.who === this.playerId) {
                    if (event.x && event.y) {
                        this.effects.push({ x: event.x * 32, y: event.y * 32, life: 30, tile: 10 })
                    }
                    sound.playSound(this.sfxKey);
                }
            }
            // if its us who picked up the item play the SFX and run the effect
            if (event.type === GameEventType.GOT_GOLD) {
                if (event.who === this.playerId) {
                    if (event.x && event.y) {
                        this.effects.push({ x: event.x * 32, y: event.y * 32, life: 30, tile: 9 })
                    }
                    sound.playSound(this.sfxKey);
                }
            }
        }

        // update any pick up effects
        for (const p of [...this.effects]) {
            p.life -= 1;
            if (p.life < 0) {
                this.effects.splice(this.effects.indexOf(p), 1);
            }
        }

        // record our current game state and the state
        // of the players in the game
        this.game = update.game;
        this.playerId = update.yourPlayerId;
        this.players = update.players;

        for (const entity of this.game.entities) {
            if (!this.entitySprites[entity.id]) {
                this.entitySprites[entity.id] = new EntitySprite(entity.id === this.playerId);
                this.entitySprites[entity.id].interpolator.update({
                    game: [entity.x, entity.y],
                    futureGame: [entity.x, entity.y]
                });
            }
        }
        // load any avatar images we haven't already got
        for (const playerId in update.players) {
            if (!this.avatarImages[playerId]) {
                this.avatarImages[playerId] = graphics.loadImage(update.players[playerId].avatarUrl, false);
            }
        }

        // cause the entities in the game to update 
        // to match the current game state.
        for (const entity of this.game.entities) {
            const sprite = this.entitySprites[entity.id];
            const futureEntity = update.futureGame?.entities.find(e => e.id === entity.id);

            if (futureEntity) {
                sprite.interpolator.update({
                    game: [entity.x, entity.y],
                    futureGame: [futureEntity.x, futureEntity.y]
                });
            }
        }

        // clean up any sprites not being used any more
        const toRemove = Object.keys(this.entitySprites).filter(id => !this.game?.entities.find(e => e.id === id));
        for (const id of toRemove) {
            delete this.entitySprites[id];
        }

        // generate local room representations if they don't
        // already exist
        for (const room of this.game.rooms) {
            let local = this.localRooms[room.id];
            if (!local) {
                local = this.localRooms[room.id] = new LocalRoom();
            }
        }

        // attempt to update controls if they're not synced with
        // the data model
        setTimeout(() => {
            this.updateControls();
        }, 10);
    }

    updateControls(): void {
        if (this.game) {
            if ((this.lastActionedControls.left !== this.controls.left) || (this.lastActionedControls.right !== this.controls.right) ||
                (this.lastActionedControls.up !== this.controls.up) || (this.lastActionedControls.down !== this.controls.down)) {
                Rune.actions.applyControls({ ...this.controls });
                this.lastActionedControls = { ...this.controls };
            }
        }
    }

    // Notification of a mouse press or touch start
    mouseDown(x: number, y: number): void {
        if (this.joined) {
            const controlsY = graphics.height() - this.controlSize - this.controlVerticalPadding;

            if (intersects(x, y, graphics.width() - this.controlSize - this.controlHorizontalPadding, controlsY, this.controlSize, this.controlSize)) {
                Rune.actions.useItem();
            }
        }
    }

    // Notification of a mouse drag or a touch move
    mouseDrag(): void {
        // nothing to see here
    }

    // Notification of a mouse up or a touch end
    mouseUp(x: number, y: number): void {
        // do nothing
        if (!this.joined) {
            // do the buttons on the front page for character
            // selection
            if (x < 84) {
                // left press
                let index = this.typeOptions.indexOf(this.selectedType);
                if (index > 0) {
                    index--;
                }

                this.selectedType = this.typeOptions[index];
            } else if (x > graphics.width() - 84) {
                // right press
                let index = this.typeOptions.indexOf(this.selectedType);
                if (index < this.typeOptions.length - 1) {
                    index++;
                }

                this.selectedType = this.typeOptions[index];
            } else if (y > 350) {
                Rune.actions.join({ type: this.selectedType });
                this.joined = true;
            }
        }
    }

    // notification of a key press - this isn't relevant to mobile Rune, but is used for testing
    // in the emulator
    keyDown(key: string): void {
        if (this.game) {
            const myEntity = this.game.entities.find(e => e.id === this.playerId);
            if (myEntity) {
                if (key === "ArrowLeft") {
                    this.controls.left = true;
                }
                if (key === "ArrowRight") {
                    this.controls.right = true;
                }
                if (key === "ArrowUp") {
                    this.controls.up = true;
                }
                if (key === "ArrowDown") {
                    this.controls.down = true;
                }
                if (key === " ") {
                    Rune.actions.useItem();
                }
            }
        }
    }

    // notification of a key release - this isn't relevant to mobile Rune, but is used for testing
    // in the emulator
    keyUp(key: string): void {
        if (this.game) {
            const myEntity = this.game.entities.find(e => e.id === this.playerId);
            if (myEntity) {
                if (key === "ArrowLeft") {
                    this.controls.left = false;
                }
                if (key === "ArrowRight") {
                    this.controls.right = false;
                }
                if (key === "ArrowUp") {
                    this.controls.up = false;
                }
                if (key === "ArrowDown") {
                    this.controls.down = false;
                }
            }
        }
    }

    // Draw a room in the world. Normally I'd do this a rendering a tile map, but in this case
    // I decided to model the rooms as objects and render the tiles based on the room's existence
    // rather than tile by tile from a tile map. This is useful for keeping state small but makes
    // collision uncomfortably slow.
    drawRoom(room: Room): void {
        let myEntity: Entity | undefined;

        if (this.game) {
            myEntity = this.game.entities.find(e => e.id === this.playerId)
        }

        graphics.push();
        graphics.translate(room.x * 32, room.y * 32);

        // render the floor
        for (let x = 0; x < room.width; x++) {
            for (let y = 0; y < room.height; y++) {
                graphics.drawTile(this.tiles, x * 32, y * 32, FLOOR_MAP[Math.abs((x * y) % FLOOR_MAP.length)]);
            }
        }

        // render top/bottom walls
        for (let x = 1; x < room.width - 1; x++) {
            graphics.drawTile(this.tiles, x * 32, -32, 0);
            graphics.drawTile(this.tiles, x * 32, 0, WALL_MAP[Math.abs((x * room.y) % WALL_MAP.length)]);
            graphics.drawTile(this.tiles, x * 32, (room.height * 32) - 32, 0);
            graphics.drawTile(this.tiles, x * 32, (room.height * 32), 16);
        }

        // render left/right walls
        for (let y = 1; y < room.height - 1; y++) {
            graphics.drawTile(this.tiles, 0, y * 32, 129);
            graphics.drawTile(this.tiles, (room.width * 32) - 32, y * 32, 128);
        }

        // corners
        graphics.drawTile(this.tiles, 0, -32, 114);
        graphics.drawTile(this.tiles, 0, 0, 130);
        graphics.drawTile(this.tiles, (room.width * 32) - 32, -32, 115);
        graphics.drawTile(this.tiles, (room.width * 32) - 32, 0, 131);
        graphics.drawTile(this.tiles, 0, (room.height * 32) - 32, 146);
        graphics.drawTile(this.tiles, 0, (room.height * 32), 162);
        graphics.drawTile(this.tiles, (room.width * 32) - 32, (room.height * 32) - 32, 147);
        graphics.drawTile(this.tiles, (room.width * 32) - 32, (room.height * 32), 163);

        const halfX = Math.floor(room.width / 2) - 1;
        const halfY = Math.floor(room.height / 2) - 1;

        const hasAllKeys = (myEntity?.bronzeKey || (this.game?.keyCount ?? 0 < 3)) && myEntity?.goldKey && myEntity?.silverKey

        let base = 0;
        if ((this.game?.keyCount ?? 0) < 3) {
            base = 196;
        }

        // north door
        if (room.connections[Direction.NORTH]) {
            graphics.drawTile(this.tiles, halfX * 32, 0, 64);
            graphics.drawTile(this.tiles, (halfX + 1) * 32, 0, 64);
            graphics.drawTile(this.tiles, halfX * 32, -32, 64);
            graphics.drawTile(this.tiles, (halfX + 1) * 32, -32, 64);
            graphics.drawTile(this.tiles, (halfX - 1) * 32, -32, 128);
            graphics.drawTile(this.tiles, (halfX + 2) * 32, -32, 129);

            if (this.game?.atStart) {
                graphics.drawTile(this.tiles, halfX * 32, -32, 45);
                graphics.drawTile(this.tiles, (halfX + 1) * 32, -32, 45);
            }
            if (room.doors[Direction.NORTH]) {
                if (hasAllKeys) {
                    graphics.alpha(0.5);
                }
                graphics.drawTile(this.tiles, halfX * 32, -32, base+12);
                graphics.drawTile(this.tiles, (halfX + 1) * 32, -32, base+13);
                graphics.alpha(1);
            }
        }
        // south door
        if (room.connections[Direction.SOUTH]) {
            graphics.drawTile(this.tiles, halfX * 32, (room.height * 32) - 32, 64);
            graphics.drawTile(this.tiles, (halfX + 1) * 32, (room.height * 32) - 32, 64);
            graphics.drawTile(this.tiles, halfX * 32, (room.height * 32), 64);
            graphics.drawTile(this.tiles, (halfX + 1) * 32, (room.height * 32), 64);
            graphics.drawTile(this.tiles, (halfX - 1) * 32, (room.height * 32), 128);
            graphics.drawTile(this.tiles, (halfX + 2) * 32, (room.height * 32), 129);

            if (this.game?.atStart) {
                graphics.drawTile(this.tiles, halfX * 32, (room.height * 32), 45);
                graphics.drawTile(this.tiles, (halfX + 1) * 32, (room.height * 32), 45);
            }
            if (room.doors[Direction.SOUTH]) {
                if (hasAllKeys) {
                    graphics.alpha(0.5);
                }
                graphics.drawTile(this.tiles, halfX * 32, (room.height * 32) + 32, base+12);
                graphics.drawTile(this.tiles, (halfX + 1) * 32, (room.height * 32) + 32, base+13);
                graphics.alpha(1);
            }
        }
        // west door
        if (room.connections[Direction.WEST]) {
            graphics.drawTile(this.tiles, 0, (halfY * 32), 64);
            graphics.drawTile(this.tiles, 0, (halfY * 32) + 32, 64);
            graphics.drawTile(this.tiles, -32, (halfY * 32), 64);
            graphics.drawTile(this.tiles, -32, (halfY * 32) + 32, 64);
            graphics.drawTile(this.tiles, -32, (halfY * 32) - 32, 16);
            graphics.drawTile(this.tiles, 0, (halfY * 32) - 32, 145);
            graphics.drawTile(this.tiles, -32, (halfY * 32) - 64, 0);
            graphics.drawTile(this.tiles, -32, (halfY * 32) + 38, 0);
            graphics.drawTile(this.tiles, -32, (halfY * 32) + 70, 16);

            if (this.game?.atStart) {
                graphics.drawTile(this.tiles, -32, (halfY * 32) - 31, 61);
                graphics.drawTile(this.tiles, -32, (halfY * 32) + 1, 61);
                graphics.drawTile(this.tiles, -32, (halfY * 32) + 33, 61);
            }
            if (room.doors[Direction.WEST]) {
                if (hasAllKeys) {
                    graphics.alpha(0.5);
                }
                graphics.drawTile(this.tiles, -48, (halfY * 32) - 31, base+14);
                graphics.drawTile(this.tiles, -48, (halfY * 32) + 1, base+30);
                graphics.drawTile(this.tiles, -48, (halfY * 32) + 33, base+46);
                graphics.alpha(1);
            }
        }
        // east door
        if (room.connections[Direction.EAST]) {
            graphics.drawTile(this.tiles, room.width * 32, (halfY * 32), 64);
            graphics.drawTile(this.tiles, room.width * 32, (halfY * 32) + 32, 64);
            graphics.drawTile(this.tiles, room.width * 32 - 32, (halfY * 32), 64);
            graphics.drawTile(this.tiles, room.width * 32 - 32, (halfY * 32) + 32, 64);

            graphics.drawTile(this.tiles, room.width * 32, (halfY * 32) - 32, 16);
            graphics.drawTile(this.tiles, (room.width * 32) - 32, (halfY * 32) - 32, 144);
            graphics.drawTile(this.tiles, room.width * 32, (halfY * 32) - 64, 0);

            graphics.drawTile(this.tiles, room.width * 32, (halfY * 32) + 38, 0);
            graphics.drawTile(this.tiles, room.width * 32, (halfY * 32) + 70, 16);

            if (this.game?.atStart) {
                graphics.drawTile(this.tiles, (room.width * 32), (halfY * 32) - 31, 61);
                graphics.drawTile(this.tiles, (room.width * 32), (halfY * 32) + 1, 61);
                graphics.drawTile(this.tiles, (room.width * 32), (halfY * 32) + 33, 61);
            }

            if (room.doors[Direction.EAST]) {
                if (hasAllKeys) {
                    graphics.alpha(0.5);
                }
                graphics.drawTile(this.tiles, (room.width * 32) + 16, (halfY * 32) - 31, base+14);
                graphics.drawTile(this.tiles, (room.width * 32) + 16, (halfY * 32) + 1, base+30);
                graphics.drawTile(this.tiles, (room.width * 32) + 16, (halfY * 32) + 33, base+46);
                graphics.alpha(1);
            }
        }

        // render any item in the world
        if (room.item === "treasure") {
            graphics.drawTile(this.tiles, Math.floor((room.width - 1) * 16), Math.floor((room.height - 1) * 16), 6);
        }
        if (room.item === "speed") {
            graphics.drawTile(this.tiles, Math.floor((room.width - 1) * 16), Math.floor((room.height - 1) * 16), 28);
        }
        if (room.item === "health") {
            graphics.drawTile(this.tiles, Math.floor((room.width - 1) * 16), Math.floor((room.height - 1) * 16), 27);
        }
        if (room.item === "bronze" && !myEntity?.bronzeKey) {
            graphics.drawTile(this.tiles, Math.floor((room.width - 1) * 16), Math.floor((room.height - 1) * 16), 11);
        }
        if (room.item === "silver" && !myEntity?.silverKey) {
            graphics.drawTile(this.tiles, Math.floor((room.width - 1) * 16), Math.floor((room.height - 1) * 16), 10);
        }
        if (room.item === "gold" && !myEntity?.goldKey) {
            graphics.drawTile(this.tiles, Math.floor((room.width - 1) * 16), Math.floor((room.height - 1) * 16), 9);
        }
        if (room.item === "egg") {
            graphics.drawTile(this.tiles, Math.floor((room.width - 1) * 16), Math.floor((room.height - 1) * 16) - 32, 22);
            graphics.drawTile(this.tiles, Math.floor((room.width - 1) * 16), Math.floor((room.height - 1) * 16), 38);
        }

        // if there are spikes render them
        if (room.spikes) {
            for (const location of room.spikeLocations) {
                // get the spike state and render the appropriate sprite to have
                // the spikes popping in and out
                const frame = getSpikeState(location.x + room.x, location.y + room.y, Rune.gameTime());
                graphics.drawTile(this.tiles, location.x * 32, location.y * 32, 176 + frame);
            }
        }

        // debug for room locations
        // if (this.game) {
        //     const myEntity = this.game.entities.find(e => e.id === this.playerId)
        //     if (myEntity) {
        //         if (inRoomSpace(room, myEntity.x, myEntity.y)) {
        //             graphics.fillRect(-32, -32, (room.width + 2) * 32, (room.height + 2) * 32, "rgba(255,0,0,0.5)");
        //         }
        //     }
        // }
        graphics.pop();
    }

    render(): void {
        graphics.fillRect(0,0,graphics.width(), graphics.height(), "black");

        // calculate the controls size based on the screen size
        this.controlSize = graphics.width() / 5;
        this.controlHorizontalPadding = this.controlSize / 1.5
        this.controlVerticalPadding = this.controlSize;

        if (this.game) {
            if (this.joined) {
                // simple player camera tracking
                const myEntity = this.game.entities.find(e => e.id === this.playerId)
                if (myEntity) {
                    const sprite = this.entitySprites[myEntity.id];
                    const pos = sprite.interpolator.getPosition();
                    this.viewX = pos[0] - (graphics.width() / 2);
                    this.viewY = pos[1] - (graphics.height() * 0.4);

                    for (const room of findAllRoomsAt(this.game, myEntity.x, myEntity.y)) {
                        const localRoom = this.localRooms[room.id];
                        localRoom.discovered = true;
                    }
                }

                for (const room of Object.values(this.localRooms)) {
                    if (room.discovered && room.fade < 1) {
                        room.fade += 0.1;
                    }
                }

                graphics.push();
                graphics.translate(-this.viewX, -this.viewY);

                // render all the rooms
                for (const room of this.game.rooms) {
                    if (myEntity) {
                        // very simple culling of rooms that are off screen.
                        const dx = Math.abs((room.x * 32) - myEntity.x)
                        const dy = Math.abs((room.y * 32) - myEntity.y);
                        if (dx > graphics.width() * 2 || dy > graphics.height() * 2) {
                            continue;
                        }
                    }

                    const localRoom = this.localRooms[room.id];
                    if (localRoom && localRoom.discovered) {
                        // if the room is fading in on discovery then apply the alpha
                        graphics.alpha(localRoom.fade);
                        this.drawRoom(room);
                        graphics.alpha(1);
                    }
                }


                // render the entities in y order to make them go behind/in front
                // of each other.
                const ysort = [...this.game.entities];
                ysort.sort((a, b) => a.y - b.y);

                for (const entity of ysort) {
                    const room = findRoomAt(this.game, entity.x, entity.y);
                    if (room) {
                        const localRoom = this.localRooms[room.id];
                        // only render an entity if the room its in has been
                        // discovered by this player
                        if (localRoom && localRoom.discovered) {
                            // use the interpolator to get the position
                            // to keep movement of remote entities smooth
                            const sprite = this.entitySprites[entity.id];
                            const pos = sprite.interpolator.getPosition();
                            sprite.update(pos[0], pos[1], entity.controls);

                            // move the animation forward
                            sprite.frame += 0.1;
                            if (sprite.frame >= entity.anim.count) {
                                sprite.frame = 0;
                            }

                            graphics.push();

                            // draw the smoke/dust trail for running fast!
                            if (entity.type !== EntityType.MONSTER) {
                                for (const puff of sprite.lastFrames) {
                                    const remaining = puff.dieAt - Rune.gameTime();
                                    if (remaining > PUFF_TIME * 0.9) {
                                        continue;
                                    }
                                    const scale = remaining / PUFF_TIME;
                                    graphics.alpha(scale);
                                    // TODO: Sort out particle here
                                    //graphics.halfCircle(puff.x - puff.offset, puff.y - puff.offset, puff.size, entity.speed > 10 ? puff.speedCol : puff.col);
                                    graphics.alpha(1);
                                }
                            }

                            // draw the actual character 
                            graphics.translate(pos[0] - 16, pos[1] - 32);

                            // render the player's name
                            if (this.players && this.players[entity.id]) {
                                const name = this.players[entity.id].displayName;
                                graphics.drawText(16 - Math.floor(graphics.textWidth(name, this.font10Black) / 2), - 15, name, this.font10Black);
                                graphics.drawText(16 - Math.floor(graphics.textWidth(name, this.font10White) / 2), - 16, name, this.font10White);
                            }
                            // flip it for changing direction
                            if (entity.faceLeft) {
                                graphics.scale(-1, 1);
                                graphics.translate(-32, 0);
                            }

                            graphics.translate(16,16);
                            if (Rune.gameTime() < entity.respawnedAt + 1000) {
                                // respawn in place, do the effect
                                let delta = 1 - (((entity.respawnedAt + 1000) - Rune.gameTime()) / 1000);
                                if (delta > 0.5) { 
                                    delta = (delta - 0.5) / 0.5;
                                    graphics.alpha(delta);
                                    graphics.scale(5 - (delta * 4), 5 - (delta * 4));
                                } else {
                                    graphics.pop();
                                    continue;
                                }
                            }
                            let tiles = this.tiles;
                            // use the red set if the player is hurt
                            if (Rune.gameTime() - entity.hurtAt < HURT_GRACE) {
                                const sinceHurt = Rune.gameTime() - entity.hurtAt;
                                if (Math.floor(sinceHurt / 200) % 2 === 0) {
                                    tiles = this.tilesRed;
                                }
                            }
                            graphics.drawTile(tiles, -16, -48, entity.type + Math.floor(entity.anim.base + sprite.frame));
                            graphics.drawTile(tiles, -16, -16, entity.type + 16 + Math.floor(entity.anim.base + sprite.frame));

                            graphics.pop();
                        }
                    }
                }

                // render all the pick up effects
                for (const p of this.effects) {
                    graphics.push();
                    graphics.alpha(Math.min(1, p.life / 30));
                    graphics.translate(p.x, p.y);
                    graphics.scale(1 + (5 * (1 - Math.min(1, p.life / 30))), 1 + (5 * (1 - Math.min(1, p.life / 30))));
                    graphics.drawTile(this.tiles, -16, -16, p.tile);
                    graphics.pop();
                }

                graphics.pop();

                // render mini map
                if (this.game && !this.game.atStart && !this.game.gameOver) {
                    graphics.push();

                    const myEntity = this.game.entities.find(e => e.id === this.playerId)
                    if (myEntity) {
                        graphics.scale(1.5, 1.5);
                        graphics.fillRect(0, 0, 84, 84, "rgba(0,0,0,0.5)");
                        graphics.translate(42, 42);
                        for (const room of this.game.rooms) {
                            if (room.discovered) {
                                let col = "rgba(255,255,255,0.5)";
                                if (room.item === "bronze") {
                                    col = "rgba(255,155,0,0.8)";
                                }
                                if (room.item === "silver") {
                                    col = "rgba(240,240,255,0.8)";
                                }
                                if (room.item === "gold") {
                                    col = "rgba(255,255,0,0.8)";
                                }
                                if (room.enemy || room.spikes) {
                                    col = "rgba(255,50,50,0.4)";
                                }
                                graphics.fillRect(room.x, room.y, room.width, room.height, col);
                                if (room.connections[Direction.NORTH]) {
                                    graphics.fillRect(room.x + (room.width / 2) - 2, room.y - 2, 4, 2, room.doors[Direction.NORTH] ? "rgb(255,255,0)" : "rgb(200,200,200)");
                                }
                                if (room.connections[Direction.SOUTH]) {
                                    graphics.fillRect(room.x + (room.width / 2) - 2, room.y + room.height, 4, 2, room.doors[Direction.SOUTH] ? "rgb(255,255,0)" : "rgb(200,200,200)");
                                }
                                if (room.connections[Direction.WEST]) {
                                    graphics.fillRect(room.x - 2, room.y + (room.height / 2) - 2, 2, 4, room.doors[Direction.WEST] ? "rgb(255,255,0)" : "rgb(200,200,200)");
                                }
                                if (room.connections[Direction.EAST]) {
                                    graphics.fillRect(room.x + room.width, room.y + (room.height / 2) - 2, 2, 4, room.doors[Direction.EAST] ? "rgb(255,255,0)" : "rgb(200,200,200)");
                                }
                            }
                        }

                        for (const entity of this.game.entities.filter(e => e.type !== EntityType.MONSTER)) {
                            const room = findRoomAt(this.game, entity.x, entity.y);
                            if (room && room.discovered) {
                                const localRoom = this.localRooms[room.id];
                                if (localRoom) {
                                    // TODO - Use a sprite here
                                    // graphics.fillCircle(Math.floor(entity.x / 32), Math.floor(entity.y / 32), 1.5, entity === myEntity ? "white" : "black");
                                }
                            }
                        }
                    }
                    graphics.pop();
                }

                // render score board when at start
                if (this.game && this.players && (this.game.atStart || this.game.gameOver)) {
                    let item = 0;
                    const scores = [];

                    for (const playerId in this.game.scores) {
                        scores.push({ ...this.players[playerId], score: this.game.scores[playerId] });
                    }

                    scores.sort((a, b) => b.score - a.score);

                    for (const score of scores) {
                        graphics.fillRect(0, 1 + (item * 34), graphics.width(), 32, item % 2 === 0 ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.3)");
                        graphics.drawImage(this.avatarImages[score.playerId], 1, (item * 34) + 2, 30, 30);
                        graphics.drawText(40, 25 + (item * 34), score.displayName, this.font20White);
                        graphics.drawText(graphics.width() - graphics.textWidth("" + score.score, this.font20White) - 20, 25 + (item * 34), "" + score.score, this.font20White);
                        item++;
                    }
                }

                // draw the status message
                if (this.game.atStart) {
                    graphics.fillRect(0, 130, graphics.width(), 200, "rgba(0,0,0,0.5)");

                    if (this.game.countDown > 2) {
                        const message = "Find the Keys!";
                        let x = (graphics.width() / 2) - 32;
                        if (this.game.keyCount > 2) {
                            x -= 16;
                        }
                        const keys = [9, 10, 11];
                        for (let i=0;i<this.game.keyCount;i++) {
                            graphics.drawTile(this.tiles, Math.floor(x + (i*32)),170,keys[i]);
                        }
                        graphics.drawText(Math.floor(graphics.width() - graphics.textWidth(message, this.font20White)) / 2, 160, message, this.font20White);
                    } else if (this.game.countDown > 0) {
                        const message = "Get the Egg!";
                        graphics.drawTile(this.tiles, Math.floor((graphics.width() / 2) - 16),148, 22);
                        graphics.drawTile(this.tiles, Math.floor((graphics.width() / 2) - 16),180, 38);
                        graphics.drawText(Math.floor(graphics.width() - graphics.textWidth(message, this.font20White)) / 2, 160, message, this.font20White);
                    } else {
                        const message = this.game.statusMessage;
                        graphics.drawText(Math.floor(graphics.width() - graphics.textWidth(message, this.font20White)) / 2, 160, message, this.font20White);
                    }
                    
                    if (this.game.countDown > 0) {
                        // TODO use sprite here
                        // graphics.fillCircle((Math.floor(graphics.width() - graphics.textWidth(this.game.countDown + "", 50)) / 2)+15, 265, 40, "rgba(255,50,50,0.8)");
                        graphics.drawText(Math.floor(graphics.width() - graphics.textWidth(this.game.countDown + "", this.font50White)) / 2, 280, this.game.countDown + "", this.font50White);
                    }
                } else if (Rune.gameTime() - this.game.startRace < 1000 && Rune.gameTime() - this.game.startRace > 0) {
                    graphics.fillRect(0, 130, graphics.width(), 100, "rgba(0,0,0,0.5)");
                    graphics.drawText(Math.floor(graphics.width() - graphics.textWidth("Find the Keys! First to the Egg!", this.font20White)) / 2, 160, "Find the Keys! First to the Egg!", this.font20White);
                    // TODO use a sprite
                    // graphics.fillCircle((Math.floor(graphics.width() - graphics.textWidth("GO!", 50)) / 2)+45, 255, 60, "rgba(50,255,50,0.8)");
                    graphics.drawText(Math.floor(graphics.width() - graphics.textWidth("GO!", this.font50White)) / 2, 270, "GO!", this.font50White);
                } else if (this.game.gameOver) {
                    graphics.fillRect(0, 130, graphics.width(), 100, "rgba(0,0,0,0.5)");
                    if (this.game.winner && this.players) {
                        const winnerName = this.players[this.game.winner].displayName ?? "";
                        graphics.drawText(Math.floor(graphics.width() - graphics.textWidth(winnerName, this.font50White)) / 2, 160, winnerName, this.font50White);
                        graphics.drawText(Math.floor(graphics.width() - graphics.textWidth("Found the Egg!", this.font20White)) / 2, 200, "Found the Egg!", this.font20White);
                    } else {
                        graphics.drawText(Math.floor(graphics.width() - graphics.textWidth("TIME OUT!", this.font50Red)) / 2, 200, "TIME OUT!", this.font50Red);
                    }
                }
                // draw the HUD for keys and health
                if (this.game && !this.game.atStart && !this.game.gameOver) {
                    const remaining = Math.max(0, this.game.endGameTime - Rune.gameTime());
                    const seconds = Math.floor(remaining / 1000) % 60;
                    const minutes = Math.floor(Math.floor(remaining / 1000) / 60);
                    let timeStr = minutes + ":";
                    if (seconds < 10) {
                        timeStr += "0";
                    }
                    timeStr += seconds;

                    graphics.drawText(Math.floor(graphics.width() - graphics.textWidth(timeStr, this.font20White)) / 2, 20, timeStr, this.font20White);

                    const myEntity = this.game.entities.find(e => e.id === this.playerId)
                    if (myEntity) {
                        // keys
                        let offset = 16;
                        if (myEntity.bronzeKey) {
                            graphics.drawTile(this.tiles, graphics.width() - offset, 34, 47);
                            offset += 16;
                        }
                        if (myEntity.silverKey) {
                            graphics.drawTile(this.tiles, graphics.width() - offset, 34, 31);
                            offset += 16;
                        }
                        if (myEntity.goldKey) {
                            graphics.drawTile(this.tiles, graphics.width() - offset, 34, 15);
                            offset += 16;
                        }

                        for (let i = 0; i < 3; i++) {
                            graphics.drawTile(this.tiles, graphics.width() - 32 - (i * 32), 0, i < myEntity.health ? 7 : 8);
                        }
                    }
                }
            } else {
                // render main menu 
                this.frame += 0.1;
                const frameIndex = Math.floor(this.frame) % RUN.count;

                let width = this.logo.width;
                let height = this.logo.height;

                if (width > graphics.width()) {
                    width = this.logo.width / 2;
                    height = this.logo.height / 2;
                }
                graphics.drawImage(this.logo, Math.floor((graphics.width() - width) / 2), 10, width, height);

                const selectedIndex = this.typeOptions.indexOf(this.selectedType);
                for (const type of this.typeOptions) {
                    const x = ((graphics.width() / 2) - 32) - (selectedIndex * 70) + (this.typeOptions.indexOf(type) * 70);
                    const y = 200;
                    let frameOffset = 0;

                    if (type !== this.selectedType) {
                        graphics.alpha(0.25);
                    } else {
                        frameOffset = frameIndex;
                    }
                    graphics.drawTile(this.tiles2x, x, y, type + frameOffset);
                    graphics.drawTile(this.tiles2x, x, y + 64, type + 16 + frameOffset);
                    graphics.alpha(1);
                }

                graphics.drawTile(this.tiles2x, 20, 250, 54);
                graphics.drawTile(this.tiles2x, graphics.width() - 64 - 20, 250, 70);


                graphics.drawTile(this.tiles2x, Math.floor(graphics.width() / 2) - 64 - 32, 350, 55);
                graphics.drawTile(this.tiles2x, Math.floor(graphics.width() / 2) - 32, 350, 56);
                graphics.drawTile(this.tiles2x, Math.floor(graphics.width() / 2) + 64 - 32, 350, 57);
                graphics.drawText(Math.floor((graphics.width() - graphics.textWidth("Play!", this.font20White)) / 2), 388, "Play!", this.font20White);

                const name = CHAR_NAMES[this.selectedType];
                graphics.drawText(Math.floor((graphics.width() - graphics.textWidth(name, this.font20White)) / 2), 230, name,this.font20White);
            }

            const versionString = "1.03";
            graphics.drawText(graphics.width() - graphics.textWidth(versionString, this.font10White) - 5, graphics.height() - 5, versionString, this.font10White);
        }

        // render game controls
        graphics.push();
        graphics.alpha(0.2);
        graphics.translate(0, graphics.height() - this.controlSize - this.controlVerticalPadding);

        // TODO use sprite
        // graphics.fillCircle(graphics.width() - (this.controlSize / 2) - this.controlHorizontalPadding, +this.controlSize / 2, this.controlSize / 2, "white");
        graphics.alpha(0.8);
        if (this.game) {
            const myEntity = this.game.entities.find(e => e.id === this.playerId);
            if (myEntity) {
                const offset = (this.controlSize - 32) / 2;
                if (myEntity.item === "speed") {
                    graphics.drawTile(this.tiles, graphics.width() - this.controlSize - this.controlHorizontalPadding + offset, offset, 28);
                }
                if (myEntity.item === "health") {
                    graphics.drawTile(this.tiles, graphics.width() - this.controlSize - this.controlHorizontalPadding + offset, offset, 27);
                }
            }
        }
        graphics.pop();
    }

}