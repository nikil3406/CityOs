import {
    integer,
    pgTable,
    real,
    timestamp,
    geometry,
} from "drizzle-orm/pg-core";

import { cities } from "./cities";

export const buildings = pgTable("buildings", {
    id: integer("id")
        .primaryKey()
        .generatedAlwaysAsIdentity(),

    cityId: integer("city_id")
        .notNull()
        .references(() => cities.id, {
            onDelete: "cascade",
        }),

    height: real("height"),

    minHeight: real("min_height"),

    geometry: geometry("geometry", {
        type: "multipolygon",
        srid: 4326,
    }).notNull(),

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