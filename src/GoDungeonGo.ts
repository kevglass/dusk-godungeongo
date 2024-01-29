import { GameState, GameUpdate } from "./logic";
import { InputEventListener, TileSet, drawText, drawTile, fillRect, loadTileSet, popState, pushState, registerInputEventListener, scale, screenHeight, screenWidth, translate, updateGraphics } from "./renderer/graphics";
import gfxTilesUrl from "./assets/tileset.png";
import gfxDpad from "./assets/dpad.png";
import gfxButton from "./assets/button.png";
import { Entity, EntityType } from "./Entity";
import { intersects } from "./renderer/util";
import { Direction, Room, inRoomSpace } from "./room";
import { InterpolatorLatency } from "rune-games-sdk";

export class EntitySprite {
    frame = 0;
    interpolator: InterpolatorLatency<number[]>

    constructor() {
        this.interpolator = Rune.interpolatorLatency({ maxSpeed: 10 })
    }
}

export class GoDungeonGo implements InputEventListener {
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

    constructor() {
        this.tiles = loadTileSet(gfxTilesUrl, 32, 32);
        this.dpad = loadTileSet(gfxDpad, 80, 80);
        this.button = loadTileSet(gfxButton, 80, 80);
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
        // do nothing
        this.game = update.game;
        this.playerId = update.yourPlayerId;

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
    }

    processDPad(x: number, y: number) {
        if (this.game) {
            const dpadCenterY = screenHeight() - (this.controlSize / 2) - this.controlVerticalPadding;
            const dpadCenterX = this.controlHorizontalPadding + (this.controlSize / 2);
            const dx = x - dpadCenterX;
            const dy = y - dpadCenterY;

            let left = false;
            let right = false;
            let down = false;
            let up = false;

            if (Math.abs(dx) > this.controlSize / 4) {
                // dx is big enough to be relevant
                left = dx < 0;
                right = dx > 0;
            } else {
                left = false;
                right = false;
            }

            if (Math.abs(dy) > this.controlSize / 4) {
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

            if (intersects(x, y, this.controlHorizontalPadding, controlsY, this.controlSize, this.controlSize)) {
                // pressed in the DPAD, if we don't already have a finger down there
                // then we do now
                this.touchInDpad = index;
                this.processDPad(x, y);
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
            Rune.actions.join({ type: EntityType.KNIGHT });
            this.joined = true;
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

        // north door
        if (room.connections[Direction.NORTH]) {
            drawTile(this.tiles, halfX * 32, 0, 64);
            drawTile(this.tiles, (halfX + 1) * 32, 0, 64);
            drawTile(this.tiles, halfX * 32, -32, 64);
            drawTile(this.tiles, (halfX + 1) * 32, -32, 64);
            drawTile(this.tiles, (halfX - 1) * 32, -32, 128);
            drawTile(this.tiles, (halfX + 2) * 32, -32, 129);
        }
        // south door
        if (room.connections[Direction.SOUTH]) {
            drawTile(this.tiles, halfX * 32, (room.height * 32) - 32, 64);
            drawTile(this.tiles, (halfX + 1) * 32, (room.height * 32) - 32, 64);
            drawTile(this.tiles, halfX * 32, (room.height * 32), 64);
            drawTile(this.tiles, (halfX + 1) * 32, (room.height * 32), 64);
            drawTile(this.tiles, (halfX - 1) * 32, (room.height * 32), 128);
            drawTile(this.tiles, (halfX + 2) * 32, (room.height * 32), 129);
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

        drawText(0, 20, "Joined: " + this.joined, 20, "white");
        if (this.game) {
            if (this.joined) {
                // simple player camera tracking
                const myEntity = this.game.entities.find(e => e.id === this.playerId)
                if (myEntity) {
                    this.viewX = myEntity.x - (screenWidth() / 2);
                    this.viewY = myEntity.y - (screenHeight() * 0.4);
                }

                pushState();
                translate(-this.viewX, -this.viewY);

                for (const room of this.game.rooms) {
                    this.drawRoom(room);
                }
                for (const entity of this.game.entities) {
                    const sprite = this.entitySprites[entity.id];

                    sprite.frame += 0.1;
                    if (sprite.frame >= entity.anim.count) {
                        sprite.frame = 0;
                    }

                    pushState();
                    translate(sprite.interpolator.getPosition()[0] - 16, sprite.interpolator.getPosition()[1] - 32);
                    if (entity.faceLeft) {
                        scale(-1, 1);
                        translate(-32, 0);
                    }

                    drawTile(this.tiles, 0, -32, entity.type + Math.floor(entity.anim.base + sprite.frame));
                    drawTile(this.tiles, 0, 0, entity.type + 16 + Math.floor(entity.anim.base + sprite.frame));

                    popState();
                }

                popState();


                // render game controls
                pushState();
                translate(0, screenHeight() - this.controlSize - this.controlVerticalPadding);
                drawTile(this.dpad, this.controlHorizontalPadding, 0, 0, this.controlSize, this.controlSize);
                drawTile(this.button, screenWidth() - this.controlSize - this.controlHorizontalPadding, 0, 0, this.controlSize, this.controlSize);
                popState();
            }
        }

        requestAnimationFrame(() => { this.loop() });
    }
}