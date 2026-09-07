import {
    integer,
    pgTable,
    text,
    timestamp,
    geometry,
} from "drizzle-orm/pg-core";

export const cities = pgTable("cities", {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),

    name: text("name").notNull(),

    country: text("country").notNull(),

    center: geometry("center", {
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