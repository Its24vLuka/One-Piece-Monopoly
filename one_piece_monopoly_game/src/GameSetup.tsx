import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { toast } from "sonner";

const AI_CHARACTERS = [
  { name: "Monkey D. Luffy", difficulty: "easy" as const, description: "Reckless and impulsive" },
  { name: "Roronoa Zoro", difficulty: "medium" as const, description: "Steady and reliable" },
  { name: "Nami", difficulty: "hard" as const, description: "Money-focused strategist" },
  { name: "Sanji", difficulty: "medium" as const, description: "Balanced approach" },
  { name: "Tony Tony Chopper", difficulty: "easy" as const, description: "Innocent and trusting" },
  { name: "Nico Robin", difficulty: "hard" as const, description: "Calculating and strategic" },
  { name: "Franky", difficulty: "medium" as const, description: "Bold but thoughtful" },
  { name: "Brook", difficulty: "easy" as const, description: "Carefree and lucky" },
];

interface GameSetupProps {
  onGameCreated: (gameId: string) => void;
}

export function GameSetup({ onGameCreated }: GameSetupProps) {
  const [selectedAI, setSelectedAI] = useState<string[]>([]);
  const createGame = useMutation(api.game.createGame);

  const handleAIToggle = (characterName: string) => {
    setSelectedAI(prev => 
      prev.includes(characterName)
        ? prev.filter(name => name !== characterName)
        : [...prev, characterName]
    );
  };

  const handleStartGame = async () => {
    if (selectedAI.length === 0) {
      toast.error("Please select at least one AI opponent!");
      return;
    }

    try {
      const aiPlayers = selectedAI.map(name => {
        const character = AI_CHARACTERS.find(c => c.name === name)!;
        return {
          name: character.name,
          difficulty: character.difficulty
        };
      });

      const gameId = await createGame({ aiPlayers });
      onGameCreated(gameId);
      toast.success("Game created! Let the adventure begin!");
    } catch (error) {
      toast.error("Failed to create game");
      console.error(error);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="bg-white/10 backdrop-blur-sm rounded-lg p-8 border border-white/20">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Set Up Your Crew</h2>
          <p className="text-white/80">Choose your AI opponents to sail the Grand Line with you!</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {AI_CHARACTERS.map((character) => (
            <div
              key={character.name}
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                selectedAI.includes(character.name)
                  ? "border-yellow-400 bg-yellow-400/20"
                  : "border-white/20 bg-white/5 hover:bg-white/10"
              }`}
              onClick={() => handleAIToggle(character.name)}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-white">{character.name}</h3>
                <span className={`px-2 py-1 rounded text-xs font-semibold ${
                  character.difficulty === "easy" 
                    ? "bg-green-500/20 text-green-300"
                    : character.difficulty === "medium"
                    ? "bg-yellow-500/20 text-yellow-300"
                    : "bg-red-500/20 text-red-300"
                }`}>
                  {character.difficulty.toUpperCase()}
                </span>
              </div>
              <p className="text-white/70 text-sm">{character.description}</p>
            </div>
          ))}
        </div>

        <div className="text-center">
          <p className="text-white/60 mb-4">
            Selected: {selectedAI.length} / {AI_CHARACTERS.length} crew members
          </p>
          <button
            onClick={handleStartGame}
            disabled={selectedAI.length === 0}
            className="px-8 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold rounded-lg hover:from-yellow-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            🏴‍☠️ Start Adventure!
          </button>
        </div>
      </div>
    </div>
  );
}
