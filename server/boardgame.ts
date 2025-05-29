// BoardGame

interface GameConfig {
  name: string;
  minPlayers: number;
  maxPlayers: number;
  boardImage: string;
  pieceImages: {
    [key: string]: string;
  };
  rules: {
    description: string;
    setup: string[];
    gameplay: string[];
    winning: string;
  };
}

interface GameState {
  gameId: string;
  gameType: string;
  players: {
    id: number;
    name: string;
    isAI: boolean;
    color: string;
    position: number;
  }[];
  currentTurn: number;
  status: 'waiting' | 'playing' | 'finished';
  winner: number | null;
}

const gameConfigs: { [key: string]: GameConfig } = {
  'snakes-and-ladders': {
    name: 'Snakes and Ladders',
    minPlayers: 2,
    maxPlayers: 4,
    boardImage: '/images/snakes-and-ladders-board.png',
    pieceImages: {
      red: '/images/pieces/red.png',
      blue: '/images/pieces/blue.png',
      green: '/images/pieces/green.png',
      purple: '/images/pieces/purple.png',
    },
    rules: {
      description: 'A classic board game where players race to reach the finish by climbing ladders and sliding down snakes.',
      setup: [
        'Each player starts at position 0',
        'Players take turns rolling a die',
        'The first player to reach position 100 wins',
      ],
      gameplay: [
        'Roll a die and move your piece that many spaces',
        'If you land at the foot of a ladder, climb to the higher number at the top',
        'If you land on a snake\'s mouth, then slide down to the lower number at its tail',
        'You must roll the exact number to reach position 100. If you exceed 100 on the last move, then you do not move',
      ],
      winning: 'The first player to reach position 100 wins the game.',
    }
  },
  // Add more games here
};

function generateGameId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export function initialiseGame(gameName: string): GameState {
  const config = gameConfigs[gameName];
  if (!config) {
    throw new Error(`Game "${gameName}" not found in configuration`);
  }

  return {
    gameId: generateGameId(),
    gameType: gameName,
    players: [],
    currentTurn: 0,
    status: 'waiting',
    winner: null,
  };
}

export function getGameConfig(gameName: string): GameConfig {
  const config = gameConfigs[gameName];
  if (!config) {
    throw new Error(`Game "${gameName}" not found in configuration`);
  }
  return config;
}

// Export types for use in other files
export type { GameConfig, GameState };