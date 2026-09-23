import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
    vehicles,
    vehicleRoutes,
} from "@/db/schema";

import {
    setSimulationVehicleStates,
    getSimulationVehicleStates,
    getSimulationVehicleState,
    updateSimulationVehicleState,
} from "./vehicle_state.service";

import {
    getMovementSignal,
} from "@/modules/traffic/traffic_light_movement.service";

import {
    checkVehicleAhead,
} from "@/modules/vehicle/vehicle_following.service";

import { SimulationConfig } from "@/lib/constants";

import {
    loadSimulationVehicleCache,
    type SimulationVehicleCache,
} from "@/modules/vehicle/vehicle_simulation_cache.service";

type VehicleMovementRow = {
    id: number;
    currentSegmentId: number | null;
    simulationRunId: number;
    destinationIntersectionId: number | null;
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
 * progress is logical traversal progress:
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
 * Update a vehicle's segment, progress,
 * position, speed and status.
 *
 * PostgreSQL remains the persistent store.
 *
 * The in-memory vehicle state is updated
 * at the same time so that other simulation
 * calculations can use RAM instead of querying
 * PostgreSQL again.
 */
async function updateVehiclePosition(
    vehicleId: number,
    simulationRunId: number,
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

    /*
     * Persist the state to PostgreSQL.
     */
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

    /*
     * Update the in-memory simulation state.
     */
    const vehicleState =
        getSimulationVehicleState(
            simulationRunId,
            vehicleId,
        );

    if (vehicleState) {
        vehicleState.currentSegmentId =
            segmentId;

        vehicleState.routeSequence =
            routeSequence;

        vehicleState.progress =
            progress;

        vehicleState.speedKmh =
            speedKmh;

        vehicleState.status =
            status;

        vehicleState.isReverse =
            isReverse;

        updateSimulationVehicleState(
            simulationRunId,
            vehicleState,
        );
    }
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
        vehicle.simulationRunId,
        segmentId,
        vehicle.routeSequence,
        stoppedProgress,
        isReverse,
        speedKmh,
        "WAITING_AT_SIGNAL",
    );

    /*
     * Keep the object passed into moveVehicle()
     * synchronized immediately.
     */
    vehicle.currentSegmentId =
        segmentId;

    vehicle.progress =
        stoppedProgress;

    vehicle.speedKmh =
        speedKmh;

    vehicle.status =
        "WAITING_AT_SIGNAL";

    vehicle.isReverse =
        isReverse;

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
    cache: SimulationVehicleCache,
): Promise<boolean> {

    if (
        vehicle.currentSegmentId === null
    ) {
        return false;
    }

    let currentSegment =
        cache.segments.get(
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
     * segment transition.
     *
     * This is important because the vehicle ahead
     * can change when the vehicle enters a new segment.
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
        const vehicleRoutesCache =
            cache.routesByVehicle.get(
                Number(vehicle.id),
            );

        const nextRoute =
            vehicleRoutesCache?.get(
                Number(
                    vehicle.routeSequence,
                ) + 1,
            ) ?? null;

        /*
         * DESTINATION ALREADY REACHED
         *
         * If the vehicle is already at the end of its
         * final route segment, complete it before
         * vehicle-following or traffic-light logic
         * can keep it in WAITING.
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
                vehicle.simulationRunId,
                currentSegment.id,
                vehicle.routeSequence,
                1,
                isReverse,
                Number(vehicle.speedKmh),
                "COMPLETED",
            );

            vehicle.progress = 1;
            vehicle.status = "COMPLETED";

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
         *
         * checkVehicleAhead() now reads from the
         * in-memory vehicle state cache.
         */
        const following =
            checkVehicleAhead(
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

                vehicle.status =
                    "WAITING";

                const vehicleState =
                    getSimulationVehicleState(
                        vehicle.simulationRunId,
                        vehicle.id,
                    );

                if (vehicleState) {
                    vehicleState.status =
                        "WAITING";

                    updateSimulationVehicleState(
                        vehicle.simulationRunId,
                        vehicleState,
                    );
                }

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
         * DESTINATION SEGMENT
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
                    vehicle.simulationRunId,
                    currentSegment.id,
                    vehicle.routeSequence,
                    1,
                    isReverse,
                    normalSpeedKmh,
                    "COMPLETED",
                );

                vehicle.progress = 1;
                vehicle.status = "COMPLETED";

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
                vehicle.simulationRunId,
                currentSegment.id,
                vehicle.routeSequence,
                currentProgress,
                isReverse,
                normalSpeedKmh,
                "WAITING",
            );

            vehicle.progress =
                currentProgress;

            vehicle.status =
                "WAITING";

            return true;
        }

        /*
         * Get the next segment because the traffic
         * light, if present, controls:
         *
         * current road → next road.
         */
        const nextSegment =
            cache.segments.get(
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
         * VEHICLE REMAINS ON CURRENT SEGMENT
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
                vehicle.simulationRunId,
                currentSegment.id,
                vehicle.routeSequence,
                currentProgress,
                isReverse,
                normalSpeedKmh,
                "WAITING",
            );

            vehicle.progress =
                currentProgress;

            vehicle.status =
                "WAITING";

            return true;
        }

        /*
         * VEHICLE REACHES THE INTERSECTION
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

        vehicle.progress =
            currentProgress;

        vehicle.isReverse =
            isReverse;

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
                vehicle.simulationRunId,
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
                `${
                    isReverse
                        ? "REVERSE"
                        : "FORWARD"
                } | ` +
                `Remaining movement: 0.00m`,
            );

            return true;
        }

        /*
         * Persist the segment transition to the DB
         * and RAM before the next loop iteration.
         */
        await updateVehiclePosition(
            vehicle.id,
            vehicle.simulationRunId,
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
            `${
                isReverse
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
     * Load static route and segment information
     * into the simulation cache.
     */
    const cache =
        await loadSimulationVehicleCache(
            simulationRunId,
        );

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

    /*
     * Initialize the in-memory state only once.
     *
     * Subsequent ticks use the same objects so
     * vehicle-following can operate entirely
     * from RAM.
     */
    const existingStates =
        getSimulationVehicleStates(
            simulationRunId,
        );

    if (existingStates.size === 0) {
        setSimulationVehicleStates(
            simulationRunId,
            vehicleRows.map((vehicle) => ({
                id: Number(vehicle.id),

                simulationRunId:
                    Number(
                        vehicle.simulationRunId,
                    ),

                currentSegmentId:
                    vehicle.currentSegmentId === null
                        ? null
                        : Number(
                              vehicle.currentSegmentId,
                          ),

                destinationIntersectionId:
                    vehicle.destinationIntersectionId ===
                    null
                        ? null
                        : Number(
                              vehicle.destinationIntersectionId,
                          ),

                routeSequence:
                    Number(
                        vehicle.routeSequence,
                    ),

                speedKmh:
                    Number(
                        vehicle.speedKmh,
                    ),

                progress:
                    Number(
                        vehicle.progress,
                    ),

                status:
                    vehicle.status,

                isReverse:
                    Boolean(
                        vehicle.isReverse,
                    ),
            })),
        );
    }

    /*
     * IMPORTANT:
     *
     * Process the in-memory vehicle state rather
     * than rebuilding the vehicle object from
     * PostgreSQL on every tick.
     */
    const vehicleStates =
        getSimulationVehicleStates(
            simulationRunId,
        );

    let movedVehicles = 0;

    for (
        const vehicleState
        of vehicleStates.values()
    ) {
        /*
         * Only vehicles that can currently move
         * should enter the movement engine.
         */
        if (
            vehicleState.status !==
                "WAITING" &&
            vehicleState.status !==
                "WAITING_AT_SIGNAL"
        ) {
            continue;
        }

        /*
         * VehicleMovementRow is structurally
         * compatible with SimulationVehicleState.
         */
        const vehicle =
            vehicleState as VehicleMovementRow;

        const moved =
            await moveVehicle(
                vehicle,
                cache,
            );

        if (moved) {
            movedVehicles++;
        }
    }

    return movedVehicles;
}