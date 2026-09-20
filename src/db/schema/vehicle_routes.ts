import {
    boolean,
    integer,
    pgTable,
    timestamp,
} from "drizzle-orm/pg-core";

import { vehicles } from "./vehicles";
import { roads } from "./roads";
import { roadSegments } from "./road_segments";

export const vehicleRoutes = pgTable(
    "vehicle_routes",
    {
        id: integer("id")
            .primaryKey()
            .generatedAlwaysAsIdentity(),

        vehicleId: integer("vehicle_id")
            .notNull()
            .references(
                () => vehicles.id,
                { onDelete: "cascade" },
            ),

        roadId: integer("road_id")
            .references(
                () => roads.id,
                { onDelete: "cascade" },
            ),

        segmentId: integer("segment_id")
            .references(
                () => roadSegments.id,
                { onDelete: "cascade" },
            ),

        sequence: integer("sequence")
            .notNull(),

        isReverse: boolean("is_reverse")
            .notNull()
            .default(false),

        createdAt: timestamp(
            "created_at",
            { withTimezone: true },
        ).defaultNow().notNull(),
    },
);