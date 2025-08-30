import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { useState } from "react";
import { toast } from "sonner";

interface GameBoardProps {
  gameId: string;
  onLeaveGame: () => void;
}

const SPACE_COLORS = {
  brown: "bg-amber-800",
  lightblue: "bg-sky-300",
  pink: "bg-pink-400",
  orange: "bg-orange-500",
  red: "bg-red-500",
  yellow: "bg-yellow-400",
  green: "bg-green-500",
  blue: "bg-blue-600",
};

export function GameBoard({ gameId, onLeaveGame }: GameBoardProps) {
  const game = useQuery(api.game.getGame, { gameId: gameId as Id<"games"> });
  const rollDice = useMutation(api.game.rollDice);
  const buyProperty = useMutation(api.game.buyProperty);
  const skipBuying = useMutation(api.game.skipBuying);

  if (!game) {
    return (
      <div className="flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  const currentPlayer = game.players[game.currentPlayerIndex];
  const isMyTurn = currentPlayer && !currentPlayer.isAI;
  const canRoll = isMyTurn && game.turnPhase === "rolling";
  const canBuy = isMyTurn && game.turnPhase === "buying";

  const handleRollDice = async () => {
    try {
      await rollDice({ gameId: gameId as Id<"games"> });
    } catch (error) {
      toast.error("Failed to roll dice");
    }
  };

  const handleBuyProperty = async () => {
    try {
      await buyProperty({ gameId: gameId as Id<"games"> });
    } catch (error) {
      toast.error("Failed to buy property");
    }
  };

  const handleSkipBuying = async () => {
    try {
      await skipBuying({ gameId: gameId as Id<"games"> });
    } catch (error) {
      toast.error("Failed to skip buying");
    }
  };

  const getPlayerAtPosition = (position: number) => {
    return game.players.filter(p => p.position === position);
  };

  const renderSpace = (space: any, index: number) => {
    const playersHere = getPlayerAtPosition(index);
    const property = game.properties.find(p => p.spaceId === index);
    const isOwned = property?.ownerId;
    const owner = isOwned ? game.players.find(p => p._id === property.ownerId) : null;

    let spaceClass = "relative border border-gray-400 flex flex-col items-center justify-center text-xs p-1 min-h-[80px]";
    
    if (space.color && SPACE_COLORS[space.color as keyof typeof SPACE_COLORS]) {
      spaceClass += ` ${SPACE_COLORS[space.color as keyof typeof SPACE_COLORS]}`;
    } else {
      spaceClass += " bg-gray-200";
    }

    // Special positioning for corner spaces
    if ([0, 10, 20, 30].includes(index)) {
      spaceClass += " min-h-[100px] min-w-[100px]";
    }

    return (
      <div key={index} className={spaceClass}>
        <div className="text-center font-semibold text-black">
          {space.name}
        </div>
        {space.price > 0 && (
          <div className="text-xs text-black">
            ${space.price}
          </div>
        )}
        {owner && (
          <div className="absolute top-0 right-0 w-3 h-3 bg-blue-500 rounded-full" title={`Owned by ${owner.name}`}></div>
        )}
        {playersHere.length > 0 && (
          <div className="absolute bottom-1 left-1 flex flex-wrap gap-1">
            {playersHere.map((player, i) => (
              <div
                key={player._id}
                className={`w-4 h-4 rounded-full border-2 border-white ${
                  player.isAI ? "bg-red-500" : "bg-blue-500"
                }`}
                title={player.name}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderBoard = () => {
    const topRow = game.boardSpaces.slice(20, 31).reverse();
    const rightCol = game.boardSpaces.slice(11, 20).reverse();
    const bottomRow = game.boardSpaces.slice(0, 11);
    const leftCol = game.boardSpaces.slice(31, 40);

    return (
      <div className="grid grid-cols-11 grid-rows-11 gap-0 bg-green-800 p-4 rounded-lg border-4 border-yellow-600">
        {/* Top row */}
        {topRow.map((space, i) => (
          <div key={`top-${i}`} className="col-span-1 row-span-1">
            {renderSpace(space, space.id)}
          </div>
        ))}
        
        {/* Right column */}
        {rightCol.map((space, i) => (
          <div key={`right-${i}`} className="col-start-11 row-span-1" style={{ gridRow: i + 2 }}>
            {renderSpace(space, space.id)}
          </div>
        ))}
        
        {/* Bottom row */}
        {bottomRow.map((space, i) => (
          <div key={`bottom-${i}`} className="row-start-11" style={{ gridColumn: 11 - i }}>
            {renderSpace(space, space.id)}
          </div>
        ))}
        
        {/* Left column */}
        {leftCol.map((space, i) => (
          <div key={`left-${i}`} className="col-start-1" style={{ gridRow: 10 - i }}>
            {renderSpace(space, space.id)}
          </div>
        ))}
        
        {/* Center area */}
        <div className="col-span-9 row-span-9 col-start-2 row-start-2 bg-green-700 rounded-lg flex flex-col items-center justify-center p-4">
          <h2 className="text-4xl font-bold text-yellow-400 mb-4">🏴‍☠️</h2>
          <h3 className="text-2xl font-bold text-white mb-2">ONE PIECE</h3>
          <h4 className="text-xl font-bold text-yellow-400">MONOPOLY</h4>
          
          {game.diceRoll && (
            <div className="mt-4 flex gap-2">
              <div className="w-8 h-8 bg-white rounded border-2 border-black flex items-center justify-center font-bold">
                {game.diceRoll[0]}
              </div>
              <div className="w-8 h-8 bg-white rounded border-2 border-black flex items-center justify-center font-bold">
                {game.diceRoll[1]}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Game Board */}
        <div className="lg:col-span-3">
          {renderBoard()}
        </div>
        
        {/* Game Info Panel */}
        <div className="space-y-4">
          {/* Current Turn */}
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
            <h3 className="text-lg font-bold text-white mb-2">Current Turn</h3>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-4 h-4 rounded-full ${currentPlayer?.isAI ? "bg-red-500" : "bg-blue-500"}`}></div>
              <span className="text-white font-semibold">{currentPlayer?.name}</span>
            </div>
            <p className="text-white/70 text-sm">Phase: {game.turnPhase}</p>
            
            {canRoll && (
              <button
                onClick={handleRollDice}
                className="w-full mt-3 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded transition-colors"
              >
                🎲 Roll Dice
              </button>
            )}
            
            {canBuy && (
              <div className="mt-3 space-y-2">
                <button
                  onClick={handleBuyProperty}
                  className="w-full px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-bold rounded transition-colors"
                >
                  💰 Buy Property
                </button>
                <button
                  onClick={handleSkipBuying}
                  className="w-full px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white font-bold rounded transition-colors"
                >
                  ⏭️ Skip
                </button>
              </div>
            )}
          </div>
          
          {/* Players */}
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
            <h3 className="text-lg font-bold text-white mb-3">Players</h3>
            <div className="space-y-2">
              {game.players.map((player) => (
                <div key={player._id} className="flex items-center justify-between p-2 bg-white/5 rounded">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${player.isAI ? "bg-red-500" : "bg-blue-500"}`}></div>
                    <span className="text-white text-sm font-medium">{player.name}</span>
                  </div>
                  <span className="text-yellow-400 text-sm font-bold">{player.money}B</span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Game Log */}
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
            <h3 className="text-lg font-bold text-white mb-3">Game Log</h3>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {game.logs.map((log, index) => (
                <div key={index} className="text-white/80 text-xs p-1 bg-white/5 rounded">
                  {log.message}
                </div>
              ))}
            </div>
          </div>
          
          {/* Leave Game */}
          <button
            onClick={onLeaveGame}
            className="w-full px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded transition-colors"
          >
            🚪 Leave Game
          </button>
        </div>
      </div>
    </div>
  );
}
