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
}

type GameActions = {
  join: (params: { type: EntityType }) => void;
  applyControls: (controls: Controls) => void;
}

declare global {
  const Rune: RuneClient<GameState, GameActions>
}

function createPlayerEntity(state: GameState, playerId: string, type: EntityType) {
  const startRoom = state.rooms.find(r => r.id === state.startRoom);

  if (startRoom) {
    const x = ((startRoom.x + 2) * 32) + (Math.random() * (startRoom.width - 4) * 32);
    const y = ((startRoom.y + 2) * 32) + (Math.random() * (startRoom.height - 4) * 32);

    state.entities.push(createEntity(playerId, x, y, type));
  }
}

Rune.initLogic({
  minPlayers: 1,
  maxPlayers: 4,
  setup: (): GameState => {
    const initialState = {
      entities: [],
      rooms: [],
      startRoom: 0
    }

    generateDungeon(initialState);

    return initialState;
  },
  updatesPerSecond: 30,
  actions: {
    join: (params: { type: EntityType }, context) => {
      createPlayerEntity(context.game, context.playerId, params.type);
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
    }
  },
  update: (context) => {
    for (const entity of context.game.entities) {
      for (let i = 0; i < 4; i++) {
        updateEntity(context.game, entity, 0.25);
        const room = findRoomAt(context.game, entity.x, entity.y);
        if (room) {
          room.discovered = true;
          if (room.item) {
            if (closeToCenter(room, entity.x, entity.y)) {
              // intersect with the item in the room
              if (room.item === "bronze") {
                entity.bronzeKey = true;
              }
              if (room.item === "silver") {
                entity.silverKey = true;
              }
              if (room.item === "gold") {
                entity.goldKey = true;
              }
            }
          }
        }
      }
    }
  }
})
