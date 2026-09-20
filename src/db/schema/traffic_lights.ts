import {
    integer,
    pgTable,
    text,
    timestamp,
} from "drizzle-orm/pg-core";

import { cities } from "./cities";
import { intersections } from "./intersections";

export const trafficLights = pgTable("traffic_lights", {
    id: integer("id")
        .primaryKey()
        .generatedAlwaysAsIdentity(),

    cityId: integer("city_id")
        .notNull()
        .references(() => cities.id, {
            onDelete: "cascade",
        }),

    intersectionId: integer("intersection_id")
        .notNull()
        .references(() => intersections.id, {
            onDelete: "cascade",
        }),

    cycleDuration: integer("cycle_duration")
        .notNull()
        .default(46),

    currentPhase: integer("current_phase")
        .notNull()
        .default(1),

    phaseElapsed: integer("phase_elapsed")
        .notNull()
        .default(0),

    status: text("status")
        .notNull()
        .default("ACTIVE"),

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