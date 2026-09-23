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