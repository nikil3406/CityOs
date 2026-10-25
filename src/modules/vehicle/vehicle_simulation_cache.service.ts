import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";

import {
    roadSegments,
    vehicleRoutes,
    vehicles,
} from "@/db/schema";

export type CachedRoadSegment = {
    id: number;
    roadId: number;
    speedLimitKmh: number | null;
    lengthMeters: number;
    startIntersectionId: number;
    endIntersectionId: number;
};

export type CachedRoute = {
    segmentId: number | null;
    sequence: number;
    isReverse: boolean;
};

export type SimulationVehicleCache = {
    routesByVehicle: Map<
        number,
        Map<number, CachedRoute>
    >;

    segments: Map<
        number,
        CachedRoadSegment
    >;
};

const simulationCaches =
    new Map<
        number,
        SimulationVehicleCache
    >();

export async function loadSimulationVehicleCache(
    simulationRunId: number,
): Promise<SimulationVehicleCache> {

    const existing =
        simulationCaches.get(
            simulationRunId,
        );

    if (existing) {
        return existing;
    }

    /*
     * ------------------------------------------------
     * LOAD ALL ROUTES FOR THIS SIMULATION
     * ------------------------------------------------
     */

    const routeRows =
        await db
            .select({
                vehicleId:
                    vehicleRoutes.vehicleId,

                segmentId:
                    vehicleRoutes.segmentId,

                sequence:
                    vehicleRoutes.sequence,

                isReverse:
                    vehicleRoutes.isReverse,
            })
            .from(vehicleRoutes)
            .innerJoin(
                vehicles,
                eq(
                    vehicleRoutes.vehicleId,
                    vehicles.id,
                ),
            )
            .where(
                eq(
                    vehicles.simulationRunId,
                    simulationRunId,
                ),
            );

    /*
     * vehicleId
     *     ↓
     * sequence
     *     ↓
     * route entry
     */

    const routesByVehicle =
        new Map<
            number,
            Map<number, CachedRoute>
        >();

    const segmentIds =
        new Set<number>();

    for (const route of routeRows) {

        const vehicleId =
            Number(
                route.vehicleId,
            );

        const sequence =
            Number(
                route.sequence,
            );

        const segmentId =
            route.segmentId === null
                ? null
                : Number(
                    route.segmentId,
                );

        if (segmentId !== null) {
            segmentIds.add(
                segmentId,
            );
        }

        if (
            !routesByVehicle.has(
                vehicleId,
            )
        ) {
            routesByVehicle.set(
                vehicleId,
                new Map(),
            );
        }

        routesByVehicle
            .get(vehicleId)!
            .set(
                sequence,
                {
                    segmentId,
                    sequence,
                    isReverse:
                        route.isReverse === true,
                },
            );
    }

    /*
     * ------------------------------------------------
     * LOAD ONLY THE ROAD SEGMENTS USED BY THESE ROUTES
     * ------------------------------------------------
     */

    const segments =
        new Map<
            number,
            CachedRoadSegment
        >();

    const segmentIdList =
        Array.from(
            segmentIds,
        );

    if (segmentIdList.length > 0) {

        const segmentRows =
            await db
                .select({
                    id:
                        roadSegments.id,

                    roadId:
                        roadSegments.roadId,

                    speedLimitKmh:
                        roadSegments.speedLimitKmh,

                    lengthMeters:
                        roadSegments.lengthMeters,

                    startIntersectionId:
                        roadSegments.startIntersectionId,

                    endIntersectionId:
                        roadSegments.endIntersectionId,
                })
                .from(roadSegments)
                .where(
                    inArray(
                        roadSegments.id,
                        segmentIdList,
                    ),
                );

        for (
            const segment
            of segmentRows
        ) {
            const id =
                Number(
                    segment.id,
                );

            segments.set(
                id,
                {
                    id,

                    roadId:
                        Number(
                            segment.roadId,
                        ),

                    speedLimitKmh:
                        segment.speedLimitKmh !== null
                            ? Number(segment.speedLimitKmh)
                            : null,

                    lengthMeters:
                        Number(
                            segment.lengthMeters,
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
            );
        }
    }

    const cache: SimulationVehicleCache = {
        routesByVehicle,
        segments,
    };

    simulationCaches.set(
        simulationRunId,
        cache,
    );

    console.log(
        `Simulation ${simulationRunId}: ` +
        `vehicle cache loaded | ` +
        `Routes: ${routeRows.length} | ` +
        `Segments: ${segments.size}`,
    );

    return cache;
}

export function clearSimulationVehicleCache(
    simulationRunId: number,
) {
    simulationCaches.delete(
        simulationRunId,
    );

    console.log(
        `Simulation ${simulationRunId}: ` +
        `vehicle cache cleared`,
    );
}

export function getSimulationVehicleCache(
    simulationRunId: number,
): SimulationVehicleCache | null {
    return (
        simulationCaches.get(
            simulationRunId,
        ) ?? null
    );
}

/** Replace one cached route suffix synchronously after its DB transaction commits. */
export function replaceCachedVehicleRouteSuffix(
    simulationRunId: number,
    vehicleId: number,
    fromSequence: number,
    replacement: CachedRoute[],
    replacementSegments: CachedRoadSegment[],
): boolean {
    const cache = simulationCaches.get(simulationRunId);
    const currentRoute = cache?.routesByVehicle.get(vehicleId);
    if (!cache || !currentRoute) return false;

    const nextRoute = new Map(
        Array.from(currentRoute.entries()).filter(([sequence]) => sequence < fromSequence),
    );
    for (const entry of replacement) {
        if (!Number.isInteger(entry.sequence) || entry.sequence < fromSequence || nextRoute.has(entry.sequence)) return false;
        nextRoute.set(entry.sequence, { ...entry });
    }
    const sequences = Array.from(nextRoute.keys()).sort((a, b) => a - b);
    if (sequences.some((sequence, index) => index > 0 && sequence !== sequences[index - 1] + 1)) return false;

    const nextSegments = new Map(cache.segments);
    for (const segment of replacementSegments) nextSegments.set(segment.id, segment);
    cache.segments = nextSegments;
    cache.routesByVehicle.set(vehicleId, nextRoute);
    return true;
}
