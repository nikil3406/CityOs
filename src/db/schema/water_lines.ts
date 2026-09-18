import {
    integer,
    pgTable,
    timestamp,
    geometry,
} from "drizzle-orm/pg-core";

import { cities } from "./cities";

export const waterLines = pgTable("water_lines", {
    id: integer("id")
        .primaryKey()
        .generatedAlwaysAsIdentity(),

    cityId: integer("city_id")
        .notNull()
        .references(() => cities.id, {
            onDelete: "cascade",
        }),

    geometry: geometry("geometry", {
        type: "multilinestring",
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