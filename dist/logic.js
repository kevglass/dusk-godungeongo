var Direction = /* @__PURE__ */ ((Direction2) => {
  Direction2[Direction2["NORTH"] = 1] = "NORTH";
  Direction2[Direction2["SOUTH"] = 2] = "SOUTH";
  Direction2[Direction2["EAST"] = 3] = "EAST";
  Direction2[Direction2["WEST"] = 4] = "WEST";
  return Direction2;
})(Direction || {});
function reverseDirection(dir) {
  switch (dir) {
    case 4:
      return 3;
    case 3:
      return 4;
    case 2:
      return 1;
    case 1:
      return 2;
  }
}
function generateDungeon(state) {
  const startRoom = { id: 1, x: 0, y: 0, width: 10, height: 10, connections: {}, doors: {}, depth: 0, discovered: false, spikes: false, spikeLocations: [] };
  state.rooms.push(startRoom);
  const targetCount = 50;
  let nextId = 2;
  const eggRoom = startRoom;
  let deepestRoom = startRoom;
  const areaSize = 40;
  let maxLoops = 1e3;
  while (state.rooms.length < targetCount && maxLoops > 0) {
    maxLoops--;
    const fromRooms = state.rooms.filter((r) => r !== eggRoom || state.rooms.length === 1).filter((r) => Object.values(r.connections).length < 4);
    const fromRoom = fromRooms[Math.floor(Math.random() * fromRooms.length)];
    const possibleDirections = [];
    if (!fromRoom.connections[
      1
      /* NORTH */
    ]) {
      possibleDirections.push(
        1
        /* NORTH */
      );
    }
    if (!fromRoom.connections[
      2
      /* SOUTH */
    ]) {
      possibleDirections.push(
        2
        /* SOUTH */
      );
    }
    if (!fromRoom.connections[
      4
      /* WEST */
    ]) {
      possibleDirections.push(
        4
        /* WEST */
      );
    }
    if (!fromRoom.connections[
      3
      /* EAST */
    ]) {
      possibleDirections.push(
        3
        /* EAST */
      );
    }
    const direction = possibleDirections[Math.floor(Math.random() * possibleDirections.length)];
    const newRoom = {
      id: nextId++,
      x: 0,
      y: 0,
      width: 6 + Math.floor(Math.random() * 3) * 2,
      height: 6 + Math.floor(Math.random() * 3) * 2,
      connections: {},
      doors: {},
      depth: fromRoom.depth + 1,
      discovered: false,
      spikes: false,
      spikeLocations: []
    };
    if (direction === 1) {
      newRoom.y = fromRoom.y - 2 - newRoom.height;
      newRoom.x = fromRoom.x + Math.floor(fromRoom.width / 2) - Math.floor(newRoom.width / 2);
    }
    if (direction === 2) {
      newRoom.y = fromRoom.y + fromRoom.height + 2;
      newRoom.x = fromRoom.x + Math.floor(fromRoom.width / 2) - Math.floor(newRoom.width / 2);
    }
    if (direction === 4) {
      newRoom.x = fromRoom.x - 2 - newRoom.width;
      newRoom.y = fromRoom.y + Math.floor(fromRoom.height / 2) - Math.floor(newRoom.height / 2);
    }
    if (direction === 3) {
      newRoom.x = fromRoom.x + fromRoom.width + 2;
      newRoom.y = fromRoom.y + Math.floor(fromRoom.height / 2) - Math.floor(newRoom.height / 2);
    }
    if (newRoom.x < -areaSize || newRoom.y < -areaSize || newRoom.x + newRoom.width > areaSize || newRoom.y + newRoom.height > areaSize) {
      continue;
    }
    if (state.rooms.find((r) => roomIntersects(r, newRoom))) {
      continue;
    }
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
  state.rooms.forEach((r) => r.depth = 1e4);
  fillDepth(state.rooms, deepestRoom, 0);
  let targetDepth = 0;
  state.rooms.forEach((r) => {
    if (r.depth > targetDepth) {
      targetDepth = r.depth;
    }
  });
  eggRoom.item = "egg";
  const toPlace = [
    (room) => {
      room.item = "bronze";
    },
    (room) => {
      room.item = "silver";
    },
    (room) => {
      room.item = "gold";
    },
    (room) => {
      room.item = "treasure";
    },
    (room) => {
      room.item = "treasure";
    },
    (room) => {
      room.item = "treasure";
    }
  ];
  while (targetDepth > 0 && toPlace.length > 0) {
    const bestRooms = state.rooms.filter((r) => r !== deepestRoom && r !== eggRoom && r.depth > targetDepth - 6 && !r.item);
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
    const possible = state.rooms.filter((r) => r !== deepestRoom && !r.item);
    const target = possible[Math.floor(Math.random() * possible.length)];
    target.item = "health";
  }
  for (let i = 0; i < 3; i++) {
    const possible = state.rooms.filter((r) => r !== deepestRoom && !r.item);
    const target = possible[Math.floor(Math.random() * possible.length)];
    target.item = "speed";
  }
  for (let i = 0; i < 7; i++) {
    const possible = state.rooms.filter((r) => r !== deepestRoom && !r.item && !r.spikes);
    if (possible.length > 0) {
      const target = possible[Math.floor(Math.random() * possible.length)];
      target.spikes = true;
      for (let n = 0; n < 5; n++) {
        target.spikeLocations.push({ x: 2 + Math.floor(Math.random() * (target.width - 4)), y: 2 + Math.floor(Math.random() * (target.height - 4)) });
      }
    }
  }
  for (let i = 0; i < 7; i++) {
    const possible = state.rooms.filter((r) => r !== deepestRoom && !r.item && !r.spikes);
    if (possible.length > 0) {
      const target = possible[Math.floor(Math.random() * possible.length)];
      const monster = createEntity("monster" + i, Math.floor(target.x + target.width / 2) * 32, Math.floor(target.y + target.height / 2) * 32, EntityType.MONSTER);
      monster.speed = 2;
      state.entities.push(monster);
    }
  }
  state.startRoom = deepestRoom.id;
}
function roomIntersects(room1, room2) {
  const r1 = { left: room1.x, right: room1.x + room1.width, top: room1.y, bottom: room1.y + room1.height + 1 };
  const r2 = { left: room2.x, right: room2.x + room2.width, top: room2.y, bottom: room2.y + room2.height + 1 };
  return !(r2.left > r1.right || r2.right < r1.left || r2.top > r1.bottom || r2.bottom < r1.top);
}
function fillDepth(rooms, room, depth) {
  if (room.depth <= depth) {
    return;
  }
  room.depth = depth;
  const north = rooms.find((r) => r.id === room.connections[
    1
    /* NORTH */
  ]);
  const south = rooms.find((r) => r.id === room.connections[
    2
    /* SOUTH */
  ]);
  const west = rooms.find((r) => r.id === room.connections[
    4
    /* WEST */
  ]);
  const east = rooms.find((r) => r.id === room.connections[
    3
    /* EAST */
  ]);
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
function findAllRoomsAt(state, x, y) {
  return state.rooms.filter((r) => inRoomSpace(r, x, y));
}
function findRoomAt(state, x, y) {
  return state.rooms.find((r) => inRoomSpace(r, x, y));
}
function closeToCenter(room, x, y) {
  const cx = (room.x + room.width / 2) * 32;
  const cy = (room.y + room.height / 2) * 32;
  const dx = Math.abs(cx - x);
  const dy = Math.abs(cy - y);
  return dx < 32 && dy < 32;
}
function inRoomSpace(room, x, y) {
  x = Math.floor(x / 32);
  y = Math.floor(y / 32);
  return x >= room.x - 1 && x < room.x + room.width + 1 && y >= room.y - 1 && y < room.y + room.height + 1;
}
function blockedLocationInRoom(atStart, room, x, y, hasAllKeys) {
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
  if (room.connections[
    1
    /* NORTH */
  ]) {
    const topOffset = !hasAllKeys && room.doors[
      1
      /* NORTH */
    ] ? -0.5 : 1;
    if (x >= halfX + 0.5 && x < halfX + 2 - 0.4 && y > room.y - topOffset && y < room.y + 4) {
      return false;
    }
  }
  if (room.connections[
    2
    /* SOUTH */
  ]) {
    const bottomOffset = !hasAllKeys && room.doors[
      2
      /* SOUTH */
    ] ? 0.8 : 1;
    if (x >= halfX + 0.5 && x < halfX + 2 - 0.4 && y < room.y + room.height + bottomOffset && y > room.y + 4) {
      return false;
    }
  }
  if (room.connections[
    4
    /* WEST */
  ]) {
    const leftOffset = !hasAllKeys && room.doors[
      4
      /* WEST */
    ] ? 0 : 1;
    if (y >= halfY + 0.1 && y < halfY + 2 && x >= room.x - leftOffset && x < room.x + 4) {
      return false;
    }
  }
  if (room.connections[
    3
    /* EAST */
  ]) {
    const rightOffset = !hasAllKeys && room.doors[
      3
      /* EAST */
    ] ? 0 : 1;
    if (y >= halfY + 0.1 && y < halfY + 2 && x < room.x + room.width + rightOffset && x > room.x + 4) {
      return false;
    }
  }
  return true;
}
var EntityType = /* @__PURE__ */ ((EntityType2) => {
  EntityType2[EntityType2["MONSTER"] = 87] = "MONSTER";
  EntityType2[EntityType2["FEMALE_ELF"] = 119] = "FEMALE_ELF";
  EntityType2[EntityType2["MALE_ELF"] = 151] = "MALE_ELF";
  EntityType2[EntityType2["PINK_KNIGHT"] = 183] = "PINK_KNIGHT";
  EntityType2[EntityType2["ORANGE_KNIGHT"] = 215] = "ORANGE_KNIGHT";
  EntityType2[EntityType2["FEMALE_MAGE"] = 247] = "FEMALE_MAGE";
  EntityType2[EntityType2["MALE_MAGE"] = 279] = "MALE_MAGE";
  EntityType2[EntityType2["DINO1"] = 311] = "DINO1";
  EntityType2[EntityType2["DINO2"] = 343] = "DINO2";
  EntityType2[EntityType2["FACE_GUY"] = 375] = "FACE_GUY";
  EntityType2[EntityType2["ORC"] = 407] = "ORC";
  EntityType2[EntityType2["ORC_CHIEF"] = 439] = "ORC_CHIEF";
  EntityType2[EntityType2["SKELLY"] = 471] = "SKELLY";
  return EntityType2;
})(EntityType || {});
const IDLE = { base: 0, count: 4 };
const RUN = { base: 4, count: 4 };
function createEntity(id, x, y, type) {
  return {
    id,
    x,
    y,
    type,
    faceLeft: false,
    anim: IDLE,
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
    hurtAt: -1e4
  };
}
function updateEntity(time, state, entity, step) {
  if (time > entity.speedTimeout) {
    entity.speed = 10;
  }
  if (entity.type === 87) {
    const monsterSpeed = 1;
    const oldX = entity.x;
    const oldY = entity.y;
    let room = findRoomAt(state, entity.x, entity.y);
    const opponent = state.entities.find((e) => e.type !== 87 && findRoomAt(state, e.x, e.y) === room);
    if (opponent) {
      const dx = opponent.x - entity.x;
      const dy = opponent.y - entity.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      entity.x += dx / len * monsterSpeed;
      if (!room || blockedLocationInRoom(state.atStart, room, entity.x, entity.y, false)) {
        entity.x = oldX;
      }
      entity.y += dy / len * monsterSpeed;
      room = findRoomAt(state, entity.x, entity.y);
      if (!room || blockedLocationInRoom(state.atStart, room, entity.x, entity.y, false)) {
        entity.y = oldY;
      }
    } else {
      if (room) {
        const dx = (room.x + room.width / 2) * 32 - entity.x;
        const dy = (room.y + room.height / 2) * 32 - entity.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        entity.x += dx / len * monsterSpeed;
        if (!room || blockedLocationInRoom(state.atStart, room, entity.x, entity.y, false)) {
          entity.x = oldX;
        }
        entity.y += dy / len * monsterSpeed;
        room = findRoomAt(state, entity.x, entity.y);
        if (!room || blockedLocationInRoom(state.atStart, room, entity.x, entity.y, false)) {
          entity.y = oldY;
        }
      }
    }
  } else {
    const controlsDown = Object.values(entity.controls).filter((m) => m === true).length;
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
}
const ROUND_TIME_MINS = 3;
const SPIKE_STATES = [0, 0, 0, 0, 0, 0, 1, 2, 3, 2, 1];
const HURT_GRACE = 2e3;
var GameEventType = /* @__PURE__ */ ((GameEventType2) => {
  GameEventType2[GameEventType2["RESTART"] = 1] = "RESTART";
  GameEventType2[GameEventType2["GOT_TREASURE"] = 2] = "GOT_TREASURE";
  GameEventType2[GameEventType2["GOT_BRONZE"] = 3] = "GOT_BRONZE";
  GameEventType2[GameEventType2["GOT_SILVER"] = 4] = "GOT_SILVER";
  GameEventType2[GameEventType2["GOT_GOLD"] = 5] = "GOT_GOLD";
  GameEventType2[GameEventType2["GOT_SPEED"] = 6] = "GOT_SPEED";
  GameEventType2[GameEventType2["GOT_HEALTH"] = 7] = "GOT_HEALTH";
  GameEventType2[GameEventType2["START_COUNTDOWN"] = 8] = "START_COUNTDOWN";
  GameEventType2[GameEventType2["WIN"] = 9] = "WIN";
  GameEventType2[GameEventType2["TIME_OUT"] = 10] = "TIME_OUT";
  GameEventType2[GameEventType2["DEATH"] = 11] = "DEATH";
  GameEventType2[GameEventType2["HURT"] = 12] = "HURT";
  return GameEventType2;
})(GameEventType || {});
function getSpikeState(x, y, time) {
  const index = Math.abs(Math.floor(x + y * 100 + time / 200));
  return SPIKE_STATES[index % SPIKE_STATES.length];
}
function getPlayerCount(state) {
  return state.entities.filter((e) => e.type !== EntityType.MONSTER).length;
}
function createPlayerEntity(state, playerId, type) {
  const startRoom = state.rooms.find((r) => r.id === state.startRoom);
  if (startRoom) {
    const x = (startRoom.x + 2) * 32 + Math.random() * (startRoom.width - 4) * 32;
    const y = (startRoom.y + 2) * 32 + Math.random() * (startRoom.height - 4) * 32;
    const entity = createEntity(playerId, x, y, type);
    state.entities.push(entity);
    return entity;
  }
}
function respawn(state, entity) {
  state.entities.splice(state.entities.indexOf(entity), 1);
  const newPlayer = createPlayerEntity(state, entity.id, entity.type);
  if (newPlayer) {
    newPlayer.bronzeKey = entity.bronzeKey;
    newPlayer.goldKey = entity.goldKey;
    newPlayer.silverKey = entity.silverKey;
  }
}
function startGame(state) {
  state.winner = void 0;
  state.atStart = true;
  const existingPlayers = state.entities.filter((e) => e.type !== EntityType.MONSTER);
  state.entities = [];
  state.rooms = [];
  state.startRoom = 0;
  state.startRace = 0;
  state.countDown = -1;
  state.endGameTime = 0;
  state.gameOver = false;
  state.gameOverTime = 0;
  generateDungeon(state);
  for (const player of existingPlayers) {
    createPlayerEntity(state, player.id, player.type);
  }
  state.statusMessage = "Waiting for Players!";
  state.events.push({
    type: 1
    /* RESTART */
  });
}
Rune.initLogic({
  minPlayers: 1,
  maxPlayers: 4,
  setup: () => {
    const initialState = {
      entities: [],
      rooms: [],
      startRoom: 0,
      scores: {},
      atStart: true,
      startRace: 0,
      statusMessage: "",
      countDown: -1,
      endGameTime: 0,
      gameOver: false,
      gameOverTime: 0,
      events: []
    };
    startGame(initialState);
    return initialState;
  },
  updatesPerSecond: 30,
  actions: {
    join: (params, context) => {
      createPlayerEntity(context.game, context.playerId, params.type);
      context.game.scores[context.playerId] = 0;
    },
    applyControls: (controls, context) => {
      const playerEntity = context.game.entities.find((e) => e.id === context.playerId);
      if (playerEntity) {
        playerEntity.controls.left = controls.left;
        playerEntity.controls.right = controls.right;
        playerEntity.controls.up = controls.up;
        playerEntity.controls.down = controls.down;
        if (controls.left || controls.right || controls.up || controls.down) {
          playerEntity.anim = RUN;
        } else {
          playerEntity.anim = IDLE;
        }
        if (controls.left) {
          playerEntity.faceLeft = true;
        } else if (controls.right) {
          playerEntity.faceLeft = false;
        }
      }
    },
    useItem(params, context) {
      const playerEntity = context.game.entities.find((e) => e.id === context.playerId);
      if (playerEntity) {
        if (playerEntity.item === "health") {
          playerEntity.item = void 0;
          playerEntity.health = Math.min(3, playerEntity.health + 1);
        }
        if (playerEntity.item === "speed") {
          playerEntity.speedTimeout = Rune.gameTime() + 1e3 * 15;
          playerEntity.speed = 15;
          playerEntity.item = void 0;
        }
      }
    }
  },
  events: {
    playerJoined() {
    },
    playerLeft(playerId, context) {
      const toRemove = context.game.entities.find((e) => e.id === playerId);
      if (toRemove) {
        context.game.entities.splice(context.game.entities.indexOf(toRemove), 1);
      }
    }
  },
  update: (context) => {
    context.game.events = [];
    if (context.game.gameOver && Rune.gameTime() - context.game.gameOverTime > 5e3) {
      startGame(context.game);
      return;
    }
    if (!context.game.atStart && !context.game.gameOver && context.game.endGameTime < Rune.gameTime()) {
      context.game.winner = void 0;
      context.game.gameOver = true;
      context.game.gameOverTime = Rune.gameTime();
      context.game.events.push({
        type: 10
        /* TIME_OUT */
      });
      return;
    }
    if (context.game.gameOver) {
      return;
    }
    let minPlayers = 2;
    if (context.allPlayerIds.length === 1) {
      minPlayers = 1;
    }
    if (context.game.atStart && getPlayerCount(context.game) >= minPlayers) {
      if (context.game.startRace === 0) {
        context.game.startRace = Rune.gameTime() + 5e3;
        context.game.events.push({
          type: 8
          /* START_COUNTDOWN */
        });
      } else {
        const remaining = context.game.startRace - Rune.gameTime();
        if (remaining < 0) {
          context.game.atStart = false;
          context.game.endGameTime = Rune.gameTime() + 60 * 1e3 * ROUND_TIME_MINS;
        } else {
          const secondsLeft = Math.floor(remaining / 1e3) + 1;
          context.game.statusMessage = "Get Ready!";
          context.game.countDown = secondsLeft;
        }
      }
    }
    for (let i = 0; i < 4; i++) {
      for (const entity of context.game.entities) {
        updateEntity(Rune.gameTime(), context.game, entity, 0.25);
        const room = findRoomAt(context.game, entity.x, entity.y);
        if (room && entity.type !== EntityType.MONSTER) {
          room.discovered = true;
          if (room.item) {
            if (closeToCenter(room, entity.x, entity.y)) {
              if (room.item === "bronze" && !entity.bronzeKey) {
                entity.bronzeKey = true;
                context.game.scores[entity.id] += 1;
                context.game.events.push({ type: 3, who: entity.id, x: room.x + room.width / 2, y: room.y + room.height / 2 });
              }
              if (room.item === "silver" && !entity.silverKey) {
                entity.silverKey = true;
                context.game.scores[entity.id] += 1;
                context.game.events.push({ type: 4, who: entity.id, x: room.x + room.width / 2, y: room.y + room.height / 2 });
              }
              if (room.item === "gold" && !entity.goldKey) {
                entity.goldKey = true;
                context.game.scores[entity.id] += 1;
                context.game.events.push({ type: 5, who: entity.id, x: room.x + room.width / 2, y: room.y + room.height / 2 });
              }
              if (room.item === "health") {
                if (!entity.item) {
                  entity.item = "health";
                  room.item = void 0;
                  context.game.events.push({ type: 7, who: entity.id, x: room.x + room.width / 2, y: room.y + room.height / 2 });
                }
              }
              if (room.item === "speed") {
                if (!entity.item) {
                  entity.item = "speed";
                  room.item = void 0;
                  context.game.events.push({ type: 6, who: entity.id, x: room.x + room.width / 2, y: room.y + room.height / 2 });
                }
              }
              if (room.item === "treasure") {
                context.game.scores[entity.id] += 2;
                room.item = void 0;
                context.game.events.push({ type: 2, who: entity.id, x: room.x + room.width / 2, y: room.y + room.height / 2 });
              }
              if (room.item === "egg" && !context.game.winner) {
                context.game.scores[entity.id] += 7;
                context.game.winner = entity.id;
                context.game.gameOver = true;
                context.game.gameOverTime = Rune.gameTime();
                context.game.events.push({
                  type: 9
                  /* WIN */
                });
              }
            }
          }
        }
      }
    }
    for (const entity of context.game.entities) {
      const room = findRoomAt(context.game, entity.x, entity.y);
      if (entity.type !== EntityType.MONSTER) {
        if (Rune.gameTime() - entity.hurtAt > HURT_GRACE) {
          const touchingMonster = context.game.entities.find((e) => e.type === EntityType.MONSTER && Math.abs(e.x - entity.x) < 16 && Math.abs(e.y - entity.y) < 16);
          if (touchingMonster) {
            entity.health--;
            if (entity.health <= 0) {
              context.game.events.push({ type: 11, who: entity.id });
              respawn(context.game, entity);
              continue;
            } else {
              entity.hurtAt = Rune.gameTime();
              context.game.events.push({ type: 12, who: entity.id });
            }
          }
          if (room && room.spikes) {
            const tileX = Math.floor((entity.x - room.x * 32) / 32);
            const tileY = Math.floor((entity.y - room.y * 32) / 32);
            const spikeAtLocation = room.spikeLocations.find((l) => l.x === tileX && l.y === tileY);
            if (spikeAtLocation) {
              if (getSpikeState(spikeAtLocation.x + room.x, spikeAtLocation.y + room.y, Rune.gameTime()) === 3) {
                entity.health--;
                if (entity.health <= 0) {
                  context.game.events.push({ type: 11, who: entity.id });
                  respawn(context.game, entity);
                  continue;
                } else {
                  entity.hurtAt = Rune.gameTime();
                  context.game.events.push({ type: 12, who: entity.id });
                }
              }
            }
          }
        }
      }
    }
  }
});
export {
  Direction as D,
  EntityType as E,
  GameEventType as G,
  HURT_GRACE as H,
  RUN as R,
  findRoomAt as a,
  findAllRoomsAt as f,
  getSpikeState as g
};
