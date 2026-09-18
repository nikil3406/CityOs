import "dotenv/config";

import fs from "fs";
import path from "path";
import postgres from "postgres";

import {
    integer,
    pgTable,
    real,
    timestamp,
    geometry,
} from "drizzle-orm/pg-core";

import { cities } from "./cities";

export const trees = pgTable("trees", {
    id: integer("id")
        .primaryKey()
        .generatedAlwaysAsIdentity(),

    cityId: integer("city_id")
        .notNull()
        .references(() => cities.id, {
            onDelete: "cascade",
        }),

    height: real("height"),

    crownDiameter: real("crown_diameter"),

    location: geometry("location", {
        type: "point",
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