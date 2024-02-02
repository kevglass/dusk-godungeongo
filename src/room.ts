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
    doors: Record<number, boolean>;
    depth: number;
    discovered: boolean;
    item?: "silver" | "bronze" | "gold" | "egg" | "treasure" | "speed" | "health";
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
    const startRoom: Room = { id: 1, x: 0, y: 0, width: 10, height: 10, connections: {}, doors: {}, depth: 0, discovered: false };
    state.rooms.push(startRoom);

    const targetCount = 50;
    let nextId = 2;

    const eggRoom = startRoom;
    let deepestRoom = startRoom;
    const areaSize = 40;
    let maxLoops = 1000;

    while (state.rooms.length < targetCount && maxLoops > 0) {
        maxLoops--;

        const fromRooms = state.rooms.filter(r => r !== eggRoom || state.rooms.length === 1).filter(r => Object.values(r.connections).length < 4);
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
        const newRoom: Room = {
            id: nextId++, x: 0, y: 0, width: 6 + (Math.floor(Math.random() * 3) * 2), height: 6 + (Math.floor(Math.random() * 3) * 2),
            connections: {}, doors: {}, depth: fromRoom.depth + 1, discovered: false
        };
        if (direction === Direction.NORTH) {
            newRoom.y = fromRoom.y - 2 - newRoom.height;
            newRoom.x = fromRoom.x + Math.floor(fromRoom.width / 2) - Math.floor(newRoom.width / 2);
        }
        if (direction === Direction.SOUTH) {
            newRoom.y = fromRoom.y + fromRoom.height + 2;
            newRoom.x = fromRoom.x + Math.floor(fromRoom.width / 2) - Math.floor(newRoom.width / 2);
        }
        if (direction === Direction.WEST) {
            newRoom.x = fromRoom.x - 2 - newRoom.width;
            newRoom.y = fromRoom.y + Math.floor(fromRoom.height / 2) - Math.floor(newRoom.height / 2);
        }
        if (direction === Direction.EAST) {
            newRoom.x = fromRoom.x + fromRoom.width + 2;
            newRoom.y = fromRoom.y + Math.floor(fromRoom.height / 2) - Math.floor(newRoom.height / 2);
        }

        // check for collisions
        if (newRoom.x < -areaSize || newRoom.y < -areaSize || newRoom.x + newRoom.width > areaSize || newRoom.y + newRoom.height > areaSize) {
            continue;
        }
        if (state.rooms.find(r => roomIntersects(r, newRoom))) {
            continue;
        }

        // if its not colliding with another rooms space
        state.rooms.push(newRoom);
        fromRoom.connections[direction] = newRoom.id;
        newRoom.connections[reverseDirection(direction)] = fromRoom.id;

        if (fromRoom === eggRoom) {
            fromRoom.doors[direction] = true;
            newRoom.doors[reverseDirection(direction)] = true;
        }

        if (newRoom.depth > deepestRoom.depth) {
            deepestRoom = newRoom;
        }
    }


    // clear out the depth and regenerate it from the start room
    state.rooms.forEach(r => r.depth = 10000);
    fillDepth(state.rooms, deepestRoom, 0);

    // place the keys as far away as possible to make the run fun.
    let targetDepth = 0;
    state.rooms.forEach(r => {
        if (r.depth > targetDepth) {
            targetDepth = r.depth;
        }
    });

    eggRoom.item = "egg";
    const toPlace: ((room: Room) => void)[] = [
        (room: Room) => { room.item = "bronze" },
        (room: Room) => { room.item = "silver" },
        (room: Room) => { room.item = "gold" },
        (room: Room) => { room.item = "treasure" },
        (room: Room) => { room.item = "treasure" },
        (room: Room) => { room.item = "treasure" },
    ];

    while (targetDepth > 0 && toPlace.length > 0) {
        const bestRooms = state.rooms.filter(r => r !== deepestRoom && r !== eggRoom && r.depth > targetDepth - 6 && !r.item);
        if (bestRooms.length > 0) {
            if (toPlace.length > 0) {
                const index = Math.floor(Math.random() * bestRooms.length);
                const room = bestRooms[index];

                toPlace[0](room);
                toPlace.splice(0, 1);
                bestRooms.splice(index, 1);
                fillDepth(state.rooms, room, 0);
            }
        } else {
            targetDepth--;
        }
    }

    for (let i = 0; i < 3; i++) {
        const possible = state.rooms.filter(r => r !== deepestRoom && !r.item);
        const target = possible[Math.floor(Math.random() * possible.length)];
        target.item = "health";
    }

    for (let i = 0; i < 3; i++) {
        const possible = state.rooms.filter(r => r !== deepestRoom && !r.item);
        const target = possible[Math.floor(Math.random() * possible.length)];
        target.item = "speed";
    }

    state.startRoom = deepestRoom.id;
    console.log(state.rooms.length + " rooms generated");
}

function roomIntersects(room1: Room, room2: Room): boolean {
    const r1 = { left: room1.x, right: room1.x + room1.width, top: room1.y, bottom: room1.y + room1.height + 1 };
    const r2 = { left: room2.x, right: room2.x + room2.width, top: room2.y, bottom: room2.y + room2.height + 1 };

    return !(r2.left > r1.right ||
        r2.right < r1.left ||
        r2.top > r1.bottom ||
        r2.bottom < r1.top);
}

function fillDepth(rooms: Room[], room: Room, depth: number) {
    if (room.depth <= depth) {
        return;
    }
    room.depth = depth;
    const north = rooms.find(r => r.id === room.connections[Direction.NORTH]);
    const south = rooms.find(r => r.id === room.connections[Direction.SOUTH]);
    const west = rooms.find(r => r.id === room.connections[Direction.WEST]);
    const east = rooms.find(r => r.id === room.connections[Direction.EAST]);

    if (north) {
        fillDepth(rooms, north, depth + 1);
    }
    if (south) {
        fillDepth(rooms, south, depth + 1);
    }
    if (west) {
        fillDepth(rooms, west, depth + 1);
    }
    if (east) {
        fillDepth(rooms, east, depth + 1);
    }
}

export function findAllRoomsAt(state: GameState, x: number, y: number): Room[] {
    return state.rooms.filter(r => inRoomSpace(r, x, y));
}

export function findRoomAt(state: GameState, x: number, y: number): Room | undefined {
    return state.rooms.find(r => inRoomSpace(r, x, y));
}

export function closeToCenter(room: Room, x: number, y: number) {
    const cx = ((room.x + (room.width / 2)) * 32);
    const cy = ((room.y + (room.height / 2)) * 32);
    const dx = Math.abs(cx - x);
    const dy = Math.abs(cy - y);

    return (dx < 32 && dy < 32);
}

export function inRoomSpace(room: Room, x: number, y: number) {
    // convert to tile space
    x = Math.floor(x / 32);
    y = Math.floor(y / 32);

    return (x >= room.x - 1) && (x < room.x + room.width + 1) && (y >= room.y - 1) && (y < room.y + room.height + 1);
}

export function blockedLocationInRoom(atStart: boolean, room: Room, x: number, y: number, hasAllKeys: boolean) {
    // convert to tile space
    x = x / 32;
    y = y / 32;

    if (x >= room.x + 0.5 && y >= room.y + 1.1 && x < room.x + room.width - 0.4 && y < room.y + room.height - 0.2) {
        return false;
    }

    if (atStart) {
        return true;
    }

    const halfX = room.x + Math.floor(room.width / 2) - 1;
    const halfY = room.y + Math.floor(room.height / 2) - 1;

    if (room.connections[Direction.NORTH]) {
        const topOffset = !hasAllKeys && room.doors[Direction.NORTH] ? -0.5 : 1;

        if (x >= halfX + 0.5 && x < halfX + 2 - 0.4 && y > room.y - topOffset && y < room.y + 4) {
            return false;
        }
    }
    if (room.connections[Direction.SOUTH]) {
        const bottomOffset = !hasAllKeys && room.doors[Direction.SOUTH] ? 0.8 : 1
        if (x >= halfX + 0.5 && x < halfX + 2 - 0.4 && y < room.y + room.height + bottomOffset && y > room.y + 4) {
            return false;
        }
    }
    if (room.connections[Direction.WEST]) {
        const leftOffset = !hasAllKeys && room.doors[Direction.WEST] ? 0 : 1
        if (y >= halfY + 0.1 && y < halfY + 2 && x >= room.x - leftOffset && x < room.x + 4) {
            return false;
        }
    }
    if (room.connections[Direction.EAST]) {
        const rightOffset = !hasAllKeys && room.doors[Direction.EAST] ? 0 : 1
        if (y >= halfY + 0.1 && y < halfY + 2 && x < room.x + room.width + rightOffset && x > room.x + 4) {
            return false;
        }
    }

    return true;
}