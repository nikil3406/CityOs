import {
    integer,
    pgTable,
    text,
    timestamp,
    geometry,
    real,
} from "drizzle-orm/pg-core";

import { cities } from "./cities";
import { intersections } from "./intersections";

export const roads = pgTable("roads", {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),

    cityId: integer("city_id")
        .notNull()
        .references(() => cities.id, {
            onDelete: "cascade",
        }),

    name: text("name").notNull(),

    sourceId: text("source_id").unique(),

    startIntersectionId: integer("start_intersection_id").references(
        () => intersections.id,
        {
            onDelete: "cascade",
        },
    ),

    endIntersectionId: integer("end_intersection_id").references(
        () => intersections.id,
        {
            onDelete: "cascade",
        },
    ),

    type: text("type"),

    width: real("width"),

    geometry: geometry("geometry", {
        type: "linestring",
        srid: 4326,
    }).notNull(),

    lengthMeters: integer("length_meters").notNull(),

    speedLimitKmh: integer("speed_limit_kmh"),

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