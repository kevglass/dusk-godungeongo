import type { OnChangeAction, OnChangeEvent, PlayerId, Players, RuneClient } from "rune-games-sdk/multiplayer"
import { Controls, Entity, EntityType, IDLE, RUN, createEntity, updateEntity } from "./entity";
import { Room, closeToCenter, findAllRoomsAt, findRoomAt, generateDungeon } from "./room";

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

export interface GameState {
  entities: Entity[];
  rooms: Room[];
  startRoom: number;
  scores: Record<string, number>;
  atStart: boolean;
  startRace: number;
  winner?: string;
  statusMessage: string;
  countDown: number;
  endGameTime: number;
}

type GameActions = {
  join: (params: { type: EntityType }) => void;
  applyControls: (controls: Controls) => void;
  useItem: () => void;
}

declare global {
  const Rune: RuneClient<GameState, GameActions>
}

export function getPlayerCount(state: GameState) {
  return state.entities.filter(e => e.type !== EntityType.MONSTER).length;
}

export function getWinner(state: GameState) {

}

function createPlayerEntity(state: GameState, playerId: string, type: EntityType) {
  const startRoom = state.rooms.find(r => r.id === state.startRoom);

  if (startRoom) {
    const x = ((startRoom.x + 2) * 32) + (Math.random() * (startRoom.width - 4) * 32);
    const y = ((startRoom.y + 2) * 32) + (Math.random() * (startRoom.height - 4) * 32);

    state.entities.push(createEntity(playerId, x, y, type));
  }
}

function startGame(state: GameState) {
  state.winner = undefined;
  state.atStart = true;

  const existingPlayers = state.entities.filter(e => e.type !== EntityType.MONSTER);
  state.entities = [];
  state.rooms = [];
  state.startRoom = 0;
  state.startRace = 0;
  state.countDown = -1;
  state.endGameTime = 0;

  generateDungeon(state);

  for (const player of existingPlayers) {
    createPlayerEntity(state, player.id, player.type);
  }

  state.statusMessage = "Waiting for Players!";
}

Rune.initLogic({
  minPlayers: 1,
  maxPlayers: 4,
  setup: (): GameState => {
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
    }

    startGame(initialState);

    return initialState;
  },
  updatesPerSecond: 30,
  actions: {
    join: (params: { type: EntityType }, context) => {
      createPlayerEntity(context.game, context.playerId, params.type);
      context.game.scores[context.playerId] = 0;
    },
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
    useItem(params, context) {
      const playerEntity = context.game.entities.find(e => e.id === context.playerId);
      if (playerEntity) {
        if (playerEntity.item === "health") {
          playerEntity.item = undefined;
          playerEntity.health = Math.min(3, playerEntity.health + 1);
        }
        if (playerEntity.item === "speed") {
          playerEntity.speedTimeout = Rune.gameTime() + (1000 * 15);
          playerEntity.speed = 15;
          playerEntity.item = undefined;
        }
      }
    },
  },
  events: {
    playerJoined(playerId, context) {
      // we don't need to do anything until they select a character type
    }
  },
  update: (context) => {
    if (context.game.atStart && getPlayerCount(context.game) > 0) {
      // start the kick off timer
      if (context.game.startRace === 0) {
        context.game.startRace = Rune.gameTime() + 5000;
      } else {
        const remaining = context.game.startRace - Rune.gameTime();
        if (remaining < 0) {
          // START!
          context.game.atStart = false;
          context.game.endGameTime = Rune.gameTime() + (60 * 1000 * 3);
        } else {
          const secondsLeft = Math.floor(remaining / 1000) + 1;
          context.game.statusMessage = "Get Ready!";
          context.game.countDown = secondsLeft;
        }
      }
    }
    for (let i = 0; i < 4; i++) {
      for (const entity of context.game.entities) {
        updateEntity(Rune.gameTime(), context.game, entity, 0.25);
        const room = findRoomAt(context.game, entity.x, entity.y);
        if (room) {
          room.discovered = true;
          if (room.item) {
            if (closeToCenter(room, entity.x, entity.y)) {
              // intersect with the item in the room
              if (room.item === "bronze" && !entity.bronzeKey) {
                entity.bronzeKey = true;
                context.game.scores[entity.id] += 1;
              }
              if (room.item === "silver" && !entity.silverKey) {
                entity.silverKey = true;
                context.game.scores[entity.id] += 1;
              }
              if (room.item === "gold" && !entity.goldKey) {
                entity.goldKey = true;
                context.game.scores[entity.id] += 1;
              }
              if (room.item === "health") {
                if (!entity.item) {
                  entity.item = "health";
                  room.item = undefined;
                }
              }
              if (room.item === "speed") {
                if (!entity.item) {
                  entity.item = "speed";
                  room.item = undefined;
                }
              }
              if (room.item === "treasure") {
                context.game.scores[entity.id] += 2;
                room.item = undefined;
              }

              if (room.item === "egg" && !context.game.winner) {
                context.game.winner = entity.id;
              }
            }
          }
        }
      }
    }
  }
})
