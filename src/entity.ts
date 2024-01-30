import { GameState } from "./logic";
import { blockedLocationInRoom, findRoomAt } from "./room";

export enum EntityType {
    ELF = 151,
    KNIGHT = 183,
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

export function updateEntity(state: GameState, entity: Entity, step: number): void {
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
        if (!room || blockedLocationInRoom(room, entity.x, entity.y, entity.goldKey && entity.silverKey && entity.bronzeKey)) {
            entity.x = oldX;
        }

        if (entity.controls.up) {
            entity.y -= speed;
        }
        if (entity.controls.down) {
            entity.y += speed;
        }
        room = findRoomAt(state, entity.x, entity.y);
        if (!room || blockedLocationInRoom(room, entity.x, entity.y, entity.goldKey && entity.silverKey && entity.bronzeKey)) {
            entity.y = oldY;
        }
    }
}