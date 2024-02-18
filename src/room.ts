import { EntityType, createEntity } from "./entity";
import { GameState } from "./logic";

// Directions used while generating dungeons.
export enum Direction {
    NORTH = 1,
    SOUTH = 2,
    EAST = 3,
    WEST = 4
}

// The location of a spike trap relative
// to the room its in. x/y in tiles not pixels
export interface SpikeLocation {
    x: number;
    y: number;
}

// A room in our generated dungeon
export interface Room {
    // Unique ID for the room
    id: number;
    // The x position of the room in tiles (one tile = 32 pixels atm)
    x: number;
    // The y position of the room in tiles (one tile = 32 pixels atm)
    y: number;
    // The width of the room in tiles (one tile = 32 pixels atm)
    width: number;
    // The height of the room in tiles (one tile = 32 pixels atm)
    height: number;
    // Map from direction to room ID of connected room
    connections: Record<number, number>;
    // Map from direction to indicator of a door being present 
    doors: Record<number, boolean>;
    // The distance of this room from the start
    depth: number;
    // True if the room has been discovered by any player - note
    // discovery of the room by any player is visible on the 
    // mini-map 
    discovered: boolean;
    // True if an enemy was placed in the room
    enemy: boolean;
    // True if the room has spike traps in it
    spikes: boolean;
    // The location of the spike traps relative to the room if any
    spikeLocations: SpikeLocation[];
    // The item in the room if any
    item?: "silver" | "bronze" | "gold" | "egg" | "treasure" | "speed" | "health";
}

// Utility to get the opposite direction 
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

// The big function to generate a dungeon by placing rooms
// relative to existing rooms and checking for collisions
export function generateDungeon(state: GameState): void {
    // create a starting room, it's always in the same place but might 
    // not be the room that players actually start in. It's the start
    // of the dungeon generation.
    const startRoom: Room = { id: 1, x: 0, y: 0, width: 10, height: 10, connections: {}, doors: {}, depth: 0, discovered: false, spikes: false, spikeLocations: [], enemy: false };
    state.rooms.push(startRoom);

    // the number of rooms we're hoping to generate
    const targetCount = state.roomCount;
    let nextId = 2;

    const eggRoom = startRoom;
    let deepestRoom = startRoom;
    const areaSize = 40;
    let maxLoops = 1000;

    // while we have more rooms to generate and we haven't
    // got stuck (maxLoops)
    while (state.rooms.length < targetCount && maxLoops > 0) {
        maxLoops--;

        // pick a room to start from and check what directions are already linked 
        // (we can only go in any direction once from any given room)
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

        // pick a random valid direction and generate a room 
        // in the right location
        const direction = possibleDirections[Math.floor(Math.random() * possibleDirections.length)];
        const newRoom: Room = {
            id: nextId++, x: 0, y: 0, width: 6 + (Math.floor(Math.random() * 3) * 2), height: 6 + (Math.floor(Math.random() * 3) * 2),
            connections: {}, doors: {}, depth: fromRoom.depth + 1, discovered: false, spikes: false, spikeLocations: [], enemy: false
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

        // check for collisions of the new room with existing, if there
        // are any then skip it and pick a different location
        if (newRoom.x < -areaSize || newRoom.y < -areaSize || newRoom.x + newRoom.width > areaSize || newRoom.y + newRoom.height > areaSize) {
            continue;
        }
        if (state.rooms.find(r => roomIntersects(r, newRoom))) {
            continue;
        }

        // if its not colliding with another rooms space then add the
        // room to the dungeon, set up the connections so we know which 
        // rooms are linked
        state.rooms.push(newRoom);
        fromRoom.connections[direction] = newRoom.id;
        newRoom.connections[reverseDirection(direction)] = fromRoom.id;

        // if the room we've connected to is the room holding the egg
        // then place the door
        if (fromRoom === eggRoom) {
            fromRoom.doors[direction] = true;
            newRoom.doors[reverseDirection(direction)] = true;
        }

        // keep track of the deepest room - that is the room furthest
        // from our start room
        if (newRoom.depth > deepestRoom.depth) {
            deepestRoom = newRoom;
        }
    }


    // clear out the depth and regenerate it from the deepest room, thats
    // actually where we'll start the players
    state.rooms.forEach(r => r.depth = 10000);
    fillDepth(state.rooms, deepestRoom, 0);

    // place the keys as far away as possible to make the run fun.
    let targetDepth = 0;
    state.rooms.forEach(r => {
        if (r.depth > targetDepth) {
            targetDepth = r.depth;
        }
    });

    // place the egg
    eggRoom.item = "egg";

    // place the other unique items
    const toPlace: ((room: Room) => void)[] = [
        (room: Room) => { room.item = "silver" },
        (room: Room) => { room.item = "gold" },
        (room: Room) => { room.item = "treasure" },
        (room: Room) => { room.item = "treasure" },
        (room: Room) => { room.item = "treasure" },
    ];

    if (state.keyCount > 2) {
        toPlace.push((room: Room) => { room.item = "bronze" });
    }

    // try and place the unique items as far apart and from the start
    // as possible to make it a challenge
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

    let monsterIndex = 1;
    state.rooms.filter(r => r !== deepestRoom && !r.item).forEach(target => {
        if (Math.random() > 0.8) {
            // add a monster
            target.enemy = true;
            const monster = createEntity("monster" + (monsterIndex++), Math.floor(target.x + (target.width / 2)) * 32, Math.floor(target.y + (target.height / 2)) * 32, EntityType.MONSTER);
            monster.speed = 2;
            state.entities.push(monster);
        } else if (Math.random() > 0.5) {
            // add spike traps
            target.spikes = true;
            for (let n = 0; n < 5; n++) {
                target.spikeLocations.push({ x: 2 + Math.floor(Math.random() * (target.width - 4)), y: 2 + Math.floor(Math.random() * (target.height - 4)) });
            }   
        } else if (Math.random() > 0.45) {
            target.item = "health";
        } else if (Math.random() > 0.4) {
            target.item = "speed";

        }
    });

    state.startRoom = deepestRoom.id;
}

// Check if one room overlaps another - used to during generation
// to validate room placement
function roomIntersects(room1: Room, room2: Room): boolean {
    const r1 = { left: room1.x, right: room1.x + room1.width, top: room1.y, bottom: room1.y + room1.height + 1 };
    const r2 = { left: room2.x, right: room2.x + room2.width, top: room2.y, bottom: room2.y + room2.height + 1 };

    return !(r2.left > r1.right ||
        r2.right < r1.left ||
        r2.top > r1.bottom ||
        r2.bottom < r1.top);
}

// Quick flood fill to generate the depth
// of rooms - this lets us know how far 
// rooms are from the start and hence
// where to place items
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

// Find all the rooms at the specified pixel location
export function findAllRoomsAt(state: GameState, x: number, y: number): Room[] {
    let rooms = state.roomsMap[x + (y * 10000)];
    if (!rooms) {
        rooms = state.roomsMap[x+(y*10000)] = state.rooms.filter(r => inRoomSpace(r, x, y)).map(r => state.rooms.indexOf(r));
    }
    return rooms.map(i => state.rooms[i]);
}

// Find any room at the specified pixel location
export function findRoomAt(state: GameState, x: number, y: number): Room | undefined {
    let roomIndex = state.roomMap[x + (y * 10000)];
    if (!roomIndex) {
        const targetRoom = state.rooms.find(r => inRoomSpace(r, x, y));
        roomIndex = state.roomMap[x+(y*10000)] = targetRoom ? state.rooms.indexOf(targetRoom) : -1;
    }

    return state.rooms[roomIndex];
}

// Check if the location given is close to the centre of the room
// this is used for picking up items
export function closeToCenter(room: Room, x: number, y: number) {
    const cx = ((room.x + (room.width / 2)) * 32);
    const cy = ((room.y + (room.height / 2)) * 32);
    const dx = Math.abs(cx - x);
    const dy = Math.abs(cy - y);

    return (dx < 32 && dy < 32);
}

// Broad check to see if the location given in pixels is in the 
// area occupied by the specified room
export function inRoomSpace(room: Room, x: number, y: number) {
    // convert to tile space
    x = Math.floor(x / 32);
    y = Math.floor(y / 32);

    return (x >= room.x - 1) && (x < room.x + room.width + 1) && (y >= room.y - 1) && (y < room.y + room.height + 1);
}

// Check if a specified location given in pixels is blocked for
// movement purposes. If an entity reaches a location that is blocked
// its movement will be reversed
export function blockedLocationInRoom(atStart: boolean, room: Room, x: number, y: number, hasAllKeys: boolean) {
    // convert to tile space
    x = x / 32;
    y = y / 32;

    // if we're in the main part of the room, then we're not blocked
    if (x >= room.x + 0.5 && y >= room.y + 1.1 && x < room.x + room.width - 0.4 && y < room.y + room.height - 0.2) {
        return false;
    }

    // if we're waiting at the start of the game, everything but the main part of the room
    // is blocked to stop people getting a head start :)
    if (atStart) {
        return true;
    }

    const halfX = room.x + Math.floor(room.width / 2) - 1;
    const halfY = room.y + Math.floor(room.height / 2) - 1;

    // check each of door way locations. We can stand in the middle of the room in 
    // any doorway assuming theres no door there
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