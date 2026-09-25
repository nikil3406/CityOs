import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
    trafficLights,
    trafficLightPhases,
    trafficLightMovements,
} from "@/db/schema";

let activeTrafficLightCityId:
    number | null = null;

export type CachedTrafficLight = {
    id: number;
    cityId: number;
    intersectionId: number;
    cycleDuration: number;
    currentPhase: number;
    phaseElapsed: number;
    status: string;
};

export type CachedTrafficLightPhase = {
    id: number;
    trafficLightId: number;
    phaseNumber: number;
    durationSeconds: number;
    state: string;
};

export type CachedTrafficLightMovement = {
    trafficLightId: number;
    phaseNumber: number;
    fromRoadId: number;
    toRoadId: number;
    state: "GREEN" | "YELLOW" | "RED";
};

type TrafficLightCache = {
    lights: Map<
        number,
        CachedTrafficLight
    >;

    lightsByIntersection: Map<
        number,
        number[]
    >;

    phasesByLight: Map<
        number,
        Map<
            number,
            CachedTrafficLightPhase
        >
    >;

    movements: Map<
        string,
        CachedTrafficLightMovement
    >;
}

const cachesByCity =
    new Map<number, TrafficLightCache>();

function createEmptyCache(): TrafficLightCache {
    return {
        lights: new Map(),

        lightsByIntersection:
            new Map(),

        phasesByLight:
            new Map(),

        movements:
            new Map(),
    };
}

function movementKey(
    trafficLightId: number,
    phaseNumber: number,
    fromRoadId: number,
    toRoadId: number,
) {
    return [
        trafficLightId,
        phaseNumber,
        fromRoadId,
        toRoadId,
    ].join(":");
}

/**
 * Load all traffic-light information for a city.
 *
 * This is a simulation initialization operation.
 * It should NOT be called on every tick.
 */
export async function loadTrafficLightCache(
    cityId: number,
) {
    const existing =
        cachesByCity.get(cityId);

    if (existing) {
        return existing;
    }

    const cache =
        createEmptyCache();

    /*
     * --------------------------------------------------
     * 1. Traffic-light runtime state
     * --------------------------------------------------
     */
    const lightRows =
        await db
            .select({
                id:
                    trafficLights.id,

                cityId:
                    trafficLights.cityId,

                intersectionId:
                    trafficLights.intersectionId,

                cycleDuration:
                    trafficLights.cycleDuration,

                currentPhase:
                    trafficLights.currentPhase,

                phaseElapsed:
                    trafficLights.phaseElapsed,

                status:
                    trafficLights.status,
            })
            .from(trafficLights)
            .where(
                eq(
                    trafficLights.cityId,
                    cityId,
                ),
            );

    for (const row of lightRows) {
        const light: CachedTrafficLight = {
            id:
                Number(row.id),

            cityId:
                Number(row.cityId),

            intersectionId:
                Number(
                    row.intersectionId,
                ),

            cycleDuration:
                Number(
                    row.cycleDuration,
                ),

            currentPhase:
                Number(
                    row.currentPhase,
                ),

            phaseElapsed:
                Number(
                    row.phaseElapsed,
                ),

            status:
                row.status,
        };

        cache.lights.set(
            light.id,
            light,
        );

        const intersectionLights =
            cache.lightsByIntersection.get(
                light.intersectionId,
            ) ?? [];

        intersectionLights.push(
            light.id,
        );

        cache.lightsByIntersection.set(
            light.intersectionId,
            intersectionLights,
        );
    }

    /*
     * --------------------------------------------------
     * 2. Traffic-light phases
     * --------------------------------------------------
     */
    const phaseRows =
        await db
            .select({
                id:
                    trafficLightPhases.id,

                trafficLightId:
                    trafficLightPhases
                        .trafficLightId,

                phaseNumber:
                    trafficLightPhases
                        .phaseNumber,

                durationSeconds:
                    trafficLightPhases
                        .durationSeconds,

                state:
                    trafficLightPhases
                        .state,
            })
            .from(trafficLightPhases)
            .innerJoin(
                trafficLights,
                eq(
                    trafficLightPhases
                        .trafficLightId,
                    trafficLights.id,
                ),
            )
            .where(
                eq(
                    trafficLights.cityId,
                    cityId,
                ),
            )
            .orderBy(
                asc(
                    trafficLightPhases
                        .trafficLightId,
                ),
                asc(
                    trafficLightPhases
                        .phaseNumber,
                ),
            );

    for (const row of phaseRows) {
        const trafficLightId =
            Number(
                row.trafficLightId,
            );

        let phases =
            cache.phasesByLight.get(
                trafficLightId,
            );

        if (!phases) {
            phases = new Map();

            cache.phasesByLight.set(
                trafficLightId,
                phases,
            );
        }

        phases.set(
            Number(
                row.phaseNumber,
            ),
            {
                id:
                    Number(row.id),

                trafficLightId,

                phaseNumber:
                    Number(
                        row.phaseNumber,
                    ),

                durationSeconds:
                    Number(
                        row.durationSeconds,
                    ),

                state:
                    row.state,
            },
        );
    }

    /*
     * --------------------------------------------------
     * 3. Traffic-light movements
     * --------------------------------------------------
     */
    const movementRows =
        await db
            .select({
                trafficLightId:
                    trafficLightMovements
                        .trafficLightId,

                phaseNumber:
                    trafficLightMovements
                        .phaseNumber,

                fromRoadId:
                    trafficLightMovements
                        .fromRoadId,

                toRoadId:
                    trafficLightMovements
                        .toRoadId,

                state:
                    trafficLightMovements
                        .state,
            })
            .from(
                trafficLightMovements,
            )
            .innerJoin(
                trafficLights,
                eq(
                    trafficLightMovements
                        .trafficLightId,
                    trafficLights.id,
                ),
            )
            .where(
                eq(
                    trafficLights.cityId,
                    cityId,
                ),
            );

    for (const row of movementRows) {
        const trafficLightId =
            Number(
                row.trafficLightId,
            );

        const phaseNumber =
            Number(
                row.phaseNumber,
            );

        const fromRoadId =
            Number(
                row.fromRoadId,
            );

        const toRoadId =
            Number(
                row.toRoadId,
            );

        cache.movements.set(
            movementKey(
                trafficLightId,
                phaseNumber,
                fromRoadId,
                toRoadId,
            ),
            {
                trafficLightId,

                phaseNumber,

                fromRoadId,

                toRoadId,

                state:
                    row.state as
                        | "GREEN"
                        | "YELLOW"
                        | "RED",
            },
        );
    }

    cachesByCity.set(
        cityId,
        cache,
    );

    activeTrafficLightCityId =
    cityId;

    return cache;
}

/**
 * Get all cached traffic lights.
 */
export function getCachedTrafficLights(
    cityId: number,
) {
    return (
        cachesByCity
            .get(cityId)
            ?.lights ??
        new Map<
            number,
            CachedTrafficLight
        >()
    );
}

/**
 * Get one traffic light.
 */
export function getCachedTrafficLight(
    cityId: number,
    trafficLightId: number,
) {
    return cachesByCity
        .get(cityId)
        ?.lights.get(
            trafficLightId,
        );
}

/**
 * Get traffic lights controlling
 * an intersection.
 */
export function getCachedTrafficLightsAtIntersection(
    intersectionId: number,
) {
    if (
        activeTrafficLightCityId ===
        null
    ) {
        return [];
    }

    const cache =
        cachesByCity.get(
            activeTrafficLightCityId,
        );

    if (!cache) {
        return [];
    }

    const ids =
        cache.lightsByIntersection.get(
            intersectionId,
        ) ?? [];

    return ids
        .map(
            (id) =>
                cache.lights.get(id),
        )
        .filter(
            (
                light,
            ): light is CachedTrafficLight =>
                light !== undefined,
        );
}

/**
 * Get one phase.
 */
export function getCachedTrafficLightPhase(
    cityId: number,
    trafficLightId: number,
    phaseNumber: number,
) {
    return cachesByCity
        .get(cityId)
        ?.phasesByLight
        .get(trafficLightId)
        ?.get(phaseNumber);
}

/**
 * Get all phases for one light.
 */
export function getCachedTrafficLightPhases(
    cityId: number,
    trafficLightId: number,
) {
    return (
        cachesByCity
            .get(cityId)
            ?.phasesByLight
            .get(trafficLightId) ??
        new Map<
            number,
            CachedTrafficLightPhase
        >()
    );
}

/**
 * Get exact movement signal.
 */
export function getCachedMovement(
    cityId: number,
    trafficLightId: number,
    phaseNumber: number,
    fromRoadId: number,
    toRoadId: number,
) {
    return cachesByCity
        .get(cityId)
        ?.movements.get(
            movementKey(
                trafficLightId,
                phaseNumber,
                fromRoadId,
                toRoadId,
            ),
        );
}

/**
 * Update runtime traffic-light state
 * inside RAM.
 */
export function updateCachedTrafficLight(
    cityId: number,
    trafficLight: CachedTrafficLight,
) {
    const cache =
        cachesByCity.get(cityId);

    if (!cache) {
        return;
    }

    cache.lights.set(
        trafficLight.id,
        trafficLight,
    );
}

/**
 * Remove the cache when a simulation
 * finishes.
 */
export function clearTrafficLightCache(
    cityId: number,
) {
    cachesByCity.delete(
        cityId,
    );

    if (
        activeTrafficLightCityId ===
        cityId
    ) {
        activeTrafficLightCityId =
            null;
    }
}