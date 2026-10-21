import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  boolean,
  numeric,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * Snapshot de uma análise de canal Twitch.
 * Guardado pelo tracker a cada ciclo bem-sucedido (com throttle no cliente),
 * alimenta as estatísticas da landing: scans recentes + leaderboard de bots.
 */
export const scans = pgTable(
  "scans",
  {
    id: serial("id").primaryKey(),
    channel: varchar("channel", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 128 }).notNull().default(""),
    avatarUrl: text("avatar_url").notNull().default(""),
    isLive: boolean("is_live").notNull().default(false),
    streamViewers: integer("stream_viewers").notNull().default(0),
    trackedViewers: integer("tracked_viewers").notNull().default(0),
    authenticatedUsers: integer("authenticated_users").notNull().default(0),
    suspectedBots: integer("suspected_bots").notNull().default(0),
    botPercentage: numeric("bot_percentage", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),
    baseline: numeric("baseline", { precision: 8, scale: 2 })
      .notNull()
      .default("0"),
    spikeMonths: jsonb("spike_months").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("scans_channel_idx").on(table.channel),
    index("scans_created_at_idx").on(table.createdAt),
  ],
);

export type ScanRow = typeof scans.$inferSelect;
export type NewScanRow = typeof scans.$inferInsert;
