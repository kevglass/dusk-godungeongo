import { GameEventType, GameState, GameUpdate } from "./logic";
import { InputEventListener, TileSet, drawImage, drawRect, drawText, drawTile, fillCircle, fillRect, halfCircle, loadImage, loadTileSet, popState, pushState, registerInputEventListener, scale, screenHeight, screenWidth, setAlpha, stringWidth, translate, updateGraphics } from "./renderer/graphics";
import gfxTilesUrl from "./assets/tileset.png";
import gfxTiles2xUrl from "./assets/tileset2x.png";
import gfxDpad from "./assets/dpad.png";
import gfxButton from "./assets/button.png";
import gfxLogo from "./assets/logo.png";
import sfxCountdown from "./assets/countdown.mp3";
import sfxCollect from "./assets/collect.mp3";
import sfxKey from "./assets/key.mp3";
import sfxWin from "./assets/win.mp3";
import sfxFail from "./assets/fail.mp3";

import { Entity, EntityType, RUN } from "./entity";
import { intersects } from "./renderer/util";
import { Direction, Room, findAllRoomsAt, findRoomAt, inRoomSpace } from "./room";
import { InterpolatorLatency, Players } from "rune-games-sdk";
import { Sound, loadSound, playSound } from "./renderer/sound";

const PUFF_TIME = 250;
const PUFF_COLORS = [
    "rgba(255,255,255,0.5)",
    "rgba(230,230,230,0.5)",
    "rgba(200,200,200,0.5)",
    "rgba(180,180,180,0.5)"
];
const SPEED_PUFF_COLORS = [
    "rgba(100,100,255,0.7)",
    "rgba(100,100,230,0.7)",
    "rgba(100,100,200,0.7)",
    "rgba(100,100,180,0.7)"
];

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

interface Puff {
    x: number;
    y: number;
    dieAt: number;
    size: number;
    offset: number;
    col: string;
    speedCol: string;
}

export class EntitySprite {
    frame = 0;
    interpolator: InterpolatorLatency<number[]>
    lastFrames: Puff[] = [];
    lastX = -1;
    lastY = -1;

    constructor() {
        this.interpolator = Rune.interpolatorLatency({ maxSpeed: 15 })
    }

    update(x: number, y: number) {
        if (this.lastX !== x || this.lastY !== y) {
            this.lastFrames.push({
                x: (x + this.lastX) / 2, y: (y + this.lastY) / 2, dieAt: Rune.gameTime() + PUFF_TIME,
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
        this.lastX = x;
        this.lastY = y;
    }
}

export class LocalRoom {
    discovered = false;
    fade = 0;
}

interface CollectEffect {
    x: number;
    y: number;
    tile: number;
    life: number;
}

export class GoDungeonGo implements InputEventListener {
    tiles2x: TileSet;
    tiles: TileSet;
    dpad: TileSet;
    button: TileSet;

    game?: GameState;
    joined = false;
    controlSize = 0;
    controlHorizontalPadding = 0;
    controlVerticalPadding = 0;
    playerId?: string;

    viewX = 0;
    viewY = 0;

    touchInDpad = -1;

    left = false;
    right = false;
    down = false;
    up = false;

    entitySprites: Record<string, EntitySprite> = {};
    localRooms: Record<number, LocalRoom> = {};

    players?: Players;
    avatarImages: Record<string, HTMLImageElement> = {}
    logo: HTMLImageElement;

    dpadCenterY: number = -1;
    dpadCenterX: number = -1;
    selectedType: EntityType = EntityType.PINK_KNIGHT;
    typeOptions: EntityType[] = [EntityType.FEMALE_ELF, EntityType.PINK_KNIGHT, EntityType.MALE_ELF, EntityType.FEMALE_MAGE, EntityType.MALE_MAGE, EntityType.DINO1, EntityType.ORANGE_KNIGHT, EntityType.DINO2, EntityType.FACE_GUY, EntityType.ORC, EntityType.ORC_CHIEF, EntityType.SKELLY];

    frame: number = 0;
    effects: CollectEffect[] = [];

    sfxKey: Sound;
    sfxCollect: Sound;
    sfxCountdown: Sound;
    sfxWin: Sound;
    sfxFail: Sound;

    constructor() {
        this.tiles = loadTileSet(gfxTilesUrl, 32, 32);
        this.tiles2x = loadTileSet(gfxTiles2xUrl, 64, 64);
        this.dpad = loadTileSet(gfxDpad, 80, 80);
        this.button = loadTileSet(gfxButton, 80, 80);
        this.logo = loadImage(gfxLogo);
        this.sfxKey = loadSound(sfxKey);
        this.sfxCollect = loadSound(sfxCollect);
        this.sfxCountdown = loadSound(sfxCountdown);
        this.sfxWin = loadSound(sfxWin);
        this.sfxFail = loadSound(sfxFail);
        
        this.selectedType = this.typeOptions[Math.floor(Math.random() * this.typeOptions.length)];
    }

    start(): void {
        // register ourselves as the input listener so
        // we get nofified of mouse presses
        registerInputEventListener(this);

        Rune.initClient({
            onChange: (update) => {
                this.gameUpdate(update);
            },
        });

        requestAnimationFrame(() => { this.loop() });
    }

    gameUpdate(update: GameUpdate) {
        for (const event of update.game.events) {
            if (event.type === GameEventType.RESTART) {
                this.entitySprites = {};
                this.localRooms = {};
                this.effects = [];
            }
            if (event.type === GameEventType.WIN) {
                playSound(this.sfxWin);
            }
            if (event.type === GameEventType.TIME_OUT) {
                playSound(this.sfxFail);
            }
            if (event.type === GameEventType.START_COUNTDOWN) {
                setTimeout(() => {
                    playSound(this.sfxCountdown);
                }, 1000);
            }
            if (event.type === GameEventType.GOT_HEALTH) {
                if (event.x && event.y) {
                    this.effects.push({ x: event.x * 32, y: event.y * 32, life: 30, tile: 27 })
                }
                if (event.who === this.playerId) {
                    playSound(this.sfxCollect);
                }
            }
            if (event.type === GameEventType.GOT_SPEED) {
                if (event.x && event.y) {
                    this.effects.push({ x: event.x * 32, y: event.y * 32, life: 30, tile: 28 })
                }
                if (event.who === this.playerId) {
                    playSound(this.sfxCollect);
                }
            }
            if (event.type === GameEventType.GOT_TREASURE) {
                if (event.x && event.y) {
                    this.effects.push({ x: event.x * 32, y: event.y * 32, life: 30, tile: 6 })
                }
                if (event.who === this.playerId) {
                    playSound(this.sfxCollect);
                }
            }
            if (event.type === GameEventType.GOT_BRONZE) {
                if (event.x && event.y) {
                    this.effects.push({ x: event.x * 32, y: event.y * 32, life: 30, tile: 11 })
                }
                if (event.who === this.playerId) {
                    playSound(this.sfxKey);
                }
            }
            if (event.type === GameEventType.GOT_SILVER) {
                if (event.x && event.y) {
                    this.effects.push({ x: event.x * 32, y: event.y * 32, life: 30, tile: 10 })
                }
                if (event.who === this.playerId) {
                    playSound(this.sfxKey);
                }
            }
            if (event.type === GameEventType.GOT_GOLD) {
                if (event.x && event.y) {
                    this.effects.push({ x: event.x * 32, y: event.y * 32, life: 30, tile: 9 })
                }
                if (event.who === this.playerId) {
                    playSound(this.sfxKey);
                }
            }
        }

        // update any particle effects
        for (const p of [...this.effects]) {
            p.life -= 1;
            if (p.life < 0) {
                this.effects.splice(this.effects.indexOf(p), 1);
            }
        }

        // do nothing
        this.game = update.game;
        this.playerId = update.yourPlayerId;
        this.players = update.players;

        for (const playerId in update.players) {
            if (!this.avatarImages[playerId]) {
                this.avatarImages[playerId] = loadImage(update.players[playerId].avatarUrl);
            }
        }

        for (const entity of this.game.entities) {
            let sprite = this.entitySprites[entity.id];
            if (!sprite) {
                sprite = this.entitySprites[entity.id] = new EntitySprite();
            }

            // if its our entity don't interpolate, we know we're already right
            const futureEntity = entity.id === update.yourPlayerId ? entity : update.futureGame?.entities.find(e => e.id === entity.id);

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

        for (const room of this.game.rooms) {
            let local = this.localRooms[room.id];
            if (!local) {
                local = this.localRooms[room.id] = new LocalRoom();
            }
        }
    }

    processDPad(x: number, y: number) {
        if (this.game) {
            const dx = x - this.dpadCenterX;
            const dy = y - this.dpadCenterY;

            let left = false;
            let right = false;
            let down = false;
            let up = false;

            if (Math.abs(dx) > this.controlSize / 6) {
                // dx is big enough to be relevant
                left = dx < 0;
                right = dx > 0;
            } else {
                left = false;
                right = false;
            }

            if (Math.abs(dy) > this.controlSize / 6) {
                // dx is big enough to be relevant
                up = dy < 0;
                down = dy > 0;
            } else {
                up = false;
                down = false;
            }

            const myEntity = this.game.entities.find(e => e.id === this.playerId);
            if (myEntity &&
                ((myEntity.controls.left !== left) || (myEntity.controls.right !== right) ||
                    (myEntity.controls.up !== up) || (myEntity.controls.down !== down))) {
                Rune.actions.applyControls({ left, right, up, down });
            }
        }
    }

    mouseDown(x: number, y: number, index: number): void {
        if (this.joined) {
            const controlsY = screenHeight() - this.controlSize - this.controlVerticalPadding;

            if (x < screenWidth() / 2 && y > screenHeight() / 2) {
                // pressed in the DPAD, if we don't already have a finger down there
                // then we do now
                this.touchInDpad = index;
                this.dpadCenterX = x;
                this.dpadCenterY = y;
                this.processDPad(x, y);
            }

            if (intersects(x, y, screenWidth() - this.controlSize - this.controlHorizontalPadding, controlsY, this.controlSize, this.controlSize)) {
                Rune.actions.useItem();
            }
        }
    }

    mouseDrag(x: number, y: number, index: number): void {
        if (this.joined) {
            if (index === this.touchInDpad) {
                this.processDPad(x, y);
            }
        }
    }

    mouseUp(x: number, y: number, index: number): void {
        // do nothing
        if (!this.joined) {
            if (x < 84) {
                // left press
                let index = this.typeOptions.indexOf(this.selectedType);
                if (index > 0) {
                    index--;
                }

                this.selectedType = this.typeOptions[index];
            } else if (x > screenWidth() - 84) {
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
        } else {
            if (index === this.touchInDpad) {
                this.touchInDpad = -1;
                if (this.game) {
                    const myEntity = this.game.entities.find(e => e.id === this.playerId)
                    if (myEntity) {
                        Rune.actions.applyControls({ left: false, right: false, up: false, down: false });
                    }
                }
            }
        }
    }

    keyDown(key: string): void {
        if (this.game) {
            const myEntity = this.game.entities.find(e => e.id === this.playerId);
            if (myEntity) {
                if (key === "ArrowLeft") {
                    this.left = true;
                }
                if (key === "ArrowRight") {
                    this.right = true;
                }
                if (key === "ArrowUp") {
                    this.up = true;
                }
                if (key === "ArrowDown") {
                    this.down = true;
                }
                if (((myEntity.controls.left !== this.left) || (myEntity.controls.right !== this.right) ||
                    (myEntity.controls.up !== this.up) || (myEntity.controls.down !== this.down))) {
                    Rune.actions.applyControls({ left: this.left, right: this.right, up: this.up, down: this.down });
                }
                if (key === " ") {
                    Rune.actions.useItem();
                }
            }
        }
    }

    keyUp(key: string): void {
        if (this.game) {
            const myEntity = this.game.entities.find(e => e.id === this.playerId);
            if (myEntity) {
                if (key === "ArrowLeft") {
                    this.left = false;
                }
                if (key === "ArrowRight") {
                    this.right = false;
                }
                if (key === "ArrowUp") {
                    this.up = false;
                }
                if (key === "ArrowDown") {
                    this.down = false;
                }
                if (((myEntity.controls.left !== this.left) || (myEntity.controls.right !== this.right) ||
                    (myEntity.controls.up !== this.up) || (myEntity.controls.down !== this.down))) {
                    Rune.actions.applyControls({ left: this.left, right: this.right, up: this.up, down: this.down });
                }
            }
        }
    }

    drawRoom(room: Room): void {
        let myEntity: Entity | undefined;

        if (this.game) {
            myEntity = this.game.entities.find(e => e.id === this.playerId)
        }

        pushState();
        translate(room.x * 32, room.y * 32);
        for (let x = 0; x < room.width; x++) {
            for (let y = 0; y < room.height; y++) {
                drawTile(this.tiles, x * 32, y * 32, 64);
            }
        }

        for (let x = 1; x < room.width - 1; x++) {
            drawTile(this.tiles, x * 32, -32, 0);
            drawTile(this.tiles, x * 32, 0, 16);
            drawTile(this.tiles, x * 32, (room.height * 32) - 32, 0);
            drawTile(this.tiles, x * 32, (room.height * 32), 16);
        }

        for (let y = 1; y < room.height - 1; y++) {
            drawTile(this.tiles, 0, y * 32, 129);
            drawTile(this.tiles, (room.width * 32) - 32, y * 32, 128);
        }

        // corners
        drawTile(this.tiles, 0, -32, 114);
        drawTile(this.tiles, 0, 0, 130);
        drawTile(this.tiles, (room.width * 32) - 32, -32, 115);
        drawTile(this.tiles, (room.width * 32) - 32, 0, 131);
        drawTile(this.tiles, 0, (room.height * 32) - 32, 146);
        drawTile(this.tiles, 0, (room.height * 32), 162);
        drawTile(this.tiles, (room.width * 32) - 32, (room.height * 32) - 32, 147);
        drawTile(this.tiles, (room.width * 32) - 32, (room.height * 32), 163);

        const halfX = Math.floor(room.width / 2) - 1;
        const halfY = Math.floor(room.height / 2) - 1;

        const hasAllKeys = myEntity?.bronzeKey && myEntity?.goldKey && myEntity?.silverKey

        // north door
        if (room.connections[Direction.NORTH]) {
            drawTile(this.tiles, halfX * 32, 0, 64);
            drawTile(this.tiles, (halfX + 1) * 32, 0, 64);
            drawTile(this.tiles, halfX * 32, -32, 64);
            drawTile(this.tiles, (halfX + 1) * 32, -32, 64);
            drawTile(this.tiles, (halfX - 1) * 32, -32, 128);
            drawTile(this.tiles, (halfX + 2) * 32, -32, 129);

            if (this.game?.atStart) {
                drawTile(this.tiles, halfX * 32, -32, 45);
                drawTile(this.tiles, (halfX + 1) * 32, -32, 45);
            }
            if (room.doors[Direction.NORTH]) {
                if (hasAllKeys) {
                    setAlpha(0.5);
                }
                drawTile(this.tiles, halfX * 32, -32, 12);
                drawTile(this.tiles, (halfX + 1) * 32, -32, 13);
                setAlpha(1);
            }
        }
        // south door
        if (room.connections[Direction.SOUTH]) {
            drawTile(this.tiles, halfX * 32, (room.height * 32) - 32, 64);
            drawTile(this.tiles, (halfX + 1) * 32, (room.height * 32) - 32, 64);
            drawTile(this.tiles, halfX * 32, (room.height * 32), 64);
            drawTile(this.tiles, (halfX + 1) * 32, (room.height * 32), 64);
            drawTile(this.tiles, (halfX - 1) * 32, (room.height * 32), 128);
            drawTile(this.tiles, (halfX + 2) * 32, (room.height * 32), 129);

            if (this.game?.atStart) {
                drawTile(this.tiles, halfX * 32, (room.height * 32), 45);
                drawTile(this.tiles, (halfX + 1) * 32, (room.height * 32), 45);
            }
            if (room.doors[Direction.SOUTH]) {
                if (hasAllKeys) {
                    setAlpha(0.5);
                }
                drawTile(this.tiles, halfX * 32, (room.height * 32) + 32, 12);
                drawTile(this.tiles, (halfX + 1) * 32, (room.height * 32) + 32, 13);
                setAlpha(1);
            }
        }
        // west door
        if (room.connections[Direction.WEST]) {
            drawTile(this.tiles, 0, (halfY * 32), 64);
            drawTile(this.tiles, 0, (halfY * 32) + 32, 64);
            drawTile(this.tiles, -32, (halfY * 32), 64);
            drawTile(this.tiles, -32, (halfY * 32) + 32, 64);
            drawTile(this.tiles, -32, (halfY * 32) - 32, 16);
            drawTile(this.tiles, 0, (halfY * 32) - 32, 145);
            drawTile(this.tiles, -32, (halfY * 32) - 64, 0);
            drawTile(this.tiles, -32, (halfY * 32) + 38, 0);
            drawTile(this.tiles, -32, (halfY * 32) + 70, 16);

            if (this.game?.atStart) {
                drawTile(this.tiles, -32, (halfY * 32) - 31, 61);
                drawTile(this.tiles, -32, (halfY * 32) + 1, 61);
                drawTile(this.tiles, -32, (halfY * 32) + 33, 61);
            }
            if (room.doors[Direction.WEST]) {
                if (hasAllKeys) {
                    setAlpha(0.5);
                }
                drawTile(this.tiles, -48, (halfY * 32) - 31, 14);
                drawTile(this.tiles, -48, (halfY * 32) + 1, 30);
                drawTile(this.tiles, -48, (halfY * 32) + 33, 46);
                setAlpha(1);
            }
        }
        // east door
        if (room.connections[Direction.EAST]) {
            drawTile(this.tiles, room.width * 32, (halfY * 32), 64);
            drawTile(this.tiles, room.width * 32, (halfY * 32) + 32, 64);
            drawTile(this.tiles, room.width * 32 - 32, (halfY * 32), 64);
            drawTile(this.tiles, room.width * 32 - 32, (halfY * 32) + 32, 64);

            drawTile(this.tiles, room.width * 32, (halfY * 32) - 32, 16);
            drawTile(this.tiles, (room.width * 32) - 32, (halfY * 32) - 32, 144);
            drawTile(this.tiles, room.width * 32, (halfY * 32) - 64, 0);

            drawTile(this.tiles, room.width * 32, (halfY * 32) + 38, 0);
            drawTile(this.tiles, room.width * 32, (halfY * 32) + 70, 16);

            if (this.game?.atStart) {
                drawTile(this.tiles, (room.width * 32), (halfY * 32) - 31, 61);
                drawTile(this.tiles, (room.width * 32), (halfY * 32) + 1, 61);
                drawTile(this.tiles, (room.width * 32), (halfY * 32) + 33, 61);
            }

            if (room.doors[Direction.EAST]) {
                if (hasAllKeys) {
                    setAlpha(0.5);
                }
                drawTile(this.tiles, (room.width * 32) + 16, (halfY * 32) - 31, 14);
                drawTile(this.tiles, (room.width * 32) + 16, (halfY * 32) + 1, 30);
                drawTile(this.tiles, (room.width * 32) + 16, (halfY * 32) + 33, 46);
                setAlpha(1);
            }
        }

        if (room.item === "treasure") {
            drawTile(this.tiles, Math.floor((room.width - 1) * 16), Math.floor((room.height - 1) * 16), 6);
        }
        if (room.item === "speed") {
            drawTile(this.tiles, Math.floor((room.width - 1) * 16), Math.floor((room.height - 1) * 16), 28);
        }
        if (room.item === "health") {
            drawTile(this.tiles, Math.floor((room.width - 1) * 16), Math.floor((room.height - 1) * 16), 27);
        }
        if (room.item === "bronze" && !myEntity?.bronzeKey) {
            drawTile(this.tiles, Math.floor((room.width - 1) * 16), Math.floor((room.height - 1) * 16), 11);
        }
        if (room.item === "silver" && !myEntity?.silverKey) {
            drawTile(this.tiles, Math.floor((room.width - 1) * 16), Math.floor((room.height - 1) * 16), 10);
        }
        if (room.item === "gold" && !myEntity?.goldKey) {
            drawTile(this.tiles, Math.floor((room.width - 1) * 16), Math.floor((room.height - 1) * 16), 9);
        }
        if (room.item === "egg") {
            drawTile(this.tiles, Math.floor((room.width - 1) * 16), Math.floor((room.height - 1) * 16) - 32, 22);
            drawTile(this.tiles, Math.floor((room.width - 1) * 16), Math.floor((room.height - 1) * 16), 38);
        }

        // debug for room locations
        // if (this.game) {
        //     const myEntity = this.game.entities.find(e => e.id === this.playerId)
        //     if (myEntity) {
        //         if (inRoomSpace(room, myEntity.x, myEntity.y)) {
        //             fillRect(-32, -32, (room.width + 2) * 32, (room.height + 2) * 32, "rgba(255,0,0,0.5)");
        //         }
        //     }
        // }
        popState();
    }

    loop(): void {
        this.controlSize = screenWidth() / 5;
        this.controlHorizontalPadding = this.controlSize / 2
        this.controlVerticalPadding = this.controlSize * 0.7;

        // let the graphics do whatever it wants to do
        updateGraphics();

        if (this.dpadCenterX == -1) {
            this.dpadCenterX = this.controlHorizontalPadding + (this.controlSize / 2);
            this.dpadCenterY = screenHeight() - (this.controlSize / 2) - this.controlVerticalPadding;
        }

        if (this.game) {
            if (this.joined) {
                // simple player camera tracking
                const myEntity = this.game.entities.find(e => e.id === this.playerId)
                if (myEntity) {
                    this.viewX = myEntity.x - (screenWidth() / 2);
                    this.viewY = myEntity.y - (screenHeight() * 0.4);

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

                pushState();
                translate(-this.viewX, -this.viewY);

                for (const room of this.game.rooms) {
                    if (myEntity) {
                        const dx = Math.abs((room.x * 32) - myEntity.x)
                        const dy = Math.abs((room.y * 32) - myEntity.y);
                        if (dx > screenWidth() * 2 || dy > screenHeight() * 2) {
                            continue;
                        }
                    }

                    const localRoom = this.localRooms[room.id];
                    if (localRoom && localRoom.discovered) {
                        setAlpha(localRoom.fade);
                        this.drawRoom(room);
                        setAlpha(1);
                    }
                }
                const ysort = [...this.game.entities];
                ysort.sort((a, b) => a.y - b.y);

                for (const entity of ysort) {
                    const room = findRoomAt(this.game, entity.x, entity.y);
                    if (room) {
                        const localRoom = this.localRooms[room.id];
                        if (localRoom && localRoom.discovered) {
                            const sprite = this.entitySprites[entity.id];
                            sprite.update(sprite.interpolator.getPosition()[0], sprite.interpolator.getPosition()[1]);

                            sprite.frame += 0.1;
                            if (sprite.frame >= entity.anim.count) {
                                sprite.frame = 0;
                            }

                            pushState();
                            for (const puff of sprite.lastFrames) {
                                const remaining = puff.dieAt - Rune.gameTime();
                                if (remaining > PUFF_TIME * 0.9) {
                                    continue;
                                }
                                const scale = remaining / PUFF_TIME;
                                setAlpha(scale);
                                halfCircle(puff.x - puff.offset, puff.y - puff.offset, puff.size, entity.speed > 10 ? puff.speedCol : puff.col);
                                setAlpha(1);
                            }
                            translate(sprite.interpolator.getPosition()[0] - 16, sprite.interpolator.getPosition()[1] - 32);
                            if (this.players && this.players[entity.id]) {
                                const name = this.players[entity.id].displayName;
                                drawText(16 - Math.floor(stringWidth(name, 10) / 2), - 15, name, 10, "black");
                                drawText(16 - Math.floor(stringWidth(name, 10) / 2), - 16, name, 10, "white");
                            }
                            if (entity.faceLeft) {
                                scale(-1, 1);
                                translate(-32, 0);
                            }

                            drawTile(this.tiles, 0, -32, entity.type + Math.floor(entity.anim.base + sprite.frame));
                            drawTile(this.tiles, 0, 0, entity.type + 16 + Math.floor(entity.anim.base + sprite.frame));

                            popState();
                        }
                    }
                }

                for (const p of this.effects) {
                    pushState();
                    setAlpha(Math.min(1, p.life / 30));
                    translate(p.x, p.y);
                    scale(1 + (5 * (1 - Math.min(1, p.life / 30))), 1 + (5 * (1 - Math.min(1, p.life / 30))));
                    drawTile(this.tiles, -16, -16, p.tile);
                    popState();
                }

                popState();

                // render mini map
                if (this.game && !this.game.atStart && !this.game.gameOver) {
                    pushState();

                    const myEntity = this.game.entities.find(e => e.id === this.playerId)
                    if (myEntity) {
                        scale(1.5, 1.5);
                        fillRect(0, 0, 84, 84, "rgba(0,0,0,0.5)");
                        translate(42, 42);
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
                                fillRect(room.x, room.y, room.width, room.height, col);
                                if (room.connections[Direction.NORTH]) {
                                    fillRect(room.x + (room.width / 2) - 2, room.y - 2, 4, 2, room.doors[Direction.NORTH] ? "rgb(255,255,0)" : "rgb(200,200,200)");
                                }
                                if (room.connections[Direction.SOUTH]) {
                                    fillRect(room.x + (room.width / 2) - 2, room.y + room.height, 4, 2, room.doors[Direction.SOUTH] ? "rgb(255,255,0)" : "rgb(200,200,200)");
                                }
                                if (room.connections[Direction.WEST]) {
                                    fillRect(room.x - 2, room.y + (room.height / 2) - 2, 2, 4, room.doors[Direction.WEST] ? "rgb(255,255,0)" : "rgb(200,200,200)");
                                }
                                if (room.connections[Direction.EAST]) {
                                    fillRect(room.x + room.width, room.y + (room.height / 2) - 2, 2, 4, room.doors[Direction.EAST] ? "rgb(255,255,0)" : "rgb(200,200,200)");
                                }
                            }
                        }

                        for (const entity of this.game.entities.filter(e => e.type !== EntityType.MONSTER)) {
                            const room = findRoomAt(this.game, entity.x, entity.y);
                            if (room && room.discovered) {
                                const localRoom = this.localRooms[room.id];
                                if (localRoom) {
                                    fillCircle(Math.floor(entity.x / 32), Math.floor(entity.y / 32), 1.5, entity === myEntity ? "white" : "black");
                                }
                            }
                        }
                    }
                    popState();
                }

                // render game controls
                pushState();
                setAlpha(0.8);
                drawTile(this.dpad, this.dpadCenterX - (this.controlSize / 2), this.dpadCenterY - (this.controlSize / 2), 0, this.controlSize, this.controlSize);
                translate(0, screenHeight() - this.controlSize - this.controlVerticalPadding);

                drawTile(this.button, screenWidth() - this.controlSize - this.controlHorizontalPadding, 0, 0, this.controlSize, this.controlSize);
                if (this.game) {
                    const myEntity = this.game.entities.find(e => e.id === this.playerId);
                    if (myEntity) {
                        const offset = (this.controlSize - 32) / 2;
                        if (myEntity.item === "speed") {
                            drawTile(this.tiles, screenWidth() - this.controlSize - this.controlHorizontalPadding + offset, offset, 28);
                        }
                        if (myEntity.item === "health") {
                            drawTile(this.tiles, screenWidth() - this.controlSize - this.controlHorizontalPadding + offset, offset, 27);
                        }
                    }
                }
                popState();

                // render score board when at start
                if (this.game && this.players && (this.game.atStart || this.game.gameOver)) {
                    let item = 0;
                    const scores = [];

                    for (const playerId in this.game.scores) {
                        scores.push({ ...this.players[playerId], score: this.game.scores[playerId] });
                    }

                    scores.sort((a, b) => b.score - a.score);

                    for (const score of scores) {
                        fillRect(0, 1 + (item * 34), screenWidth(), 32, item % 2 === 0 ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.3)");
                        drawImage(this.avatarImages[score.playerId], 1, (item * 34) + 2, 30, 30);
                        drawText(40, 25 + (item * 34), score.displayName, 20, "white");
                        drawText(screenWidth() - stringWidth("" + score.score, 20) - 20, 25 + (item * 34), "" + score.score, 20, "white");
                        item++;
                    }
                }

                // draw the status message
                if (this.game.atStart) {
                    fillRect(0, 130, screenWidth(), 100, "rgba(0,0,0,0.5)");
                    drawText(Math.floor(screenWidth() - stringWidth(this.game.statusMessage, 20)) / 2, 160, this.game.statusMessage, 20, "white");
                    if (this.game.countDown > 0) {
                        drawText(Math.floor(screenWidth() - stringWidth(this.game.countDown + "", 50)) / 2, 220, this.game.countDown + "", 50, "white");
                    }
                } else if (Rune.gameTime() - this.game.startRace < 1000 && Rune.gameTime() - this.game.startRace > 0) {
                    fillRect(0, 130, screenWidth(), 100, "rgba(0,0,0,0.5)");
                    drawText(Math.floor(screenWidth() - stringWidth("Find the Keys! First to the Egg!", 20)) / 2, 160, "Find the Keys! First to the Egg!", 20, "#ee8e2e");
                    drawText(Math.floor(screenWidth() - stringWidth("GO!", 50)) / 2, 220, "GO!", 50, "#4ba747");
                } else if (this.game.gameOver) {
                    fillRect(0, 130, screenWidth(), 100, "rgba(0,0,0,0.5)");
                    if (this.game.winner && this.players) {
                        const winnerName = this.players[this.game.winner].displayName ?? "";
                        drawText(Math.floor(screenWidth() - stringWidth(winnerName, 20)) / 2, 160, winnerName, 20, "white");
                        drawText(Math.floor(screenWidth() - stringWidth("Found the Egg!", 20)) / 2, 200, "Found the Egg!", 20, "white");
                    } else {
                        drawText(Math.floor(screenWidth() - stringWidth("TIME OUT!", 50)) / 2, 200, "TIME OUT!", 50, "#da4e38");
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

                    drawText(Math.floor(screenWidth() - stringWidth(timeStr, 20)) / 2, 20, timeStr, 20, "white");

                    const myEntity = this.game.entities.find(e => e.id === this.playerId)
                    if (myEntity) {
                        // keys
                        let offset = 16;
                        if (myEntity.bronzeKey) {
                            drawTile(this.tiles, screenWidth() - offset, 34, 47);
                            offset += 16;
                        }
                        if (myEntity.silverKey) {
                            drawTile(this.tiles, screenWidth() - offset, 34, 31);
                            offset += 16;
                        }
                        if (myEntity.goldKey) {
                            drawTile(this.tiles, screenWidth() - offset, 34, 15);
                            offset += 16;
                        }

                        for (let i = 0; i < 3; i++) {
                            drawTile(this.tiles, screenWidth() - 32 - (i * 32), 0, i < myEntity.health ? 7 : 8);
                        }
                    }
                }
            } else {
                // render main menu 
                this.frame += 0.1;
                const frameIndex = Math.floor(this.frame) % RUN.count;

                let width = this.logo.width;
                let height = this.logo.height;

                if (width > screenWidth()) {
                    width = this.logo.width / 2;
                    height = this.logo.height / 2;
                }
                drawImage(this.logo, Math.floor((screenWidth() - width) / 2), 10, width, height);

                const selectedIndex = this.typeOptions.indexOf(this.selectedType);
                for (const type of this.typeOptions) {
                    const x = ((screenWidth() / 2) - 32) - (selectedIndex * 70) + (this.typeOptions.indexOf(type) * 70);
                    const y = 200;
                    let frameOffset = 0;

                    if (type !== this.selectedType) {
                        setAlpha(0.25);
                    } else {
                        frameOffset = frameIndex;
                    }
                    drawTile(this.tiles2x, x, y, type + frameOffset);
                    drawTile(this.tiles2x, x, y + 64, type + 16 + frameOffset);
                    setAlpha(1);
                }

                drawTile(this.tiles2x, 20, 250, 54);
                drawTile(this.tiles2x, screenWidth() - 64 - 20, 250, 70);


                drawTile(this.tiles2x, Math.floor(screenWidth() / 2) - 64 - 32, 350, 55);
                drawTile(this.tiles2x, Math.floor(screenWidth() / 2) - 32, 350, 56);
                drawTile(this.tiles2x, Math.floor(screenWidth() / 2) + 64 - 32, 350, 57);
                drawText(Math.floor((screenWidth() - stringWidth("Play!", 20)) / 2), 388, "Play!", 20, "white");

                const name = CHAR_NAMES[this.selectedType];
                drawText(Math.floor((screenWidth() - stringWidth(name, 20)) / 2), 230, name, 20, "white");
            }
        }

        requestAnimationFrame(() => { this.loop() });
    }
}