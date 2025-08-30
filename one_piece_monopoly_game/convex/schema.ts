import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
  games: defineTable({
    hostId: v.id("users"),
    status: v.union(v.literal("waiting"), v.literal("playing"), v.literal("finished")),
    currentPlayerIndex: v.number(),
    turnPhase: v.union(
      v.literal("rolling"),
      v.literal("moving"),
      v.literal("action"),
      v.literal("buying"),
      v.literal("paying")
    ),
    diceRoll: v.optional(v.array(v.number())),
    winner: v.optional(v.string()),
    round: v.number(),
  }),
  
  players: defineTable({
    gameId: v.id("games"),
    name: v.string(),
    isAI: v.boolean(),
    aiDifficulty: v.optional(v.union(v.literal("easy"), v.literal("medium"), v.literal("hard"))),
    position: v.number(),
    money: v.number(),
    isInJail: v.boolean(),
    jailTurns: v.number(),
    isBankrupt: v.boolean(),
    order: v.number(),
  }).index("by_game", ["gameId"]),
  
  properties: defineTable({
    gameId: v.id("games"),
    spaceId: v.number(),
    ownerId: v.optional(v.id("players")),
    houses: v.number(),
    hasHotel: v.boolean(),
    isMortgaged: v.boolean(),
  }).index("by_game", ["gameId"]).index("by_game_and_space", ["gameId", "spaceId"]),
  
  gameLog: defineTable({
    gameId: v.id("games"),
    message: v.string(),
    playerId: v.optional(v.id("players")),
    timestamp: v.number(),
  }).index("by_game", ["gameId"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
