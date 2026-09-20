import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
    vehicles,
    roadSegments,
    vehicleRoutes,
} from "@/db/schema";

import { SimulationConfig } from "@/lib/constants";

import {
    getMovementSignal,
} from "@/modules/traffic/traffic_light_movement.service";

type VehicleMovementRow = {
    id: number;
    currentSegmentId: number | null;
    routeSequence: number;
    speedKmh: number;
    progress: number;
    status: string;
    isReverse: boolean | null;
};

/*
 * Get the remaining physical distance from the vehicle
 * to the end of the current segment.
 *
 * `progress` is logical traversal progress:
 *
 *     0 → vehicle just entered segment
 *     1 → vehicle reached end of segment
 *
 * This is true for BOTH forward and reverse traversal.
 *
 * Geometry direction is handled separately by isReverse.
 */
function getRemainingDistanceToIntersection(
    segmentLengthMeters: number,
    progress: number,
): number {
    return (
        segmentLengthMeters *
        (1 - progress)
    );
}

/*
 * Get the route entry immediately after the
 * vehicle's current route sequence.
 */
async function getNextRoute(
    vehicleId: number,
    currentRouteSequence: number,
) {
    const rows = await db
        .select({
            segmentId:
                vehicleRoutes.segmentId,

            sequence:
                vehicleRoutes.sequence,

            isReverse:
                vehicleRoutes.isReverse,
        })
        .from(vehicleRoutes)
        .where(
            and(
                eq(
                    vehicleRoutes.vehicleId,
                    vehicleId,
                ),

                eq(
                    vehicleRoutes.sequence,
                    currentRouteSequence + 1,
                ),
            ),
        )
        .limit(1);

    return rows[0] ?? null;
}

/*
 * Get a road segment by ID.
 */
async function getRoadSegment(
    segmentId: number,
) {
    const rows = await db
        .select({
            id:
                roadSegments.id,

            roadId:
                roadSegments.roadId,

            lengthMeters:
                roadSegments.lengthMeters,

            startIntersectionId:
                roadSegments.startIntersectionId,

            endIntersectionId:
                roadSegments.endIntersectionId,
        })
        .from(roadSegments)
        .where(
            eq(
                roadSegments.id,
                segmentId,
            ),
        )
        .limit(1);

    return rows[0] ?? null;
}

/*
 * Check the traffic signal controlling the
 * intersection that the vehicle is approaching.
 *
 * GREEN  → vehicle may continue
 * YELLOW → vehicle may continue
 * RED    → vehicle must stop
 */
async function checkTrafficLight(
    vehicleId: number,
    currentSegment: {
        roadId: number;
        startIntersectionId: number;
        endIntersectionId: number;
    },
    nextSegment: {
        roadId: number;
    },
    isReverse: boolean,
) {
    const approachingIntersectionId =
        isReverse
            ? Number(
                currentSegment.startIntersectionId,
            )
            : Number(
                currentSegment.endIntersectionId,
            );

    const signal =
        await getMovementSignal(
            approachingIntersectionId,

            Number(
                currentSegment.roadId,
            ),

            Number(
                nextSegment.roadId,
            ),
        );

    console.log(
        `Vehicle ${vehicleId}: ` +
        `Intersection ${approachingIntersectionId} | ` +
        `${currentSegment.roadId} → ` +
        `${nextSegment.roadId} | ` +
        `TrafficLight ${signal.trafficLightId ?? "NONE"} | ` +
        `Phase ${signal.phase ?? "NONE"} | ` +
        `${signal.state}`,
    );

    return {
        ...signal,

        intersectionId:
            approachingIntersectionId,
    };
}

/*
 * Move one vehicle for one simulation tick.
 *
 * Returns:
 *
 *     true  → vehicle was moved or its state changed
 *     false → vehicle could not be processed
 */
async function moveVehicle(
    vehicle: VehicleMovementRow,
): Promise<boolean> {
    /*
     * A vehicle without a current segment
     * cannot move.
     */
    if (
        vehicle.currentSegmentId === null
    ) {
        return false;
    }

    /*
     * Get current road segment.
     */
    const segment =
        await getRoadSegment(
            Number(
                vehicle.currentSegmentId,
            ),
        );

    if (!segment) {
        console.error(
            `Vehicle ${vehicle.id}: ` +
            `Current segment ` +
            `${vehicle.currentSegmentId} ` +
            `does not exist.`,
        );

        return false;
    }

    /*
     * Direction comes directly from the route.
     *
     * false:
     *     START → END
     *
     * true:
     *     END → START
     *
     * Logical progress still goes:
     *
     *     0 → 1
     */
    const isReverse =
        vehicle.isReverse === true;

    /*
     * Current logical progress.
     */
    const currentProgress =
        Number(
            vehicle.progress,
        );

    /*
     * Distance remaining to the intersection.
     */
    const remainingDistanceMeters =
        getRemainingDistanceToIntersection(
            Number(
                segment.lengthMeters,
            ),

            currentProgress,
        );

    /*
     * Find the next route segment.
     *
     * This is required because the traffic
     * light controls:
     *
     *     current road → next road
     */
    const nextRoute =
        await getNextRoute(
            vehicle.id,

            Number(
                vehicle.routeSequence,
            ),
        );

    /*
     * ------------------------------------------------
     * CASE 1
     *
     * No next route segment.
     *
     * The vehicle is approaching its destination.
     * ------------------------------------------------
     */
    if (
        !nextRoute ||
        nextRoute.segmentId === null
    ) {
        const speedMetersPerSecond =
            Number(
                vehicle.speedKmh,
            ) / 3.6;

        const distanceMeters =
            speedMetersPerSecond *
            SimulationConfig.simulationSecondsPerTick;

        const progressIncrement =
            distanceMeters /
            Number(
                segment.lengthMeters,
            );

        const newProgress =
            currentProgress +
            progressIncrement;

        /*
         * Vehicle reached destination.
         */
        if (newProgress >= 1) {
            const finalGeometryPosition =
                isReverse
                    ? sql`
                        ST_StartPoint(
                            (
                                SELECT geometry
                                FROM road_segments
                                WHERE id =
                                    ${vehicle.currentSegmentId}
                            )
                        )
                    `
                    : sql`
                        ST_EndPoint(
                            (
                                SELECT geometry
                                FROM road_segments
                                WHERE id =
                                    ${vehicle.currentSegmentId}
                            )
                        )
                    `;

            await db.execute(sql`
                UPDATE vehicles
                SET
                    progress = 1,

                    position =
                        ${finalGeometryPosition},

                    status =
                        'COMPLETED',

                    updated_at =
                        NOW()

                WHERE id =
                    ${vehicle.id};
            `);

            console.log(
                `Vehicle ${vehicle.id} ` +
                `reached destination.`,
            );

            return true;
        }

        /*
         * Vehicle is still approaching its
         * destination.
         */
        const geometryProgress =
            isReverse
                ? 1 - newProgress
                : newProgress;

        await db.execute(sql`
            UPDATE vehicles
            SET
                progress =
                    ${newProgress},

                position =
                    ST_LineInterpolatePoint(
                        (
                            SELECT geometry
                            FROM road_segments
                            WHERE id =
                                ${vehicle.currentSegmentId}
                        ),
                        ${geometryProgress}
                    ),

                status =
                    'WAITING',

                updated_at =
                    NOW()

            WHERE id =
                ${vehicle.id};
        `);

        return true;
    }

    /*
     * Get next segment.
     */
    const nextSegment =
        await getRoadSegment(
            Number(
                nextRoute.segmentId,
            ),
        );

    if (!nextSegment) {
        console.error(
            `Vehicle ${vehicle.id}: ` +
            `Next segment ` +
            `${nextRoute.segmentId} ` +
            `does not exist.`,
        );

        return false;
    }

    /*
     * Calculate normal movement.
     */
    const speedMetersPerSecond =
        Number(
            vehicle.speedKmh,
        ) / 3.6;

    const distanceMeters =
        speedMetersPerSecond *
        SimulationConfig.simulationSecondsPerTick;

    const progressIncrement =
        distanceMeters /
        Number(
            segment.lengthMeters,
        );

    const newProgress =
        currentProgress +
        progressIncrement;

    /*
     * Determine whether the vehicle is close
     * enough to the intersection for a
     * traffic-light decision.
     */
    const projectedRemainingDistanceMeters =
        Math.max(
            0,
            Number(
                segment.lengthMeters,
            ) *
            (1 - newProgress),
        );

    const shouldCheckTrafficLight =
        remainingDistanceMeters <=
            SimulationConfig.trafficLightStopDistanceMeters
        ||
        projectedRemainingDistanceMeters <=
            SimulationConfig.trafficLightStopDistanceMeters
        ||
        newProgress >= 1;

    /*
     * Traffic-light decision.
     */
    if (shouldCheckTrafficLight) {
        const signal =
            await checkTrafficLight(
                vehicle.id,

                {
                    roadId:
                        Number(
                            segment.roadId,
                        ),

                    startIntersectionId:
                        Number(
                            segment.startIntersectionId,
                        ),

                    endIntersectionId:
                        Number(
                            segment.endIntersectionId,
                        ),
                },

                {
                    roadId:
                        Number(
                            nextSegment.roadId,
                        ),
                },

                isReverse,
            );

        /*
         * RED
         *
         * Vehicle must stop before
         * the intersection.
         */
        if (
            signal.hasTrafficLight &&
            signal.state === "RED"
        ) {
            const stopProgress =
                Math.max(
                    0,
                    1 -
                        (
                            SimulationConfig
                                .trafficLightStopDistanceMeters /
                            Number(
                                segment.lengthMeters,
                            )
                        ),
                );

            /*
             * Never move backwards.
             *
             * If already inside the stopping zone,
             * retain current position.
             */
            const stoppedProgress =
                Math.min(
                    Math.max(
                        currentProgress,
                        stopProgress,
                    ),
                    1,
                );

            const geometryProgress =
                isReverse
                    ? 1 - stoppedProgress
                    : stoppedProgress;

            await db.execute(sql`
                UPDATE vehicles
                SET
                    progress =
                        ${stoppedProgress},

                    position =
                        ST_LineInterpolatePoint(
                            (
                                SELECT geometry
                                FROM road_segments
                                WHERE id =
                                    ${vehicle.currentSegmentId}
                            ),
                            ${geometryProgress}
                        ),

                    status =
                        'WAITING_AT_SIGNAL',

                    updated_at =
                        NOW()

                WHERE id =
                    ${vehicle.id};
            `);

            console.log(
                `Vehicle ${vehicle.id}: ` +
                `WAITING_AT_SIGNAL | ` +
                `Intersection ` +
                `${signal.intersectionId}`,
            );

            return false;
        }
    }

    /*
     * GREEN / YELLOW / NO SIGNAL
     *
     * If previously waiting at a signal,
     * return to normal WAITING state.
     */
    if (
        vehicle.status ===
        "WAITING_AT_SIGNAL"
    ) {
        await db.execute(sql`
            UPDATE vehicles
            SET
                status = 'WAITING',
                updated_at = NOW()
            WHERE id = ${vehicle.id};
        `);
    }

    /*
     * ------------------------------------------------
     * CASE 2
     *
     * Vehicle remains on current segment.
     * ------------------------------------------------
     */
    if (newProgress < 1) {
        const geometryProgress =
            isReverse
                ? 1 - newProgress
                : newProgress;

        await db.execute(sql`
            UPDATE vehicles
            SET
                progress =
                    ${newProgress},

                position =
                    ST_LineInterpolatePoint(
                        (
                            SELECT geometry
                            FROM road_segments
                            WHERE id =
                                ${vehicle.currentSegmentId}
                        ),
                        ${geometryProgress}
                    ),

                status =
                    'WAITING',

                updated_at =
                    NOW()

            WHERE id =
                ${vehicle.id};
        `);

        return true;
    }

    /*
     * ------------------------------------------------
     * CASE 3
     *
     * Vehicle crossed the current segment.
     *
     * Move it to the next route segment.
     * ------------------------------------------------
     */
    const nextSegmentIsReverse =
        nextRoute.isReverse === true;

    /*
     * Forward:
     *     START → END
     *     geometry progress starts at 0
     *
     * Reverse:
     *     END → START
     *     geometry progress starts at 1
     */
    const startingGeometryProgress =
        nextSegmentIsReverse
            ? 1
            : 0;

    await db.execute(sql`
        UPDATE vehicles
        SET
            current_segment_id =
                ${nextRoute.segmentId},

            route_sequence =
                ${nextRoute.sequence},

            progress =
                0,

            position =
                ST_LineInterpolatePoint(
                    (
                        SELECT geometry
                        FROM road_segments
                        WHERE id =
                            ${nextRoute.segmentId}
                    ),
                    ${startingGeometryProgress}
                ),

            status =
                'WAITING',

            updated_at =
                NOW()

        WHERE id =
            ${vehicle.id};
    `);

    console.log(
        `Vehicle ${vehicle.id}: ` +
        `Segment ` +
        `${vehicle.currentSegmentId} → ` +
        `${nextRoute.segmentId} | ` +
        `Direction: ` +
        `${
            nextSegmentIsReverse
                ? "REVERSE"
                : "FORWARD"
        }`,
    );

    return true;
}

export async function moveVehicles(
    simulationRunId: number,
): Promise<number> {
    /*
     * Get all vehicles that can currently be
     * processed by the simulation.
     *
     * WAITING:
     *     normal active vehicle
     *
     * WAITING_AT_SIGNAL:
     *     vehicle stopped at red signal
     *
     * WAITING_AT_SIGNAL is selected again
     * every tick so that it can resume when
     * the signal changes.
     */
    const vehicleRows = await db
        .select({
            id:
                vehicles.id,

            currentSegmentId:
                vehicles.currentSegmentId,

            routeSequence:
                vehicles.routeSequence,

            speedKmh:
                vehicles.speedKmh,

            progress:
                vehicles.progress,

            status:
                vehicles.status,

            isReverse:
                vehicleRoutes.isReverse,
        })
        .from(vehicles)
        .leftJoin(
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

                sql`
                    ${vehicles.status}
                    IN (
                        'WAITING',
                        'WAITING_AT_SIGNAL'
                    )
                `,
            ),
        );

    let movedVehicles = 0;

    /*
     * Process every vehicle independently.
     */
    for (const vehicle of vehicleRows) {
        const moved =
            await moveVehicle(
                vehicle,
            );

        if (moved) {
            movedVehicles++;
        }
    }

    return movedVehicles;
}