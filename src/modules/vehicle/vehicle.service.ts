import { sql } from "drizzle-orm";

import { db } from "@/db";
import { vehicleRoutes } from "@/db/schema";

import {
    getReachableIntersections,
    findShortestRoute,
    validateSelectedRoute,
    type RouteResult,
    type RoutingStrategy,
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

type VehiclePlan = {
    route: RouteResult;
    destinationIntersectionId: number;
    firstSegmentId: number;
    firstSegmentIsReverse: boolean;
    firstRoadId: number;
    speedKmh: number;
    geometry: unknown;
};

export type VehicleRouteEndpoints = {
    sourceIntersectionId: number;
    destinationIntersectionId: number;
    route: RouteResult;
    strategy: RoutingStrategy;
};

/**
 * Generate exactly `count` vehicles, or fail before inserting any vehicles if
 * the city's available road network cannot provide enough valid routes.
 *
 * The initial vehicle state is MOVING because it is created with positive speed
 * at the beginning of its first route segment.
 */
export async function generateVehicles(
    simulationRunId: number,
    count: number,
    endpoints?: VehicleRouteEndpoints | VehicleRouteEndpoints[],
): Promise<GeneratedVehicle[]> {
    if (!Number.isInteger(count) || count <= 0) {
        throw new Error("Vehicle count must be a positive integer");
    }

    const simulationResult = await db.execute(sql`
        SELECT city_id AS "cityId"
        FROM simulation_runs
        WHERE id = ${simulationRunId}
        LIMIT 1;
    `);

    if (simulationResult.length === 0) {
        throw new Error("Simulation run not found");
    }

    const cityId = Number(
        (simulationResult[0] as { cityId: number | string }).cityId,
    );

    const manualRoutes = endpoints
        ? Array.isArray(endpoints) ? endpoints : [endpoints]
        : null;
    if (manualRoutes?.some((route) =>
        !Number.isInteger(route.sourceIntersectionId) ||
        !Number.isInteger(route.destinationIntersectionId) ||
        route.sourceIntersectionId <= 0 || route.destinationIntersectionId <= 0 ||
        route.sourceIntersectionId === route.destinationIntersectionId
    )) throw new Error("Each route needs two different valid intersections");

    const validatedManualRoutes = manualRoutes
        ? await Promise.all(manualRoutes.map(async (route) => ({
              ...route,
              route: await validateSelectedRoute(
                  cityId,
                  route.sourceIntersectionId,
                  route.destinationIntersectionId,
                  route.route,
                  route.strategy,
              ),
          })))
        : null;

    const segmentResult = await db.execute(sql`
        SELECT
            rs.id,
            rs.road_id AS "roadId",
            rs.speed_limit_kmh AS "speedLimitKmh",
            rs.start_intersection_id AS "startIntersectionId",
            rs.end_intersection_id AS "endIntersectionId"
        FROM road_segments rs
        JOIN roads r ON r.id = rs.road_id
        WHERE
            r.city_id = ${cityId}
            AND LOWER(COALESCE(r.type, '')) <> 'footway'
        ORDER BY RANDOM();
    `);

    const candidates = (segmentResult as unknown as SelectedSegment[]).map(
        (segment) => ({
            id: Number(segment.id),
            roadId: Number(segment.roadId),
            speedLimitKmh:
                segment.speedLimitKmh === null
                    ? null
                    : Number(segment.speedLimitKmh),
            startIntersectionId: Number(segment.startIntersectionId),
            endIntersectionId: Number(segment.endIntersectionId),
        }),
    ).filter((segment) => !validatedManualRoutes || validatedManualRoutes.some((route) =>
        segment.startIntersectionId === route.sourceIntersectionId ||
        segment.endIntersectionId === route.sourceIntersectionId));

    // Manual mode creates the requested fleet on one selected route. Reuse
    // source-connected candidates so vehicle count is not capped by the source
    // intersection's number of adjacent road segments.
    if (validatedManualRoutes && candidates.length > 0) {
        const sourceCandidates = [...candidates];
        while (candidates.length < count) {
            candidates.push(
                sourceCandidates[candidates.length % sourceCandidates.length],
            );
        }
    }

    if (candidates.length === 0) {
        throw new Error("No usable road segments are available for this city");
    }

    const reachableByStart = new Map<number, number[]>();
    const manualPlansByRoute = new Map<string, VehiclePlan>();
    const plans: VehiclePlan[] = [];

    // Try candidates until enough valid route plans are found.
    for (const candidate of candidates) {
        if (plans.length >= count) break;

        const selectedRoute = validatedManualRoutes
            ? validatedManualRoutes[plans.length % validatedManualRoutes.length]
            : null;
        const selectedRouteKey = selectedRoute
            ? `${selectedRoute.sourceIntersectionId}:${selectedRoute.destinationIntersectionId}`
            : null;
        const existingManualPlan = selectedRouteKey
            ? manualPlansByRoute.get(selectedRouteKey)
            : undefined;
        if (existingManualPlan) {
            plans.push(existingManualPlan);
            continue;
        }
        const startIntersectionId = selectedRoute?.sourceIntersectionId ?? candidate.startIntersectionId;
        let reachable = reachableByStart.get(startIntersectionId);

        if (!reachable) {
            reachable = await getReachableIntersections(
                cityId,
                startIntersectionId,
            );
            reachableByStart.set(startIntersectionId, reachable);
        }

        const destinations = (selectedRoute ? [selectedRoute.destinationIntersectionId] : reachable).filter(
            (intersectionId) => intersectionId !== startIntersectionId,
        );
        if (destinations.length === 0) continue;

        // Try multiple reachable destinations for this start before skipping it.
        const shuffledDestinations = [...destinations];
        for (let i = shuffledDestinations.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledDestinations[i], shuffledDestinations[j]] =
                [shuffledDestinations[j], shuffledDestinations[i]];
        }

        let planForCandidate: VehiclePlan | null = null;

        for (const destinationIntersectionId of shuffledDestinations) {
            const route = selectedRoute
                ? selectedRoute.route
                : await findShortestRoute(
                      cityId,
                      startIntersectionId,
                      destinationIntersectionId,
                  );

            if (!route || route.segments.length === 0) continue;

            const firstRouteSegment = route.segments[0];
            const initialGeometryProgress =
                firstRouteSegment.isReverse ? 1 : 0;

            const positionResult = await db.execute(sql`
                SELECT
                    r.id AS "roadId",
                    rs.id AS "segmentId",
                    rs.speed_limit_kmh AS "speedLimitKmh",
                    ST_AsGeoJSON(
                        ST_LineInterpolatePoint(
                            rs.geometry,
                            ${initialGeometryProgress}
                        )
                    )::json AS position
                FROM road_segments rs
                JOIN roads r ON r.id = rs.road_id
                WHERE rs.id = ${firstRouteSegment.segmentId}
                  AND r.city_id = ${cityId}
                LIMIT 1;
            `);

            if (positionResult.length === 0) continue;

            const row = positionResult[0] as unknown as {
                roadId: number | string;
                segmentId: number | string;
                speedLimitKmh: number | string | null;
                position: unknown;
            };

            let geometry = row.position;
            if (typeof geometry === "string") {
                try {
                    geometry = JSON.parse(geometry);
                } catch {
                    continue;
                }
            }
            if (!geometry || typeof geometry !== "object") continue;

            const rawSpeedLimit =
                row.speedLimitKmh === null
                    ? NaN
                    : Number(row.speedLimitKmh);
            const speedKmh =
                Number.isFinite(rawSpeedLimit) && rawSpeedLimit > 0
                    ? rawSpeedLimit
                    : 30;

            planForCandidate = {
                route,
                destinationIntersectionId,
                firstSegmentId: Number(row.segmentId),
                firstSegmentIsReverse: firstRouteSegment.isReverse,
                firstRoadId: Number(row.roadId),
                speedKmh,
                geometry,
            };
            break;
        }

        if (planForCandidate) {
            plans.push(planForCandidate);
            if (selectedRouteKey) manualPlansByRoute.set(selectedRouteKey, planForCandidate);
        }
    }

    if (plans.length < count) {
        throw new Error(
            `Could generate only ${plans.length} valid vehicle routes; ` +
            `${count} were requested. No vehicles were inserted. ` +
            `Check network connectivity and usable road segments.`,
        );
    }

    // Insert the complete batch atomically so a database error does not leave
    // a partially generated fleet behind.
    return db.transaction(async (tx) => {
        const generatedVehicles: GeneratedVehicle[] = [];

        for (const plan of plans.slice(0, count)) {
            const vehicleResult = await tx.execute(sql`
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
                    ${plan.firstRoadId},
                    ${plan.firstSegmentId},
                    ${plan.destinationIntersectionId},
                    0,
                    ST_SetSRID(
                        ST_GeomFromGeoJSON(${JSON.stringify(plan.geometry)}),
                        4326
                    ),
                    ${plan.speedKmh},
                    ${plan.firstSegmentIsReverse ? 1 : 0},
                    'MOVING'
                )
                RETURNING
                    id,
                    simulation_run_id AS "simulationRunId",
                    current_road_id AS "currentRoadId",
                    current_segment_id AS "currentSegmentId",
                    destination_intersection_id AS "destinationIntersectionId",
                    route_sequence AS "routeSequence",
                    speed_kmh AS "speedKmh",
                    status;
            `);

            if (vehicleResult.length === 0) {
                throw new Error(
                    `Failed to create vehicle for segment ${plan.firstSegmentId}`,
                );
            }

            const vehicle = vehicleResult[0] as unknown as GeneratedVehicle;

            await tx.insert(vehicleRoutes).values(
                plan.route.segments.map((routeSegment, sequence) => ({
                    vehicleId: vehicle.id,
                    segmentId: routeSegment.segmentId,
                    sequence,
                    isReverse: routeSegment.isReverse,
                })),
            );

            generatedVehicles.push(vehicle);
        }

        return generatedVehicles;
    });
}
