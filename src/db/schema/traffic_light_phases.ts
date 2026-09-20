import {
    integer,
    pgTable,
    text,
    timestamp,
} from "drizzle-orm/pg-core";

import { trafficLights } from "./traffic_lights";

export const trafficLightPhases = pgTable(
    "traffic_light_phases",
    {
        id: integer("id")
            .primaryKey()
            .generatedAlwaysAsIdentity(),

        trafficLightId: integer("traffic_light_id")
            .notNull()
            .references(
                () => trafficLights.id,
                {
                    onDelete: "cascade",
                },
            ),

        phaseNumber: integer("phase_number")
            .notNull(),

        durationSeconds: integer("duration_seconds")
            .notNull(),

        state: text("state")
            .notNull(),

        createdAt: timestamp("created_at", {
            withTimezone: true,
        })
            .defaultNow()
            .notNull(),
    },
);