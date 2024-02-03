import { GameState } from "./logic";
import { blockedLocationInRoom, findRoomAt } from "./room";

export enum EntityType {
    MONSTER = 87,
    FEMALE_ELF = 87+(32*1),
    MALE_ELF = 87+(32*2),
    PINK_KNIGHT = 87+(32*3),
    ORANGE_KNIGHT = 87+(32*4),
    FEMALE_MAGE = 87+(32*5),
    MALE_MAGE = 87+(32*6),
    DINO1 = 87+(32*7),
    DINO2 = 87+(32*8),
    FACE_GUY = 87+(32*9),
    ORC = 87+(32*10),
    ORC_CHIEF = 87+(32*11),
    SKELLY = 87+(32*12)
}

export interface Animation {
    base: number;
    count: number;
}

export interface Controls {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
}

export const IDLE: Animation = { base: 0, count: 4 };
export const RUN: Animation = { base: 4, count: 4 };

export interface Entity {
    id: string;
    x: number;
    y: number;
    speed: number;
    speedTimeout: number;
    type: EntityType;
    faceLeft: boolean;
    anim: Animation;
    controls: Controls;
    goldKey: boolean;
    silverKey: boolean;
    bronzeKey: boolean;
    health: number;
    item?: "health" | "speed";
}

export function createEntity(id: string, x: number, y: number, type: EntityType): Entity {
    return {
        id, x, y, type, faceLeft: false, anim: IDLE,
        speed: 10,
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
    }
}

export function updateEntity(time: number, state: GameState, entity: Entity, step: number): void {
    if (time > entity.speedTimeout) {
        entity.speed = 10;
    }

    // diagonal movement is slower
    const controlsDown = Object.values(entity.controls).filter(m => m === true).length;
    if (controlsDown > 0) {
        const speed = (controlsDown > 1 ? entity.speed * 0.8 : entity.speed) * step;

        const oldX = entity.x;
        const oldY = entity.y;
        if (entity.controls.left) {
            entity.x -= speed;
        }
        if (entity.controls.right) {
            entity.x += speed;
        }
        let room = findRoomAt(state, entity.x, entity.y);
        if (!room || blockedLocationInRoom(state.atStart, room, entity.x, entity.y, entity.goldKey && entity.silverKey && entity.bronzeKey)) {
            entity.x = oldX;
        }

        if (entity.controls.up) {
            entity.y -= speed;
        }
        if (entity.controls.down) {
            entity.y += speed;
        }
        room = findRoomAt(state, entity.x, entity.y);
        if (!room || blockedLocationInRoom(state.atStart, room, entity.x, entity.y, entity.goldKey && entity.silverKey && entity.bronzeKey)) {
            entity.y = oldY;
        }
    }
}