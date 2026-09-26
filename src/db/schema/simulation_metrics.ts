import {
    integer,
    real,
    timestamp,
    pgTable,
} from "drizzle-orm/pg-core";

import { simulationRuns } from "./simulation_runs";

export const simulationMetrics = pgTable("simulation_metrics", {
    id: integer("id")
        .primaryKey()
        .generatedAlwaysAsIdentity(),

    simulationRunId: integer("simulation_run_id")
        .notNull()
        .references(() => simulationRuns.id, {
            onDelete: "cascade",
        }),

    simulationTime: integer("simulation_time")
        .notNull(),

    totalVehicles: integer("total_vehicles")
        .notNull()
        .default(0),

    activeVehicles: integer("active_vehicles")
        .notNull()
        .default(0),

    completedVehicles: integer("completed_vehicles")
        .notNull()
        .default(0),

    waitingVehicles: integer("waiting_vehicles")
        .notNull()
        .default(0),

    signalWaitingVehicles: integer("signal_waiting_vehicles")
        .notNull()
        .default(0),

    averageSpeedKmh: real("average_speed_kmh")
        .notNull()
        .default(0),

    averageTravelTimeSeconds: real("average_travel_time_seconds")
        .notNull()
        .default(0),

    activeQueues: integer("active_queues")
        .notNull()
        .default(0),

    maximumQueueVehicles: integer("maximum_queue_vehicles")
        .notNull()
        .default(0),

    averageQueueLengthMeters: real("average_queue_length_meters")
        .notNull()
        .default(0),

    totalDistanceMeters: real("total_distance_meters")
        .notNull()
        .default(0),

    createdAt: timestamp("created_at", {
        withTimezone: true,
    })
        .defaultNow()
        .notNull(),
});