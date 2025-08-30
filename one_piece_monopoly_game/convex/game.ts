import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { BOARD_SPACES, AI_CHARACTERS, CHANCE_CARDS, COMMUNITY_CHEST_CARDS } from "./gameData";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

export const createGame = mutation({
  args: {
    aiPlayers: v.array(v.object({
      name: v.string(),
      difficulty: v.union(v.literal("easy"), v.literal("medium"), v.literal("hard"))
    }))
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be logged in");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    const gameId = await ctx.db.insert("games", {
      hostId: userId,
      status: "waiting",
      currentPlayerIndex: 0,
      turnPhase: "rolling",
      round: 1,
    });

    // Create human player
    await ctx.db.insert("players", {
      gameId,
      name: user.name || user.email || "Player",
      isAI: false,
      position: 0,
      money: 1500,
      isInJail: false,
      jailTurns: 0,
      isBankrupt: false,
      order: 0,
    });

    // Create AI players
    for (let i = 0; i < args.aiPlayers.length; i++) {
      await ctx.db.insert("players", {
        gameId,
        name: args.aiPlayers[i].name,
        isAI: true,
        aiDifficulty: args.aiPlayers[i].difficulty,
        position: 0,
        money: 1500,
        isInJail: false,
        jailTurns: 0,
        isBankrupt: false,
        order: i + 1,
      });
    }

    // Initialize properties
    for (const space of BOARD_SPACES) {
      if (space.type === "property" || space.type === "railroad" || space.type === "utility") {
        await ctx.db.insert("properties", {
          gameId,
          spaceId: space.id,
          houses: 0,
          hasHotel: false,
          isMortgaged: false,
        });
      }
    }

    await ctx.db.patch(gameId, { status: "playing" });
    
    await ctx.db.insert("gameLog", {
      gameId,
      message: "Game started! Roll the dice to begin.",
      timestamp: Date.now(),
    });

    return gameId;
  },
});

export const getGame = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) return null;

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q: any) => q.eq("gameId", args.gameId))
      .collect();

    const properties = await ctx.db
      .query("properties")
      .withIndex("by_game", (q: any) => q.eq("gameId", args.gameId))
      .collect();

    const logs = await ctx.db
      .query("gameLog")
      .withIndex("by_game", (q: any) => q.eq("gameId", args.gameId))
      .order("desc")
      .take(10);

    return {
      ...game,
      players: players.sort((a, b) => a.order - b.order),
      properties,
      logs: logs.reverse(),
      boardSpaces: BOARD_SPACES,
    };
  },
});

export const rollDice = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be logged in");

    const game = await ctx.db.get(args.gameId);
    if (!game || game.status !== "playing") throw new Error("Game not found or not playing");

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q: any) => q.eq("gameId", args.gameId))
      .collect();

    const sortedPlayers = players.sort((a, b) => a.order - b.order);
    const currentPlayer = sortedPlayers[game.currentPlayerIndex];

    if (currentPlayer.isAI || game.turnPhase !== "rolling") {
      throw new Error("Not your turn or wrong phase");
    }

    const dice1 = Math.floor(Math.random() * 6) + 1;
    const dice2 = Math.floor(Math.random() * 6) + 1;
    const total = dice1 + dice2;

    await ctx.db.patch(args.gameId, {
      diceRoll: [dice1, dice2],
      turnPhase: "moving",
    });

    await ctx.db.insert("gameLog", {
      gameId: args.gameId,
      playerId: currentPlayer._id,
      message: `${currentPlayer.name} rolled ${dice1} + ${dice2} = ${total}`,
      timestamp: Date.now(),
    });

    // Move player
    const newPosition = (currentPlayer.position + total) % 40;
    let moneyChange = 0;

    // Check if passed GO
    if (newPosition < currentPlayer.position) {
      moneyChange += 200;
      await ctx.db.insert("gameLog", {
        gameId: args.gameId,
        playerId: currentPlayer._id,
        message: `${currentPlayer.name} passed GO and collected 200 Berries!`,
        timestamp: Date.now(),
      });
    }

    await ctx.db.patch(currentPlayer._id, {
      position: newPosition,
      money: currentPlayer.money + moneyChange,
    });

    // Handle landing on space
    await handleSpaceLanding(ctx, args.gameId, currentPlayer._id, newPosition);
  },
});

async function handleSpaceLanding(ctx: any, gameId: any, playerId: any, position: number) {
  const space = BOARD_SPACES[position];
  const player = await ctx.db.get(playerId);
  
  await ctx.db.insert("gameLog", {
    gameId,
    playerId,
    message: `${player.name} landed on ${space.name}`,
    timestamp: Date.now(),
  });

  switch (space.type) {
    case "property":
    case "railroad":
    case "utility":
      const property = await ctx.db
        .query("properties")
        .withIndex("by_game_and_space", (q: any) => q.eq("gameId", gameId).eq("spaceId", position))
        .unique();

      if (!property?.ownerId) {
        await ctx.db.patch(gameId, { turnPhase: "buying" });
      } else if (property.ownerId !== playerId && !property.isMortgaged) {
        const rent = calculateRent(space, property, gameId, ctx);
        await ctx.db.patch(gameId, { turnPhase: "paying" });
        await ctx.db.insert("gameLog", {
          gameId,
          playerId,
          message: `${player.name} must pay ${rent} Berries rent`,
          timestamp: Date.now(),
        });
      } else {
        await endTurn(ctx, gameId);
      }
      break;
    
    case "tax":
      const taxAmount = space.rent[0];
      await ctx.db.patch(playerId, {
        money: Math.max(0, player.money - taxAmount),
      });
      await ctx.db.insert("gameLog", {
        gameId,
        playerId,
        message: `${player.name} paid ${taxAmount} Berries in taxes`,
        timestamp: Date.now(),
      });
      await endTurn(ctx, gameId);
      break;
    
    case "gotojail":
      await ctx.db.patch(playerId, {
        position: 10,
        isInJail: true,
        jailTurns: 0,
      });
      await ctx.db.insert("gameLog", {
        gameId,
        playerId,
        message: `${player.name} was sent to Impel Down!`,
        timestamp: Date.now(),
      });
      await endTurn(ctx, gameId);
      break;
    
    default:
      await endTurn(ctx, gameId);
      break;
  }
}

function calculateRent(space: any, property: any, gameId: any, ctx: any): number {
  if (space.type === "utility") {
    // Utility rent is 4x or 10x dice roll based on ownership
    return 50; // Simplified for now
  } else if (space.type === "railroad") {
    // Railroad rent based on number owned
    return space.rent[0]; // Simplified for now
  } else {
    // Property rent based on houses/hotels
    const rentIndex = property.hasHotel ? 5 : property.houses;
    return space.rent[rentIndex];
  }
}

export const buyProperty = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be logged in");

    const game = await ctx.db.get(args.gameId);
    if (!game || game.turnPhase !== "buying") throw new Error("Cannot buy property now");

    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q: any) => q.eq("gameId", args.gameId))
      .collect();

    const currentPlayer = players.sort((a, b) => a.order - b.order)[game.currentPlayerIndex];
    if (currentPlayer.isAI) throw new Error("Not your turn");

    const space = BOARD_SPACES[currentPlayer.position];
    const property = await ctx.db
      .query("properties")
      .withIndex("by_game_and_space", (q: any) => q.eq("gameId", args.gameId).eq("spaceId", currentPlayer.position))
      .unique();

    if (currentPlayer.money < space.price) {
      throw new Error("Not enough money");
    }

    if (!property) throw new Error("Property not found");

    await ctx.db.patch(property._id, { ownerId: currentPlayer._id });
    await ctx.db.patch(currentPlayer._id, {
      money: currentPlayer.money - space.price,
    });

    await ctx.db.insert("gameLog", {
      gameId: args.gameId,
      playerId: currentPlayer._id,
      message: `${currentPlayer.name} bought ${space.name} for ${space.price} Berries`,
      timestamp: Date.now(),
    });

    await endTurn(ctx, args.gameId);
  },
});

export const skipBuying = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be logged in");

    const game = await ctx.db.get(args.gameId);
    if (!game || game.turnPhase !== "buying") throw new Error("Cannot skip buying now");

    await endTurn(ctx, args.gameId);
  },
});

async function endTurn(ctx: any, gameId: any) {
  const game = await ctx.db.get(gameId);
  const players = await ctx.db
    .query("players")
    .withIndex("by_game", (q: any) => q.eq("gameId", gameId))
    .collect();

  const activePlayers = players.filter((p: any) => !p.isBankrupt);
  const nextPlayerIndex = (game.currentPlayerIndex + 1) % activePlayers.length;

  await ctx.db.patch(gameId, {
    currentPlayerIndex: nextPlayerIndex,
    turnPhase: "rolling",
    diceRoll: undefined,
  });

  // If next player is AI, trigger AI turn
  const nextPlayer = activePlayers.sort((a: any, b: any) => a.order - b.order)[nextPlayerIndex];
  if (nextPlayer.isAI) {
    await ctx.scheduler.runAfter(1000, internal.game.processAITurn, { gameId, playerId: nextPlayer._id });
  }
}

export const processAITurn = internalMutation({
  args: { gameId: v.id("games"), playerId: v.id("players") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    const player = await ctx.db.get(args.playerId);
    
    if (!game || !player || game.status !== "playing") return;

    // AI rolls dice
    const dice1 = Math.floor(Math.random() * 6) + 1;
    const dice2 = Math.floor(Math.random() * 6) + 1;
    const total = dice1 + dice2;

    await ctx.db.patch(args.gameId, {
      diceRoll: [dice1, dice2],
      turnPhase: "moving",
    });

    await ctx.db.insert("gameLog", {
      gameId: args.gameId,
      playerId: args.playerId,
      message: `${player.name} rolled ${dice1} + ${dice2} = ${total}`,
      timestamp: Date.now(),
    });

    // Move AI player
    const newPosition = (player.position + total) % 40;
    let moneyChange = 0;

    if (newPosition < player.position) {
      moneyChange += 200;
      await ctx.db.insert("gameLog", {
        gameId: args.gameId,
        playerId: args.playerId,
        message: `${player.name} passed GO and collected 200 Berries!`,
        timestamp: Date.now(),
      });
    }

    await ctx.db.patch(args.playerId, {
      position: newPosition,
      money: player.money + moneyChange,
    });

    // Handle AI decision making
    await handleAISpaceLanding(ctx, args.gameId, args.playerId, newPosition);
  },
});

async function handleAISpaceLanding(ctx: any, gameId: any, playerId: any, position: number) {
  const space = BOARD_SPACES[position];
  const player = await ctx.db.get(playerId);
  
  await ctx.db.insert("gameLog", {
    gameId,
    playerId,
    message: `${player.name} landed on ${space.name}`,
    timestamp: Date.now(),
  });

  switch (space.type) {
    case "property":
    case "railroad":
    case "utility":
      const property = await ctx.db
        .query("properties")
        .withIndex("by_game_and_space", (q: any) => q.eq("gameId", gameId).eq("spaceId", position))
        .unique();

      if (!property?.ownerId) {
        // AI decides whether to buy based on difficulty
        const shouldBuy = makeAIBuyingDecision(player, space);
        
        if (shouldBuy && player.money >= space.price) {
          await ctx.db.patch(property._id, { ownerId: playerId });
          await ctx.db.patch(playerId, {
            money: player.money - space.price,
          });
          await ctx.db.insert("gameLog", {
            gameId,
            playerId,
            message: `${player.name} bought ${space.name} for ${space.price} Berries`,
            timestamp: Date.now(),
          });
        } else {
          await ctx.db.insert("gameLog", {
            gameId,
            playerId,
            message: `${player.name} decided not to buy ${space.name}`,
            timestamp: Date.now(),
          });
        }
      } else if (property.ownerId !== playerId && !property.isMortgaged) {
        const rent = calculateRent(space, property, gameId, ctx);
        await ctx.db.patch(playerId, {
          money: Math.max(0, player.money - rent),
        });
        await ctx.db.insert("gameLog", {
          gameId,
          playerId,
          message: `${player.name} paid ${rent} Berries rent`,
          timestamp: Date.now(),
        });
      }
      break;
    
    case "tax":
      const taxAmount = space.rent[0];
      await ctx.db.patch(playerId, {
        money: Math.max(0, player.money - taxAmount),
      });
      await ctx.db.insert("gameLog", {
        gameId,
        playerId,
        message: `${player.name} paid ${taxAmount} Berries in taxes`,
        timestamp: Date.now(),
      });
      break;
    
    case "gotojail":
      await ctx.db.patch(playerId, {
        position: 10,
        isInJail: true,
        jailTurns: 0,
      });
      await ctx.db.insert("gameLog", {
        gameId,
        playerId,
        message: `${player.name} was sent to Impel Down!`,
        timestamp: Date.now(),
      });
      break;
  }

  await endTurn(ctx, gameId);
}

function makeAIBuyingDecision(player: any, space: any): boolean {
  const moneyRatio = player.money / 1500; // Ratio of current money to starting money
  
  switch (player.aiDifficulty) {
    case "easy":
      // Easy AI buys randomly, more likely when they have more money
      return Math.random() < (0.3 + moneyRatio * 0.3);
    
    case "medium":
      // Medium AI considers price vs money ratio
      const priceRatio = space.price / player.money;
      return priceRatio < 0.4 && Math.random() < 0.7;
    
    case "hard":
      // Hard AI makes strategic decisions
      const affordabilityRatio = space.price / player.money;
      const rentToPrice = space.rent[0] / space.price;
      return affordabilityRatio < 0.3 && rentToPrice > 0.05 && Math.random() < 0.8;
    
    default:
      return Math.random() < 0.5;
  }
}
