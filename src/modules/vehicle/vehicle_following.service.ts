import {
    and,
    eq,
    gt,
    or,
    sql,
} from "drizzle-orm";

import { db } from "@/db";

import {
    vehicles,
    vehicleRoutes,
} from "@/db/schema";

import { SimulationConfig } from "@/lib/constants";

export type VehicleAheadResult = {
    vehicleId: number;
    distanceMeters: number;
    speedKmh: number;
    shouldStop: boolean;
    shouldSlowDown: boolean;
} | null;

export async function checkVehicleAhead(
    vehicleId: number,
    simulationRunId: number,
    currentSegmentId: number,
    segmentLengthMeters: number,
    currentProgress: number,
    speedKmh: number,
    currentIsReverse: boolean,
): Promise<VehicleAheadResult> {
    const rows = await db
        .select({
            vehicleId:
                vehicles.id,

            progress:
                vehicles.progress,

            speedKmh:
                vehicles.speedKmh,
        })
        .from(vehicles)
        .innerJoin(
            vehicleRoutes,
            and(
                eq(
                    vehicleRoutes.vehicleId,
                    vehicles.id,
                ),

                eq(
                    vehicleRoutes.sequence,
                    vehicles.routeSequence,
                ),
            ),
        )
        .where(
            and(
                eq(
                    vehicles.simulationRunId,
                    simulationRunId,
                ),

                eq(
                    vehicles.currentSegmentId,
                    currentSegmentId,
                ),

                eq(
                    vehicleRoutes.isReverse,
                    currentIsReverse,
                ),

                /*
                 * A vehicle that has already completed
                 * its route is no longer part of traffic.
                 *
                 * Without this condition, a completed
                 * vehicle at progress = 1 can remain in
                 * the following query and permanently
                 * block a vehicle behind it.
                 */
                sql`
                    ${vehicles.status}
                    IN (
                        'WAITING',
                        'WAITING_AT_SIGNAL'
                    )
                `,

                sql`${vehicles.id} <> ${vehicleId}`,

                /*
                 * A vehicle is ahead when it has greater
                 * traversal progress.
                 *
                 * If two active vehicles are initialized
                 * at exactly the same progress, use the
                 * vehicle ID only as a deterministic
                 * collision-resolution rule.
                 *
                 * Completed vehicles are already excluded
                 * above, so they can never block a vehicle.
                 */
                or(
                    gt(
                        vehicles.progress,
                        currentProgress,
                    ),

                    and(
                        eq(
                            vehicles.progress,
                            currentProgress,
                        ),

                        gt(
                            vehicles.id,
                            vehicleId,
                        ),
                    ),
                ),
            ),
        )
        .orderBy(
            vehicles.progress,
        )
        .limit(1);

    if (rows.length === 0) {
        return null;
    }

    const vehicleAhead =
        rows[0];

    const progressDifference =
        Number(
            vehicleAhead.progress,
        ) -
        currentProgress;

    const distanceMeters =
        Math.max(
            0,
            progressDifference *
            segmentLengthMeters,
        );

    const safeDistanceMeters =
        SimulationConfig.vehicleFollowing
            .safeDistanceMeters;

    const detectionDistanceMeters =
        SimulationConfig.vehicleFollowing
            .detectionDistanceMeters;

    const shouldStop =
        distanceMeters <=
        safeDistanceMeters;

    const shouldSlowDown =
        distanceMeters <=
            detectionDistanceMeters &&
        !shouldStop;

    return {
        vehicleId:
            Number(
                vehicleAhead.vehicleId,
            ),

        distanceMeters,

        speedKmh:
            Number(
                vehicleAhead.speedKmh,
            ),

        shouldStop,

        shouldSlowDown,
    };
}
