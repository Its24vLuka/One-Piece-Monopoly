import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";
import { Toaster } from "sonner";
import { GameSetup } from "./GameSetup";
import { GameBoard } from "./GameBoard";
import { useState } from "react";

export default function App() {
  const [gameId, setGameId] = useState<string | null>(null);
  const loggedInUser = useQuery(api.auth.loggedInUser);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900">
      <header className="sticky top-0 z-10 bg-black/20 backdrop-blur-sm h-16 flex justify-between items-center border-b border-white/10 shadow-sm px-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          🏴‍☠️ One Piece Monopoly
        </h2>
        <Authenticated>
          <div className="flex items-center gap-4">
            <span className="text-white/80">Welcome, {loggedInUser?.name || loggedInUser?.email}</span>
            <SignOutButton />
          </div>
        </Authenticated>
      </header>
      
      <main className="flex-1 flex items-center justify-center p-4">
        <Authenticated>
          {gameId ? (
            <GameBoard gameId={gameId} onLeaveGame={() => setGameId(null)} />
          ) : (
            <GameSetup onGameCreated={setGameId} />
          )}
        </Authenticated>
        
        <Unauthenticated>
          <div className="w-full max-w-md mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-5xl font-bold text-white mb-4">🏴‍☠️</h1>
              <h2 className="text-3xl font-bold text-white mb-2">One Piece Monopoly</h2>
              <p className="text-xl text-white/80">Set sail for the Grand Line!</p>
            </div>
            <SignInForm />
          </div>
        </Unauthenticated>
      </main>
      
      <Toaster />
    </div>
  );
}
