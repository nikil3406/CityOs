import {
    integer,
    pgTable,
    real,
    timestamp,
    geometry,
} from "drizzle-orm/pg-core";

import { cities } from "./cities";

export const contours = pgTable("contours", {
    id: integer("id")
        .primaryKey()
        .generatedAlwaysAsIdentity(),

    cityId: integer("city_id")
        .notNull()
        .references(() => cities.id, {
            onDelete: "cascade",
        }),

    elevation: real("elevation"),

    geometry: geometry("geometry", {
        type: "linestring",
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