import {
    integer,
    pgTable,
    real,
    timestamp,
    geometry,
} from "drizzle-orm/pg-core";

import { roads } from "./roads";
import { intersections } from "./intersections";

export const roadSegments = pgTable("road_segments", {
    id: integer("id")
        .primaryKey()
        .generatedAlwaysAsIdentity(),

    roadId: integer("road_id")
        .notNull()
        .references(() => roads.id, {
            onDelete: "cascade",
        }),

    startIntersectionId: integer("start_intersection_id")
        .notNull()
        .references(() => intersections.id, {
            onDelete: "cascade",
        }),

    endIntersectionId: integer("end_intersection_id")
        .notNull()
        .references(() => intersections.id, {
            onDelete: "cascade",
        }),

    sequence: integer("sequence").notNull(),

    geometry: geometry("geometry", {
        type: "linestring",
        srid: 4326,
    }).notNull(),

    lengthMeters: real("length_meters").notNull(),

    speedLimitKmh: integer("speed_limit_kmh"),

    createdAt: timestamp("created_at", {
        withTimezone: true,
    }).defaultNow().notNull(),

    updatedAt: timestamp("updated_at", {
        withTimezone: true,
    }).defaultNow().notNull(),
});