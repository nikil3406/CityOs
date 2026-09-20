import {
    integer,
    pgTable,
    text,
    timestamp,
} from "drizzle-orm/pg-core";

import { trafficLights } from "./traffic_lights";
import { roads } from "./roads";

export const trafficLightMovements = pgTable(
    "traffic_light_movements",
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

        fromRoadId: integer("from_road_id")
            .notNull()
            .references(
                () => roads.id,
                {
                    onDelete: "cascade",
                },
            ),

        toRoadId: integer("to_road_id")
            .notNull()
            .references(
                () => roads.id,
                {
                    onDelete: "cascade",
                },
            ),

        state: text("state")
            .notNull(),

        createdAt: timestamp("created_at", {
            withTimezone: true,
        })
            .defaultNow()
            .notNull(),
    },
);