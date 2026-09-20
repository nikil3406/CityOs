import {
    integer,
    pgTable,
    real,
    text,
    timestamp,
    geometry,
} from "drizzle-orm/pg-core";

import { roadSegments } from "./road_segments";
import { simulationRuns } from "./simulation_runs";
import { roads } from "./roads";
import { intersections } from "./intersections";

export const vehicles = pgTable("vehicles", {
    id: integer("id")
        .primaryKey()
        .generatedAlwaysAsIdentity(),

    simulationRunId: integer("simulation_run_id")
        .notNull()
        .references(() => simulationRuns.id, {
            onDelete: "cascade",
        }),

    currentRoadId: integer("current_road_id")
        .references(() => roads.id, {
            onDelete: "set null",
        }),

    destinationIntersectionId: integer("destination_intersection_id")
        .references(() => intersections.id, {
            onDelete: "set null",
        }),

    position: geometry("position", {
        type: "point",
        srid: 4326,
    }).notNull(),

    routeSequence: integer("route_sequence")
    .notNull()
    .default(0),

    speedKmh: real("speed_kmh")
        .notNull()
        .default(0),

    status: text("status")
        .notNull()
        .default("WAITING"),

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
    
    progress: real("progress").notNull().default(0),

    currentSegmentId: integer("current_segment_id")
    .references(
        () => roadSegments.id,
        { onDelete: "set null" },
    ),
});