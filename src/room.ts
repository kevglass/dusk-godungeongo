import { GameState } from "./logic";

export enum Direction {
    NORTH = 1,
    SOUTH = 2,
    EAST = 3,
    WEST = 4
}

export interface Room {
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
    connections: Record<number, number>;
}

function reverseDirection(dir: Direction): Direction {
    switch (dir) {
        case Direction.WEST:
            return Direction.EAST;
        case Direction.EAST:
            return Direction.WEST;
        case Direction.SOUTH:
            return Direction.NORTH;
        case Direction.NORTH:
            return Direction.SOUTH;
    }
}

export function generateDungeon(state: GameState): void {
    const startRoom: Room = { id: 1, x: 45, y: 45, width: 10, height: 10, connections: {} };
    state.rooms.push(startRoom);

    const targetCount = 4;
    let nextId = 2;

    while (state.rooms.length < targetCount) {
        const fromRooms = state.rooms.filter(r => Object.values(r.connections).length < 4);
        const fromRoom = fromRooms[Math.floor(Math.random() * fromRooms.length)];
        const possibleDirections = [];
        if (!fromRoom.connections[Direction.NORTH]) {
            possibleDirections.push(Direction.NORTH);
        }
        if (!fromRoom.connections[Direction.SOUTH]) {
            possibleDirections.push(Direction.SOUTH);
        }
        if (!fromRoom.connections[Direction.WEST]) {
            possibleDirections.push(Direction.WEST);
        }
        if (!fromRoom.connections[Direction.EAST]) {
            possibleDirections.push(Direction.EAST);
        }

        const direction = possibleDirections[Math.floor(Math.random() * possibleDirections.length)];
        const newRoom: Room = { id: nextId++, x: 0, y: 0, width: 6 + (Math.floor(Math.random() * 3) * 2), height: 6 + (Math.floor(Math.random() * 3) * 2), connections: {} };
        if (direction === Direction.NORTH) {
            newRoom.y = fromRoom.y - 2 - newRoom.height;
            newRoom.x = fromRoom.x + Math.floor(fromRoom.width / 2) - Math.floor(newRoom.width / 2);
        }
        if (direction === Direction.SOUTH) {
            newRoom.y = fromRoom.y + fromRoom.height + 2;
            newRoom.x = fromRoom.x + Math.floor(fromRoom.width / 2) - Math.floor(newRoom.width / 2);
        }
        if (direction === Direction.WEST) {
            newRoom.x = fromRoom.x - 1 - newRoom.width;
            newRoom.y = fromRoom.y + Math.floor(fromRoom.height / 2) - Math.floor(newRoom.height / 2);
        }
        if (direction === Direction.EAST) {
            newRoom.x = fromRoom.x + fromRoom.width + 2;
            newRoom.y = fromRoom.y + Math.floor(fromRoom.height / 2) - Math.floor(newRoom.height / 2);
        }

        // check for collisions

        // if its not colliding with another rooms space
        state.rooms.push(newRoom);
        fromRoom.connections[direction] = newRoom.id;
        newRoom.connections[reverseDirection(direction)] = fromRoom.id;
    }
}

export function findRoomAt(state: GameState, x: number, y: number): Room | undefined {
    return state.rooms.find(r => inRoomSpace(r, x, y));
}

export function inRoomSpace(room: Room, x: number, y: number) {
    // convert to tile space
    x = Math.floor(x / 32);
    y = Math.floor(y / 32);

    return (x >= room.x - 1) && (x < room.x + room.width + 1) && (y >= room.y - 1) && (y < room.y + room.height + 1);
}

export function blockedLocationInRoom(room: Room, x: number, y: number) {
    // convert to tile space
    x = x / 32;
    y = y / 32;

    if (x >= room.x + 0.5 && y >= room.y + 1.1 && x < room.x + room.width - 0.4 && y < room.y + room.height - 0.2) {
        return false;
    }

    const halfX = room.x + Math.floor(room.width / 2) - 1;
    const halfY = room.y + Math.floor(room.height / 2) - 1;

    if (room.connections[Direction.NORTH]) {
        if (x >= halfX + 0.5 && x < halfX + 2 - 0.4 && y > room.y - 1 && y < room.y + 4) {
            return false;
        }
    }
    if (room.connections[Direction.SOUTH]) {
        if (x >= halfX + 0.5 && x < halfX + 2 - 0.4 && y < room.y + room.height + 1 && y > room.y + 4) {
            return false;
        }
    }
    if (room.connections[Direction.WEST]) {
        if (y >= halfY + 0.1 && y < halfY + 2 && x >= room.x - 1 && x < room.x + 4) {
            return false;
        }
    }
    if (room.connections[Direction.EAST]) {
        if (y >= halfY + 0.1 && y < halfY + 2 && x < room.x + room.width + 1 && x > room.x + 4) {
            return false;
        }
    }

    return true;
}