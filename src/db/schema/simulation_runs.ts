import {
    integer,
    pgTable,
    text,
    timestamp,
} from "drizzle-orm/pg-core";

import { cities } from "./cities";

export const simulationRuns = pgTable("simulation_runs", {
    id: integer("id")
        .primaryKey()
        .generatedAlwaysAsIdentity(),

    cityId: integer("city_id")
        .notNull()
        .references(() => cities.id, {
            onDelete: "cascade",
        }),

    status: text("status")
        .notNull()
        .default("CREATED"),

    simulationTime: integer("simulation_time")
        .notNull()
        .default(0),

    startedAt: timestamp("started_at", {
        withTimezone: true,
    }),

    endedAt: timestamp("ended_at", {
        withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
        withTimezone: true,
    })
        .defaultNow()
        .notNull(),

    updatedAt: timestamp("updated_at", {
        withTimezone: true,
    })
        .defaultNow()
        .notNull(),
});