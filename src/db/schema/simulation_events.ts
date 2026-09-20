import {
    integer,
    pgTable,
    text,
    timestamp,
    geometry,
    jsonb,
} from "drizzle-orm/pg-core";

import { simulationRuns } from "./simulation_runs";
import { roads } from "./roads";
import { intersections } from "./intersections";

export const simulationEvents = pgTable("simulation_events", {
    id: integer("id")
        .primaryKey()
        .generatedAlwaysAsIdentity(),

    simulationRunId: integer("simulation_run_id")
        .notNull()
        .references(() => simulationRuns.id, {
            onDelete: "cascade",
        }),

    type: text("type")
        .notNull(),

    roadId: integer("road_id")
        .references(() => roads.id, {
            onDelete: "set null",
        }),

    intersectionId: integer("intersection_id")
        .references(() => intersections.id, {
            onDelete: "set null",
        }),

    location: geometry("location", {
        type: "point",
        srid: 4326,
    }),

    data: jsonb("data"),

    simulationTime: integer("simulation_time")
        .notNull(),

    createdAt: timestamp("created_at", {
        withTimezone: true,
    })
        .defaultNow()
        .notNull(),
});