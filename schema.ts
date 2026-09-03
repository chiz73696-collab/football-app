import {
  boolean,
  integer,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const predictions = pgTable("predictions", {
  id: serial("id").primaryKey(),
  matchDate: text("match_date"),
  matchTime: text("match_time"),
  league: text("league"),
  homeTeam: text("home_team"),
  awayTeam: text("away_team"),
  tip: text("tip"),
  confidenceScore: real("confidence_score").default(0),
  isTopPick: boolean("is_top_pick").default(false),
  pickRank: integer("pick_rank"),
  reasoning: text("reasoning"),
  scrapedAt: timestamp("scraped_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Prediction = typeof predictions.$inferSelect;
export type NewPrediction = typeof predictions.$inferInsert;
