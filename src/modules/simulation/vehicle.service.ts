import { sql } from "drizzle-orm";

import { db } from "@/db";
import {
    vehicles,
    vehicleRoutes,
} from "@/db/schema";

import {
    getReachableIntersections,
    findShortestRoute,
} from "@/modules/road/routing.service";

type GeneratedVehicle = {
    id: number;
    simulationRunId: number;
    currentRoadId: number;
    currentSegmentId: number;
    destinationIntersectionId: number;
    routeSequence: number;
    speedKmh: number;
    status: string;
};

type SelectedSegment = {
    id: number;
    roadId: number;
    speedLimitKmh: number | null;
    startIntersectionId: number;
    endIntersectionId: number;
};

export async function generateVehicles(
    simulationRunId: number,
    count: number,
): Promise<GeneratedVehicle[]> {
    /*
     * Validate requested vehicle count.
     */
    if (
        !Number.isInteger(count) ||
        count <= 0
    ) {
        throw new Error(
            "Vehicle count must be a positive integer",
        );
    }

    /*
     * --------------------------------------------
     * Get the city belonging to this simulation.
     * --------------------------------------------
     */
    const simulationResult =
        await db.execute(sql`
            SELECT
                city_id AS "cityId"
            FROM simulation_runs
            WHERE id = ${simulationRunId}
            LIMIT 1;
        `);

    if (
        simulationResult.length === 0
    ) {
        throw new Error(
            "Simulation run not found",
        );
    }

    const cityId =
        Number(
            simulationResult[0].cityId,
        );

    /*
     * --------------------------------------------
     * Select random usable road segments.
     *
     * Footways are excluded.
     *
     * The selected segments must have valid
     * intersections because they belong to
     * the simulation road network.
     * --------------------------------------------
     */
    const segmentResult =
        await db.execute(sql`
            SELECT
                rs.id,

                rs.road_id AS "roadId",

                rs.speed_limit_kmh
                    AS "speedLimitKmh",

                rs.start_intersection_id
                    AS "startIntersectionId",

                rs.end_intersection_id
                    AS "endIntersectionId"

            FROM road_segments rs

            JOIN roads r
                ON r.id = rs.road_id

            WHERE
                r.city_id = ${cityId}

                AND LOWER(
                    COALESCE(r.type, '')
                ) <> 'footway'

            ORDER BY RANDOM()

            LIMIT ${count};
        `);

    if (
        segmentResult.length < count
    ) {
        throw new Error(
            `Only ${segmentResult.length} usable segments are available`,
        );
    }

    const generatedVehicles:
        GeneratedVehicle[] = [];

    /*
     * Generate each vehicle independently.
     */
    for (const row of segmentResult) {
        const segment =
            row as unknown as SelectedSegment;

        const startIntersectionId =
            Number(
                segment.startIntersectionId,
            );

        /*
         * --------------------------------------------
         * Find all intersections reachable from the
         * starting intersection.
         * --------------------------------------------
         */
        const reachableIntersections =
            await getReachableIntersections(
                cityId,
                startIntersectionId,
            );

        /*
         * Don't choose the starting intersection
         * as the destination.
         */
        const possibleDestinations =
            reachableIntersections.filter(
                (id) =>
                    id !==
                    startIntersectionId,
            );

        if (
            possibleDestinations.length ===
            0
        ) {
            console.log(
                `No reachable destination from ` +
                `${startIntersectionId}. ` +
                `Skipping vehicle.`,
            );

            continue;
        }

        /*
         * Choose a random destination.
         */
        const destinationIntersectionId =
            possibleDestinations[
                Math.floor(
                    Math.random() *
                        possibleDestinations.length,
                )
            ];

        /*
         * --------------------------------------------
         * Calculate the shortest route.
         * --------------------------------------------
         *
         * Every route segment now contains:
         *
         *     segmentId
         *     isReverse
         */
        const route =
            await findShortestRoute(
                cityId,
                startIntersectionId,
                destinationIntersectionId,
            );

        if (
            !route ||
            route.segments.length === 0
        ) {
            console.log(
                `No route found from ` +
                `${startIntersectionId} to ` +
                `${destinationIntersectionId}. ` +
                `Skipping vehicle.`,
            );

            continue;
        }

        /*
         * First route segment.
         */
        const firstRouteSegment =
            route.segments[0];

        const firstSegmentId =
            firstRouteSegment.segmentId;

        const firstSegmentIsReverse =
            firstRouteSegment.isReverse;

        /*
         * --------------------------------------------
         * Get first segment information and calculate
         * the initial vehicle position.
         * --------------------------------------------
         *
         * Forward:
         *
         *     geometry progress = 0
         *
         * Reverse:
         *
         *     geometry progress = 1
         */
        const initialGeometryProgress =
            firstSegmentIsReverse
                ? 1
                : 0;

        const positionResult =
            await db.execute(sql`
                SELECT
                    r.id AS "roadId",

                    rs.id AS "segmentId",

                    rs.speed_limit_kmh
                        AS "speedLimitKmh",

                    ST_AsGeoJSON(
                        ST_LineInterpolatePoint(
                            rs.geometry,
                            ${initialGeometryProgress}
                        )
                    )::json AS position

                FROM road_segments rs

                JOIN roads r
                    ON r.id = rs.road_id

                WHERE rs.id =
                    ${firstSegmentId}

                LIMIT 1;
            `);

        const firstSegment =
            positionResult[0];

        const geometry =
            firstSegment?.position;

        if (!geometry) {
            console.log(
                `No geometry found for segment ` +
                `${firstSegmentId}. ` +
                `Skipping vehicle.`,
            );

            continue;
        }

        /*
         * --------------------------------------------
         * Determine vehicle speed.
         *
         * Use segment speed limit when available.
         * Otherwise use 30 km/h.
         * --------------------------------------------
         */
        const speedLimit =
            firstSegment.speedLimitKmh !==
                null
                ? Number(
                      firstSegment.speedLimitKmh,
                  )
                : 30;

        /*
         * --------------------------------------------
         * Create vehicle.
         * --------------------------------------------
         */
        const vehicleResult =
            await db.execute(sql`
                INSERT INTO vehicles (
                    simulation_run_id,
                    current_road_id,
                    current_segment_id,
                    destination_intersection_id,
                    route_sequence,
                    position,
                    speed_kmh,
                    progress,
                    status
                )
                VALUES (
                    ${simulationRunId},

                    ${firstSegment.roadId},

                    ${firstSegmentId},

                    ${destinationIntersectionId},

                    0,

                    ST_SetSRID(
                        ST_GeomFromGeoJSON(
                            ${JSON.stringify(
                                geometry,
                            )}
                        ),
                        4326
                    ),

                    ${speedLimit},

                    0,

                    'WAITING'
                )

                RETURNING
                    id,

                    simulation_run_id
                        AS "simulationRunId",

                    current_road_id
                        AS "currentRoadId",

                    current_segment_id
                        AS "currentSegmentId",

                    destination_intersection_id
                        AS "destinationIntersectionId",

                    route_sequence
                        AS "routeSequence",

                    speed_kmh
                        AS "speedKmh",

                    status;
            `);

        if (
            vehicleResult.length === 0
        ) {
            continue;
        }

        const vehicle =
            vehicleResult[0] as unknown as
                GeneratedVehicle;

        /*
         * --------------------------------------------
         * Store the complete calculated route.
         *
         * Every route entry now stores:
         *
         *     vehicleId
         *     segmentId
         *     sequence
         *     isReverse
         * --------------------------------------------
         */
        await db.insert(
            vehicleRoutes,
        ).values(
            route.segments.map(
                (
                    routeSegment,
                    sequence,
                ) => ({
                    vehicleId:
                        vehicle.id,

                    segmentId:
                        routeSegment.segmentId,

                    sequence,

                    isReverse:
                        routeSegment.isReverse,
                }),
            ),
        );

        generatedVehicles.push(
            vehicle,
        );
    }

    return generatedVehicles;
}