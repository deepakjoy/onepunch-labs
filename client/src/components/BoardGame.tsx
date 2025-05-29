import React, { useEffect, useRef, useState } from 'react';

interface GameState {
  currentGame: string;
  players: {
    id: number;
    name: string;
    isAI: boolean;
    color: string;
    position: number;
  }[];
  currentTurn: number;
  gameStatus: 'waiting' | 'playing' | 'finished';
  aiPlayerCount: number | null;
}

const BoardGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [boardImage, setBoardImage] = useState<HTMLImageElement | null>(null);
  const [gameState, setGameState] = React.useState<GameState>({
    currentGame: 'snakes-and-ladders',
    players: [{ id: 1, name: 'Player 1', isAI: false, color: '#FF0000', position: 0 }],
    currentTurn: 0,
    gameStatus: 'waiting',
    aiPlayerCount: null,
  });

  const handleAIPlayerSelection = (count: number) => {
    const aiColors = ['#0000FF', '#00FF00', '#FF00FF']; // Blue, Green, Purple
    const newPlayers = [
      { id: 1, name: 'Player 1', isAI: false, color: '#FF0000', position: 0 },
      ...Array(count)
        .fill(null)
        .map((_, index) => ({
          id: index + 2,
          name: `AI Player ${index + 1}`,
          isAI: true,
          color: aiColors[index],
          position: 0,
        })),
    ];

    setGameState((prev) => ({
      ...prev,
      players: newPlayers,
      aiPlayerCount: count,
      gameStatus: 'playing',
    }));
  };

  // Load board image
  useEffect(() => {
    const img = new Image();
    img.src = '/images/snakes-and-ladders-board.png';
    img.onload = () => {
      console.log('Board image loaded successfully');
      setBoardImage(img);
    };
    img.onerror = (e) => {
      console.error('Error loading board image:', e);
      console.log('Attempted to load from:', img.src);
    };
  }, []);

  // TODO: Implement game state updates
  // setGameState will be used for:
  // - Moving pieces
  // - Changing turns
  // - Updating player positions
  // - Changing game status

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to 1080p
    canvas.width = 1920;
    canvas.height = 1080;

    // Clear canvas
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw game board
    if (boardImage) {
      const maxWidth = 1200;
      const maxHeight = 800;
      const imageAspectRatio = boardImage.width / boardImage.height;
      const containerAspectRatio = maxWidth / maxHeight;

      let drawWidth = maxWidth;
      let drawHeight = maxHeight;
      let x = 100;
      let y = 100;

      if (imageAspectRatio > containerAspectRatio) {
        // Image is wider than container
        drawHeight = maxWidth / imageAspectRatio;
        y = 100 + (maxHeight - drawHeight) / 2;
      } else {
        // Image is taller than container
        drawWidth = maxHeight * imageAspectRatio;
        x = 100 + (maxWidth - drawWidth) / 2;
      }

      ctx.drawImage(boardImage, x, y, drawWidth, drawHeight);
    } else {
      // Fallback placeholder if image hasn't loaded
      ctx.fillStyle = '#F0F0F0';
      ctx.fillRect(100, 100, 1200, 800);
    }

    // Draw UI area placeholder
    ctx.fillStyle = '#E0E0E0';
    ctx.fillRect(1400, 100, 400, 800);

    // Draw game title
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 48px Arial';
    ctx.fillText('Snakes and Ladders', 100, 50);

    // Draw player information
    ctx.font = '24px Arial';
    gameState.players.forEach((player, index) => {
      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.arc(1450, 150 + index * 100, 20, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#000000';
      ctx.fillText(`${player.name} (${player.isAI ? 'AI' : 'Human'})`, 1500, 155 + index * 100);
    });

    // Draw game status
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 32px Arial';
    ctx.fillText(`Status: ${gameState.gameStatus}`, 1400, 50);

    // Draw chat box
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(1420, 300, 360, 580);
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(1420, 300, 360, 580);

    // Draw chat title
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('Game Chat', 1420, 280);

    // Draw chat messages
    ctx.font = '16px Arial';
    ctx.fillStyle = '#666666';

    if (gameState.aiPlayerCount === null) {
      ctx.fillText('How many AI players?', 1430, 330);

      // Draw AI player selection buttons
      const buttonWidth = 80;
      const buttonHeight = 40;
      const buttonSpacing = 20;
      const startX = 1430;
      const startY = 350;

      [1, 2, 3].forEach((count, index) => {
        const buttonX = startX + index * (buttonWidth + buttonSpacing);

        // Draw button background
        ctx.fillStyle = '#E0E0E0';
        ctx.fillRect(buttonX, startY, buttonWidth, buttonHeight);
        ctx.strokeStyle = '#000000';
        ctx.strokeRect(buttonX, startY, buttonWidth, buttonHeight);

        // Draw button text
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(count.toString(), buttonX + buttonWidth / 2, startY + buttonHeight / 2 + 7);
      });

      // Reset text alignment
      ctx.textAlign = 'left';
    } else {
      ctx.fillText(`Selected ${gameState.aiPlayerCount} AI player(s)`, 1430, 330);
      ctx.fillText('Game is ready to start!', 1430, 360);
    }
  }, [gameState, boardImage]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (gameState.aiPlayerCount !== null) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if click is within AI player selection buttons
    const buttonWidth = 80;
    const buttonHeight = 40;
    const buttonSpacing = 20;
    const startX = 1430;
    const startY = 350;

    [1, 2, 3].forEach((count, index) => {
      const buttonX = startX + index * (buttonWidth + buttonSpacing);
      if (x >= buttonX && x <= buttonX + buttonWidth && y >= startY && y <= startY + buttonHeight) {
        handleAIPlayerSelection(count);
      }
    });
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col items-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Board Game Projection</h1>
        <div className="border-4 border-gray-300 rounded-lg overflow-hidden">
          <canvas
            ref={canvasRef}
            className="w-[960px] h-[540px]" // Half size for display, actual size is 1920x1080
            style={{ imageRendering: 'pixelated' }}
            onClick={handleCanvasClick}
          />
        </div>
      </div>
    </div>
  );
};

export default BoardGame;
