import type { OnChangeAction, OnChangeEvent, PlayerId, Players, RuneClient } from "rune-games-sdk/multiplayer"
import { Controls, Entity, EntityType, IDLE, RUN, createEntity, updateEntity } from "./entity";
import { Room, closeToCenter, findRoomAt, generateDungeon } from "./room";

// The amount of time given for a round of play. If they don't
// find the egg in this time then the game is over and no 
// one wins.
const ROUND_TIME_MINS = 2.5;
// The states that the spiked floors can be - rudimentary timing
// on the down state
export const SPIKE_STATES = [0, 0, 0, 0, 0, 0, 1, 2, 3, 2, 1];
// 2 seconds grace allowance after getting hurt
export const HURT_GRACE = 2000;

// Quick type so I can pass the complex object that is the 
// Rune onChange blob around without ugliness. 
export type GameUpdate = {
  game: GameState;
  action?: OnChangeAction<GameActions>;
  event?: OnChangeEvent;
  yourPlayerId: PlayerId | undefined;
  players: Players;
  rollbacks: OnChangeAction<GameActions>[];
  previousGame: GameState;
  futureGame?: GameState;
};

// The state thats synchronized by running the logic
// on each end point and applying actions through the
// Rune SDK
export interface GameState {
  // The list of entities (players or monsters) in the world
  entities: Entity[];
  // The rooms that build up our dungeon
  rooms: Room[];
  // Room map
  roomMap: number[];
  // The room that players start in
  startRoom: number;
  // The scores keyed on Player ID
  scores: Record<PlayerId, number>;
  // True if the players are waiting at the start to begin the race
  atStart: boolean;
  // The time at which the race should start - lets us do the countdown
  startRace: number;
  // The player ID of the winner of the race - who found the egg
  winner?: PlayerId;
  // The status message to display at the top of the screen while 
  // at the start
  statusMessage: string;
  // The count down number to be displayed because it was easier
  // to keep it here than calc on the clients
  countDown: number;
  // The time at which the game is considered over - i.e. when
  // everyone loses 
  endGameTime: number;
  // True if the game is completed
  gameOver: boolean;
  // The time at which the game was completed - pause for restart
  gameOverTime: number;
  // A list of events that have occurred in the game loop so the
  // client can render effects and play sounds related
  events: GameEvent[];
  // The number of rooms to be generated
  roomCount: number;
  // The number of keys to place
  keyCount: number;
  // The level of difficulty
  level: number;
}

// Game Events report things that have happened in the game logic
// so the renderer can take action (effects/sfx/etc)
export enum GameEventType {
  // Game restarted
  RESTART = 1,
  // Player got a treasure box
  GOT_TREASURE = 2,
  // Player got the bronze key
  GOT_BRONZE = 3,
  // Player got the silver key
  GOT_SILVER = 4,
  // Player got the gold key
  GOT_GOLD = 5,
  // Player got a speed potion
  GOT_SPEED = 6,
  // Player got a health potion
  GOT_HEALTH = 7,
  // The count down to begin the race was started
  START_COUNTDOWN = 8,
  // Somebody won the game
  WIN = 9,
  // The timer ran out
  TIME_OUT = 10,
  // A player died
  DEATH = 11,
  // A player was hurt
  HURT = 12,
  // A player used a speed up potion
  SPEED_UP = 13,
  // A player used a heal potion
  HEAL_UP = 14,
  // a room was discovered by any player
  DISCOVER = 15
}

// Simple game event to let the renderer know when game loop events
// have taken place
export interface GameEvent {
  // the type of the event
  type: GameEventType;
  // The entity ID who the event happened to
  who?: string;
  // The x tile position where the event happened
  x?: number;
  // The y tile position where the event happened
  y?: number;
}

// Actions that the renderer can apply to the Rune game state
type GameActions = {
  // A player has joined the game and selected a player type
  join: (params: { type: EntityType }) => void;
  // A player has changed their control state
  applyControls: (controls: Controls) => void;
  // A player uses the item they are holding
  useItem: () => void;
}

declare global {
  const Rune: RuneClient<GameState, GameActions>
}

// Get the state of a spike at a given location. This is a deterministic
// function based on the world position of the spike and the game time
// and allows us to sync up the states everywhere
export function getSpikeState(x: number, y: number, time: number): number {
  const index = Math.abs(Math.floor(x + (y * 100) + (time / 200)));
  return SPIKE_STATES[index % SPIKE_STATES.length];
}

// Get the number of players in the game
export function getPlayerCount(state: GameState) {
  return state.entities.filter(e => e.type !== EntityType.MONSTER).length;
}

// Utility to create a player entity and place it in the start room. This is used
// at game start and for respawn.
function createPlayerEntity(state: GameState, playerId: string, type: EntityType): Entity | undefined {
  const startRoom = state.rooms.find(r => r.id === state.startRoom);

  if (startRoom) {
    const x = ((startRoom.x + 2) * 32) + (Math.random() * (startRoom.width - 4) * 32);
    const y = ((startRoom.y + 2) * 32) + (Math.random() * (startRoom.height - 4) * 32);

    const entity = createEntity(playerId, x, y, type);

    state.entities.push(entity);

    return entity;
  }
}

// Utility to respawn a player when they die
function respawn(state: GameState, entity: Entity) {
  state.entities.splice(state.entities.indexOf(entity), 1);
  const newPlayer = createPlayerEntity(state, entity.id, entity.type);

  // we keep the keys we've collected on respawn
  if (newPlayer) {
    newPlayer.bronzeKey = entity.bronzeKey;
    newPlayer.goldKey = entity.goldKey;
    newPlayer.silverKey = entity.silverKey;
    newPlayer.respawnedAt = Rune.gameTime();
  }
}

// Start a game, generate a dungeon, initialize the game state
// and set up entities for any existing players
function startGame(state: GameState) {
  state.winner = undefined;
  state.atStart = true;

  const existingPlayers = state.entities.filter(e => e.type !== EntityType.MONSTER);
  state.entities = [];
  state.rooms = [];
  state.roomMap = [];
  state.startRoom = 0;
  state.startRace = 0;
  state.countDown = -1;
  state.endGameTime = 0;
  state.gameOver = false;
  state.gameOverTime = 0;
  state.level++;

  if (state.level > 2) {
    state.keyCount = 3;
  }
  if (state.level > 2) {
    state.roomCount = 40;
  }
  if (state.level > 5) {
    state.roomCount = 50;
  }

  generateDungeon(state);

  for (const player of existingPlayers) {
    createPlayerEntity(state, player.id, player.type);
  }

  state.statusMessage = "Waiting for Players!";
  state.events.push({ type: GameEventType.RESTART });
}

Rune.initLogic({
  minPlayers: 1,
  maxPlayers: 4,
  // setup initial state object and start the game
  setup: (): GameState => {
    const initialState = {
      entities: [],
      rooms: [],
      roomMap: [],
      startRoom: 0,
      scores: {},
      atStart: true,
      startRace: 0,
      statusMessage: "",
      countDown: -1,
      endGameTime: 0,
      gameOver: false,
      gameOverTime: 0,
      events: [],
      roomCount: 30,
      keyCount: 2,
      level: 0
    }

    startGame(initialState);

    return initialState;
  },
  updatesPerSecond: 30,
  actions: {
    // player joins the game having selected an entity. Create the player 
    // entity in the start room with the right sprite and reset their score
    join: (params: { type: EntityType }, context) => {
      createPlayerEntity(context.game, context.playerId, params.type);
      context.game.scores[context.playerId] = 0;
    },
    // update the player controls based on input from the client
    applyControls: (controls: Controls, context) => {
      const playerEntity = context.game.entities.find(e => e.id === context.playerId);
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
    // use the item a player is holding. 
    useItem(params, context) {
      const playerEntity = context.game.entities.find(e => e.id === context.playerId);
      if (playerEntity) {
        if (playerEntity.item === "health") {
          playerEntity.item = undefined;
          playerEntity.health = Math.min(3, playerEntity.health + 1);
          context.game.events.push({ type: GameEventType.HEAL_UP, who: context.playerId });
        }
        if (playerEntity.item === "speed") {
          playerEntity.speedTimeout = Rune.gameTime() + (1000 * 15);
          playerEntity.speed = 15;
          playerEntity.item = undefined;
          context.game.events.push({ type: GameEventType.SPEED_UP, who: context.playerId });
        }
      }
    },
  },
  events: {
    playerJoined() {
      // we don't need to do anything until they select a character type
    },
    playerLeft(playerId, context) {
      // clean up any entity assigned to the player leaving
      const toRemove = context.game.entities.find(e => e.id === playerId);
      if (toRemove) {
        context.game.entities.splice(context.game.entities.indexOf(toRemove), 1);
      }
    }
  },
  update: (context) => {
    // clear the events list for this frame
    context.game.events = [];

    // if we've shown the game over message for long enough then reset the game
    if (context.game.gameOver && Rune.gameTime() - context.game.gameOverTime > 5000) {
      startGame(context.game);
      return;
    }
    // time ran out, nobody wins
    if (!context.game.atStart && !context.game.gameOver && context.game.endGameTime < Rune.gameTime()) {
      context.game.winner = undefined;
      context.game.gameOver = true;
      context.game.gameOverTime = Rune.gameTime();
      context.game.events.push({ type: GameEventType.TIME_OUT });
      return;
    }
    if (context.game.gameOver) {
      return;
    }

    let minPlayers = 2;
    // if theres only one player in the room, then we can start with just
    // one in solo mode
    if (context.allPlayerIds.length === 1) {
      minPlayers = 1;
    }

    if (context.game.atStart && getPlayerCount(context.game) >= minPlayers) {
      // start the kick off timer
      if (context.game.startRace === 0) {
        context.game.startRace = Rune.gameTime() + 5000;
        context.game.events.push({ type: GameEventType.START_COUNTDOWN });
      } else {
        const remaining = context.game.startRace - Rune.gameTime();
        if (remaining < 0) {
          // START!
          context.game.atStart = false;
          context.game.endGameTime = Rune.gameTime() + (60 * 1000 * ROUND_TIME_MINS);
        } else {
          const secondsLeft = Math.floor(remaining / 1000) + 1;
          context.game.statusMessage = "Get Ready!";
          context.game.countDown = secondsLeft;
        }
      }
    }

    let fireDiscovery = true;
    for (const entity of context.game.entities.filter(e => e.type !== EntityType.MONSTER)) {
      updateEntity(Rune.gameTime(), context.game, entity, 1);
      const room = findRoomAt(context.game, entity.x, entity.y);

      if (room) {
        if (!room.discovered) {
          room.discovered = true;
          fireDiscovery = true;
        }
        if (room.item) {
          if (closeToCenter(room, entity.x, entity.y)) {
            // intersect with the item in the room
            switch (room.item) {
              case "bronze":
                if (!entity.bronzeKey) {
                  entity.bronzeKey = true;
                  context.game.scores[entity.id] += 1;
                  context.game.events.push({ type: GameEventType.GOT_BRONZE, who: entity.id, x: room.x + room.width / 2, y: room.y + room.height / 2 });
                }
                break;
              case "silver":
                if (!entity.silverKey) {
                  entity.silverKey = true;
                  context.game.scores[entity.id] += 1;
                  context.game.events.push({ type: GameEventType.GOT_SILVER, who: entity.id, x: room.x + room.width / 2, y: room.y + room.height / 2 });
                }
                break;
              case "gold":
                if (!entity.goldKey) {
                  entity.goldKey = true;
                  context.game.scores[entity.id] += 1;
                  context.game.events.push({ type: GameEventType.GOT_GOLD, who: entity.id, x: room.x + room.width / 2, y: room.y + room.height / 2 });
                }
                break;
              case "health":
                if (!entity.item) {
                  entity.item = "health";
                  room.item = undefined;
                  context.game.events.push({ type: GameEventType.GOT_HEALTH, who: entity.id, x: room.x + room.width / 2, y: room.y + room.height / 2 });
                }
                break;
              case "speed":
                if (!entity.item) {
                  entity.item = "speed";
                  room.item = undefined;
                  context.game.events.push({ type: GameEventType.GOT_SPEED, who: entity.id, x: room.x + room.width / 2, y: room.y + room.height / 2 });
                }
                break;
              case "treasure":
                context.game.scores[entity.id] += 2;
                room.item = undefined;
                context.game.events.push({ type: GameEventType.GOT_TREASURE, who: entity.id, x: room.x + room.width / 2, y: room.y + room.height / 2 });
                break;
              case "egg":
                if (!context.game.winner) {
                  context.game.scores[entity.id] += 7;
                  context.game.winner = entity.id;
                  context.game.gameOver = true;
                  context.game.gameOverTime = Rune.gameTime();
                  context.game.events.push({ type: GameEventType.WIN });
                }
                break;
            }
          }
        }
      }
    }

    if (fireDiscovery) {
      context.game.events.push({ type: GameEventType.DISCOVER });
    }

    // // update all the monster entities with a flat 1 step update since they
    // // don't do collision
    for (const entity of context.game.entities.filter(e => e.type === EntityType.MONSTER)) {
      updateEntity(Rune.gameTime(), context.game, entity, 1);
    }

    // check to see if the players are hitting anything that can hurt them 
    // if they are apply the health change and potential respawn
    for (const entity of context.game.entities.filter(e => e.type !== EntityType.MONSTER)) {
      // have to wait a second if you respawn
      if (Rune.gameTime() < entity.respawnedAt + 2000) {
        continue;
      }

      // players can only be hurt every couple of seconds. They'll go into the traditional 
      // flashing state while in grace
      if (Rune.gameTime() - entity.hurtAt > HURT_GRACE) {
        const room = findRoomAt(context.game, entity.x, entity.y);
  
        // find any monsters that are close enough to damage the player - if there
        // is one then apply the health change
        const touchingMonster = context.game.entities.find(e => e.type === EntityType.MONSTER && Math.abs(e.x - entity.x) < 16 && Math.abs(e.y - entity.y) < 16);
        if (touchingMonster) {
          entity.health--;
          if (entity.health <= 0) {
            context.game.events.push({ type: GameEventType.DEATH, who: entity.id });
            respawn(context.game, entity);
            continue;
          } else {
            entity.hurtAt = Rune.gameTime();
            context.game.events.push({ type: GameEventType.HURT, who: entity.id });
          }
        }

        // if the room the player is in has spikes check to see
        // if they're standing on one. If so check to see if the spike
        // is in the up position (3). Apply any damage
        if (room && room.spikes) {
          const tileX = Math.floor((entity.x - (room.x * 32)) / 32);
          const tileY = Math.floor((entity.y - (room.y * 32)) / 32);
          const spikeAtLocation = room.spikeLocations.find(l => l.x === tileX && l.y === tileY);
          if (spikeAtLocation) {
            // only get spiked on full up
            if (getSpikeState(spikeAtLocation.x + room.x, spikeAtLocation.y + room.y, Rune.gameTime()) === 3) {
              entity.health--;
              if (entity.health <= 0) {
                context.game.events.push({ type: GameEventType.DEATH, who: entity.id });
                respawn(context.game, entity);
                continue;
              } else {
                entity.hurtAt = Rune.gameTime();
                context.game.events.push({ type: GameEventType.HURT, who: entity.id });
              }
            }
          }
        }
      }
    }
  }
})
