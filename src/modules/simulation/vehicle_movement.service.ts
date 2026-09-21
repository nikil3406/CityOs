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

import {
    checkVehicleAhead,
} from "@/modules/vehicle/vehicle_following.service";

type VehicleMovementRow = {
    id: number;
    currentSegmentId: number | null;
    simulationRunId: number;
    destinationIntersectionId: number|null;
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
 * Convert logical traversal progress into
 * PostGIS geometry progress.
 *
 * Logical progress always goes:
 *
 *     0 → 1
 *
 * Geometry progress depends on traversal direction:
 *
 *     forward → 0 → 1
 *     reverse → 1 → 0
 */
function getGeometryProgress(
    progress: number,
    isReverse: boolean,
): number {
    return isReverse
        ? 1 - progress
        : progress;
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
 * Update a vehicle's segment, progress,
 * position, speed and status.
 */
async function updateVehiclePosition(
    vehicleId: number,
    segmentId: number,
    routeSequence: number,
    progress: number,
    isReverse: boolean,
    speedKmh: number,
    status: string,
) {
    const geometryProgress =
        getGeometryProgress(
            progress,
            isReverse,
        );

    await db.execute(sql`
        UPDATE vehicles
        SET
            current_segment_id =
                ${segmentId},

            route_sequence =
                ${routeSequence},

            progress =
                ${progress},

            speed_kmh =
                ${speedKmh},

            position =
                ST_LineInterpolatePoint(
                    (
                        SELECT geometry
                        FROM road_segments
                        WHERE id =
                            ${segmentId}
                    ),
                    ${geometryProgress}
                ),

            status =
                ${status},

            updated_at =
                NOW()

        WHERE id =
            ${vehicleId};
    `);
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
 * Stop a vehicle before a red signal.
 */
async function stopAtTrafficLight(
    vehicle: VehicleMovementRow,
    segmentId: number,
    segmentLengthMeters: number,
    currentProgress: number,
    isReverse: boolean,
    speedKmh: number,
    intersectionId: number,
) {
    const stopProgress =
        Math.max(
            0,
            1 -
            (
                SimulationConfig
                    .trafficLightStopDistanceMeters /
                segmentLengthMeters
            ),
        );

    /*
     * Never move the vehicle backwards.
     *
     * If the vehicle is already inside the
     * stopping zone, retain its current position.
     */
    const stoppedProgress =
        Math.min(
            Math.max(
                currentProgress,
                stopProgress,
            ),
            1,
        );

    await updateVehiclePosition(
        vehicle.id,
        segmentId,
        vehicle.routeSequence,
        stoppedProgress,
        isReverse,
        speedKmh,
        "WAITING_AT_SIGNAL",
    );

    console.log(
        `Vehicle ${vehicle.id}: ` +
        `WAITING_AT_SIGNAL | ` +
        `Intersection ${intersectionId}`,
    );
}

/*
 * Move one vehicle for one simulation tick.
 *
 * The vehicle's movement distance is treated as
 * physical distance rather than a single progress
 * increment.
 *
 * This allows leftover movement to continue onto
 * the next route segment instead of resetting the
 * vehicle to progress = 0 at every intersection.
 *
 * Example:
 *
 *     12 m remaining on segment A
 *     20 m movement available this tick
 *
 *     12 m → finish segment A
 *      8 m → continue on segment B
 *
 * Traffic lights are checked before every
 * intersection crossing.
 */
async function moveVehicle(
    vehicle: VehicleMovementRow,
): Promise<boolean> {
    if (
        vehicle.currentSegmentId === null
    ) {
        return false;
    }

    let currentSegment =
        await getRoadSegment(
            Number(
                vehicle.currentSegmentId,
            ),
        );

    if (!currentSegment) {
        console.error(
            `Vehicle ${vehicle.id}: ` +
            `Current segment ` +
            `${vehicle.currentSegmentId} ` +
            `does not exist.`,
        );

        return false;
    }

    let isReverse =
        vehicle.isReverse === true;

    let currentProgress =
        Number(
            vehicle.progress,
        );

    /*
     * A simulation tick represents a fixed amount
     * of physical travel distance.
     *
     * Following and traffic-light constraints
     * can reduce this distance, but never increase it.
     */
    const normalSpeedKmh =
        Number(
            vehicle.speedKmh,
        );

    let remainingMovementMeters =
        (
            normalSpeedKmh / 3.6
        ) *
        SimulationConfig.simulationSecondsPerTick;

    let moved = false;

    /*
     * Re-evaluate the current segment after every
     * segment transition. This is important because
     * the vehicle ahead can change when the vehicle
     * enters a new segment.
     */
    while (
        remainingMovementMeters > 0
    ) {
        const segmentLengthMeters =
            Number(
                currentSegment.lengthMeters,
            );

        const remainingSegmentDistance =
            getRemainingDistanceToIntersection(
                segmentLengthMeters,
                currentProgress,
            );

        /*
         * Find the next route entry before checking
         * following/traffic lights.
         */
        const nextRoute =
            await getNextRoute(
                vehicle.id,
                vehicle.routeSequence,
            );

        /*
 * ------------------------------------------------
 * DESTINATION ALREADY REACHED
 *
 * If the vehicle is already at the end of its
 * final route segment, complete it before
 * vehicle-following or traffic-light logic
 * can keep it in WAITING.
 * ------------------------------------------------
 */
        const destinationIntersection =
            isReverse
                ? Number(
                    currentSegment.startIntersectionId,
                )
                : Number(
                    currentSegment.endIntersectionId,
                );

        const hasReachedDestination =
            currentProgress >= 1 &&
            (
                !nextRoute ||
                nextRoute.segmentId === null
            ) &&
            vehicle.destinationIntersectionId !== null &&
            destinationIntersection ===
            Number(
                vehicle.destinationIntersectionId,
            );

        if (hasReachedDestination) {
            await updateVehiclePosition(
                vehicle.id,
                currentSegment.id,
                vehicle.routeSequence,
                1,
                isReverse,
                Number(vehicle.speedKmh),
                "COMPLETED",
            );

            console.log(
                `Vehicle ${vehicle.id}: ` +
                `reached destination ` +
                `${vehicle.destinationIntersectionId}.`,
            );

            return true;
        }
        /*
         * Vehicle following must be calculated for
         * the CURRENT segment on every loop iteration.
         */
        const following =
            await checkVehicleAhead(
                vehicle.id,
                vehicle.simulationRunId,
                Number(
                    currentSegment.id,
                ),
                segmentLengthMeters,
                currentProgress,
                normalSpeedKmh,
                isReverse,
            );

        /*
         * Determine the maximum distance this vehicle
         * may travel during this iteration.
         *
         * If another vehicle is ahead, the follower
         * must never move closer than the configured
         * safe distance.
         */
        let allowedMovementMeters =
            remainingMovementMeters;

        if (following) {
            const safeDistanceMeters =
                SimulationConfig
                    .vehicleFollowing
                    .safeDistanceMeters;

            const maximumSafeMovementMeters =
                Math.max(
                    0,
                    following.distanceMeters -
                    safeDistanceMeters,
                );

            /*
             * If the vehicle is already inside the
             * safe-distance zone, stop it.
             */
            if (
                maximumSafeMovementMeters <= 0
            ) {
                await db.execute(sql`
                    UPDATE vehicles
                    SET
                        status = 'WAITING',
                        updated_at = NOW()
                    WHERE id =
                        ${vehicle.id};
                `);

                console.log(
                    `Vehicle ${vehicle.id}: ` +
                    `WAITING_BEHIND_VEHICLE | ` +
                    `Ahead: ${following.vehicleId} | ` +
                    `Distance: ` +
                    `${following.distanceMeters.toFixed(2)}m`,
                );

                return moved;
            }

            /*
             * Never allow the follower to travel
             * farther than the physical gap permits.
             */
            allowedMovementMeters =
                Math.min(
                    allowedMovementMeters,
                    maximumSafeMovementMeters,
                );

            if (
                allowedMovementMeters <
                remainingMovementMeters
            ) {
                console.log(
                    `Vehicle ${vehicle.id}: ` +
                    `FOLLOWING | ` +
                    `Ahead: ${following.vehicleId} | ` +
                    `Gap: ${following.distanceMeters.toFixed(2)}m | ` +
                    `Allowed movement: ${allowedMovementMeters.toFixed(2)}m`,
                );
            }
        }

        /*
         * ------------------------------------------------
         * DESTINATION SEGMENT
         * ------------------------------------------------
         *
         * There is no intersection to cross after
         * this segment.
         */
        if (
            !nextRoute ||
            nextRoute.segmentId === null
        ) {
            if (
                allowedMovementMeters >=
                remainingSegmentDistance
            ) {
                await updateVehiclePosition(
                    vehicle.id,
                    currentSegment.id,
                    vehicle.routeSequence,
                    1,
                    isReverse,
                    normalSpeedKmh,
                    "COMPLETED",
                );

                console.log(
                    `Vehicle ${vehicle.id} ` +
                    `reached destination.`,
                );

                return true;
            }

            currentProgress +=
                allowedMovementMeters /
                segmentLengthMeters;

            await updateVehiclePosition(
                vehicle.id,
                currentSegment.id,
                vehicle.routeSequence,
                currentProgress,
                isReverse,
                normalSpeedKmh,
                "WAITING",
            );

            return true;
        }

        /*
         * Get the next segment because the traffic
         * light, if present, controls:
         *
         * current road → next road.
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

            return moved;
        }

        /*
         * ------------------------------------------------
         * VEHICLE REMAINS ON CURRENT SEGMENT
         * ------------------------------------------------
         */
        if (
            allowedMovementMeters <
            remainingSegmentDistance
        ) {
            const newProgress =
                currentProgress +
                (
                    allowedMovementMeters /
                    segmentLengthMeters
                );

            /*
             * If the vehicle enters the traffic-light
             * stopping zone during this movement,
             * inspect the signal before committing
             * the new position.
             */
            const projectedRemainingDistanceMeters =
                Math.max(
                    0,
                    segmentLengthMeters *
                    (1 - newProgress),
                );

            if (
                projectedRemainingDistanceMeters <=
                SimulationConfig
                    .trafficLightStopDistanceMeters
            ) {
                const signal =
                    await checkTrafficLight(
                        vehicle.id,
                        {
                            roadId:
                                Number(
                                    currentSegment.roadId,
                                ),
                            startIntersectionId:
                                Number(
                                    currentSegment.startIntersectionId,
                                ),
                            endIntersectionId:
                                Number(
                                    currentSegment.endIntersectionId,
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

                if (
                    signal.hasTrafficLight &&
                    signal.state === "RED"
                ) {
                    await stopAtTrafficLight(
                        vehicle,
                        currentSegment.id,
                        segmentLengthMeters,
                        currentProgress,
                        isReverse,
                        normalSpeedKmh,
                        signal.intersectionId,
                    );

                    return moved;
                }
            }

            currentProgress =
                newProgress;

            remainingMovementMeters = 0;

            await updateVehiclePosition(
                vehicle.id,
                currentSegment.id,
                vehicle.routeSequence,
                currentProgress,
                isReverse,
                normalSpeedKmh,
                "WAITING",
            );

            return true;
        }

        /*
         * ------------------------------------------------
         * VEHICLE REACHES THE INTERSECTION
         * ------------------------------------------------
         *
         * Before crossing, check the movement signal.
         */
        const signal =
            await checkTrafficLight(
                vehicle.id,
                {
                    roadId:
                        Number(
                            currentSegment.roadId,
                        ),
                    startIntersectionId:
                        Number(
                            currentSegment.startIntersectionId,
                        ),
                    endIntersectionId:
                        Number(
                            currentSegment.endIntersectionId,
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

        if (
            signal.hasTrafficLight &&
            signal.state === "RED"
        ) {
            await stopAtTrafficLight(
                vehicle,
                currentSegment.id,
                segmentLengthMeters,
                currentProgress,
                isReverse,
                normalSpeedKmh,
                signal.intersectionId,
            );

            return moved;
        }

        /*
         * The intersection can be crossed.
         *
         * Consume only the distance required to
         * reach the end of the current segment.
         *
         * Any leftover distance is preserved and
         * applied to the next segment.
         */
        remainingMovementMeters =
            allowedMovementMeters -
            remainingSegmentDistance;

        const previousSegmentId =
            currentSegment.id;

        currentSegment =
            nextSegment;

        vehicle.routeSequence =
            Number(
                nextRoute.sequence,
            );

        currentProgress = 0;

        isReverse =
            nextRoute.isReverse === true;

        vehicle.currentSegmentId =
            Number(
                nextRoute.segmentId,
            );

        moved = true;

        /*
         * If the follower was limited by the vehicle
         * ahead, there is no reason to continue beyond
         * the allowed movement distance.
         */
        if (
            remainingMovementMeters <= 0
        ) {
            await updateVehiclePosition(
                vehicle.id,
                currentSegment.id,
                vehicle.routeSequence,
                0,
                isReverse,
                normalSpeedKmh,
                "WAITING",
            );

            console.log(
                `Vehicle ${vehicle.id}: ` +
                `Segment ` +
                `${previousSegmentId} → ` +
                `${currentSegment.id} | ` +
                `Direction: ` +
                `${isReverse
                    ? "REVERSE"
                    : "FORWARD"
                } | ` +
                `Remaining movement: 0.00m`,
            );

            return true;
        }

        console.log(
            `Vehicle ${vehicle.id}: ` +
            `Segment ` +
            `${previousSegmentId} → ` +
            `${currentSegment.id} | ` +
            `Direction: ` +
            `${isReverse
                ? "REVERSE"
                : "FORWARD"
            } | ` +
            `Remaining movement: ` +
            `${remainingMovementMeters.toFixed(2)}m`,
        );
    }

    return moved;
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

            simulationRunId:
                vehicles.simulationRunId,

            currentSegmentId:
                vehicles.currentSegmentId,

            routeSequence:
                vehicles.routeSequence,

            speedKmh:
                vehicles.speedKmh,

            destinationIntersectionId:
                vehicles.destinationIntersectionId,

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
