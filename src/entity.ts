import { GameState } from "./logic";
import { blockedLocationInRoom, findRoomAt } from "./room";

// The default player speed
export const PLAYER_SPEED = 10;
// The speed the monsters in the dungeon move at
export const MONSTER_SPEED = 2;

// The list of types of entity (players and monsters) that can 
// appear in the world. The value is in the index for the first frame
// in the tileset
export enum EntityType {
    MONSTER = 87,
    FEMALE_ELF = 87 + (32 * 1),
    MALE_ELF = 87 + (32 * 2),
    PINK_KNIGHT = 87 + (32 * 3),
    ORANGE_KNIGHT = 87 + (32 * 4),
    FEMALE_MAGE = 87 + (32 * 5),
    MALE_MAGE = 87 + (32 * 6),
    DINO1 = 87 + (32 * 7),
    DINO2 = 87 + (32 * 8),
    FACE_GUY = 87 + (32 * 9),
    ORC = 87 + (32 * 10),
    ORC_CHIEF = 87 + (32 * 11),
    SKELLY = 87 + (32 * 12)
}

// Simple wrapper for animation from the tile set
export interface Animation {
    // The tile index to start the animation at
    base: number;
    // The number of frames to play to complete the animation
    count: number;
}

// The state of a player's controls for movement. This is
// the bit that set through an action to update the game
// state
export interface Controls {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
}

// Animation to play when not moving
export const IDLE: Animation = { base: 0, count: 4 };
// Animation to play when moving
export const RUN: Animation = { base: 4, count: 4 };

// An entity (player or monster) in the game world. 
export interface Entity {
    // The ID will either be the player ID that owns it or a unique ID for monsters
    id: string;
    // the position of the monster
    x: number;
    y: number;
    // the speed the entity should move at
    speed: number;
    // The game time at which this entities speed power up runs out
    speedTimeout: number;
    // The type of entity - special case type = MONSTER
    type: EntityType;
    // True if the entity is facing left
    faceLeft: boolean;
    // The animation this entity is currently playing
    anim: Animation;
    // The state of the controls for this entity if its controlled by a player
    controls: Controls;
    // True if the entity has found the gold key
    goldKey: boolean;
    // True if the entity has found the silver key
    silverKey: boolean;
    // True if the entity has found the bronze key
    bronzeKey: boolean;
    // The amount of health this entity has remaining, gets to zero and the player respawns
    health: number;
    // The item the entity is carrying if any
    item?: "health" | "speed";
    // The game time at which this player was last hurt - this lets us give them some grace
    // between being hit
    hurtAt: number;
}

// Create an entity and return it. Note that the entity created 
// has not been added to the game world
export function createEntity(id: string, x: number, y: number, type: EntityType): Entity {
    return {
        id, x, y, type, faceLeft: false, anim: IDLE,
        speed: PLAYER_SPEED,
        speedTimeout: 0,
        controls: {
            left: false,
            right: false,
            up: false,
            down: false
        },
        goldKey: false,
        silverKey: false,
        bronzeKey: false,
        health: 3,
        hurtAt: -10000
    }
}

// Update an entity, moving it through the game world. We allow a step so we can 
// move entity a bit of a frame and check their collision - it'd be nicer
// with a ray trace, but for right now it does the job
export function updateEntity(time: number, state: GameState, entity: Entity, step: number): void {
    // if the entity's speed power up has run out set them
    // back to the default speed
    if (time > entity.speedTimeout && entity.type !== EntityType.MONSTER) {
        entity.speed = PLAYER_SPEED;
    }

    // if the entity is a monster then we do some very basic behavior. If theres a player (opponent) near
    // by we move towards them, otherwise we move towards the centre of the room to reset the monster.
    // We don't do collision detection for the monsters because I made a bad decision early on about
    // how to detect collisions and having all the monsters collide as well is too slow for my 
    // liking. TODO: If you get time, go back and replace the findRoomAt() with a an array lookup
    // or something
    if (entity.type === EntityType.MONSTER) {
        const monsterSpeed = MONSTER_SPEED;
        const room = findRoomAt(state, entity.x, entity.y);
        // look for an entity in the same room that isn't a monster, a player to follow!
        const opponent = state.entities.filter(e => e.type !== EntityType.MONSTER).find(e => findRoomAt(state, e.x, e.y) === room);
        if (opponent) {
            const dx = opponent.x - entity.x;
            const dy = opponent.y - entity.y;
            const len = Math.sqrt((dx*dx)+(dy*dy));
            if (len !== 0) {
                entity.x += (dx / len) * monsterSpeed;
                entity.y += (dy / len) * monsterSpeed;
                if (dx < 0) {
                    entity.faceLeft = false;
                } else if (dx > 0) {
                    entity.faceLeft = true;
                }
            }
        } else {
            // otherwise use the centre of the room as a target
            if (room) {
                const dx = ((room.x + (room.width/2)) * 32) - entity.x;
                const dy = ((room.y + (room.height/2)) * 32) - entity.y;
                const len = Math.sqrt((dx*dx)+(dy*dy));
                if (len !== 0) {
                    entity.x += (dx / len) * monsterSpeed;
                    entity.y += (dy / len) * monsterSpeed;
                    if (dx < 0) {
                        entity.faceLeft = false;
                    } else if (dx > 0) {
                        entity.faceLeft = true;
                    }
                }
            } 
        }
    } else {
        // if its a player we need to apply the current state of the player controls (if
        // they're pressing any)
        const controlsDown = Object.values(entity.controls).filter(m => m === true).length;
        if (controlsDown > 0) {
            // diagonal movement needs to be scaled so that moving diagonally is not 
            // faster than straight 
            const speed = (controlsDown > 1 ? entity.speed * 0.8 : entity.speed) * step;

            // consider X axis movement, try it, check for collision, undo the change if 
            // we're hitting a wall 
            const oldX = entity.x;
            const oldY = entity.y;
            if (entity.controls.left) {
                entity.x -= speed;
            }
            if (entity.controls.right) {
                entity.x += speed;
            }
            let room = findRoomAt(state, entity.x, entity.y);
            if (!room || blockedLocationInRoom(state.atStart, room, entity.x, entity.y, entity.goldKey && entity.silverKey && (state.keyCount < 3 || entity.bronzeKey))) {
                entity.x = oldX;
            }

            // consider Y axis movement, try it, check for collision, undo the change if 
            // we're hitting a wall 
            if (entity.controls.up) {
                entity.y -= speed;
            }
            if (entity.controls.down) {
                entity.y += speed;
            }
            room = findRoomAt(state, entity.x, entity.y);
            if (!room || blockedLocationInRoom(state.atStart, room, entity.x, entity.y, entity.goldKey && entity.silverKey &&  (state.keyCount < 3 || entity.bronzeKey))) {
                entity.y = oldY;
            }
        }
    }
}