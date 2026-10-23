import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
    trafficLights,
} from "@/db/schema";

import { SimulationConfig } from "@/lib/constants";

import {
    loadTrafficLightCache,
    getCachedTrafficLight,
    getCachedTrafficLights,
    getCachedTrafficLightPhase,
    getCachedTrafficLightPhases,
    updateCachedTrafficLight,
} from "./traffic_light_cache.service";

/**
 * Normal database lookup.
 *
 * Kept for configuration/admin operations.
 * The simulation runtime does NOT use this
 * function every tick.
 */
export async function getTrafficLight(
    trafficLightId: number,
) {
    const result =
        await db
            .select({
                id:
                    trafficLights.id,

                cityId:
                    trafficLights.cityId,

                intersectionId:
                    trafficLights
                        .intersectionId,

                cycleDuration:
                    trafficLights
                        .cycleDuration,

                currentPhase:
                    trafficLights
                        .currentPhase,

                phaseElapsed:
                    trafficLights
                        .phaseElapsed,

                status:
                    trafficLights.status,
            })
            .from(trafficLights)
            .where(
                eq(
                    trafficLights.id,
                    trafficLightId,
                ),
            )
            .limit(1);

    return result[0] ?? null;
}

/**
 * Load the runtime traffic-light cache.
 *
 * Called once when a simulation starts.
 */
export async function initializeTrafficLights(
    cityId: number,
) {
    return loadTrafficLightCache(
        cityId,
    );
}

/**
 * Update one traffic light in RAM.
 *
 * PostgreSQL is updated only when
 * the phase changes.
 */
export async function updateTrafficLight(
    trafficLightId: number,
) {
    const dbLight =
        await getTrafficLight(
            trafficLightId,
        );

    if (!dbLight) {
        throw new Error(
            `Traffic light ${trafficLightId} not found`,
        );
    }

    const cache =
        await initializeTrafficLights(
            Number(
                dbLight.cityId,
            ),
        );

    const light =
        getCachedTrafficLight(
            Number(
                dbLight.cityId,
            ),
            trafficLightId,
        );

    if (!light) {
        throw new Error(
            `Traffic light ${trafficLightId} not found in cache`,
        );
    }

    if (
        light.status !==
        "ACTIVE"
    ) {
        return light;
    }

    const phase =
        getCachedTrafficLightPhase(
            light.cityId,
            light.id,
            light.currentPhase,
        );

    if (!phase) {
        throw new Error(
            `Phase ${light.currentPhase} not found for traffic light ${light.id}`,
        );
    }

    const tickSeconds =
        SimulationConfig.simulationSecondsPerTick;

    if (
        !Number.isFinite(tickSeconds) ||
        tickSeconds <= 0
    ) {
        throw new Error(
            "SimulationConfig.simulationSecondsPerTick must be a positive number",
        );
    }

    const phases =
        getCachedTrafficLightPhases(
            light.cityId,
            light.id,
        );

    const phaseNumbers =
        Array.from(
            phases.keys(),
        ).sort(
            (a, b) => a - b,
        );

    if (
        phaseNumbers.length === 0
    ) {
        throw new Error(
            `No phases configured for traffic light ${light.id}`,
        );
    }

    let elapsedRemaining =
        light.phaseElapsed + tickSeconds;

    let phaseChanged = false;

    /*
     * Carry elapsed time across phase boundaries.
     * This keeps signal timing correct even when one
     * simulation tick represents multiple seconds.
     */
    while (true) {
        const currentPhaseConfig =
            phases.get(light.currentPhase);

        if (!currentPhaseConfig) {
            throw new Error(
                `Phase ${light.currentPhase} not found for traffic light ${light.id}`,
            );
        }

        const durationSeconds =
            Number(currentPhaseConfig.durationSeconds);

        if (
            !Number.isFinite(durationSeconds) ||
            durationSeconds <= 0
        ) {
            throw new Error(
                `Invalid duration for phase ${light.currentPhase} of traffic light ${light.id}`,
            );
        }

        if (elapsedRemaining < durationSeconds) {
            light.phaseElapsed =
                elapsedRemaining;

            break;
        }

        elapsedRemaining -= durationSeconds;

        const currentIndex =
            phaseNumbers.indexOf(
                light.currentPhase,
            );

        light.currentPhase =
            currentIndex === -1 ||
            currentIndex === phaseNumbers.length - 1
                ? phaseNumbers[0]
                : phaseNumbers[currentIndex + 1];

        phaseChanged = true;
    }

    updateCachedTrafficLight(
        light.cityId,
        light,
    );

    /*
     * Persist phase transitions only.
     */
    if (phaseChanged) {
        await db
            .update(trafficLights)
            .set({
                currentPhase:
                    light.currentPhase,

                phaseElapsed:
                    light.phaseElapsed,

                updatedAt:
                    new Date(),
            })
            .where(
                eq(
                    trafficLights.id,
                    light.id,
                ),
            );
    }

    return light;
}

/**
 * Update all traffic lights for one
 * simulation tick.
 *
 * IMPORTANT:
 *
 * There is no SELECT of traffic_lights
 * here during normal operation.
 *
 * Everything comes from RAM.
 */
export async function updateTrafficLights(
    cityId: number,
) {
    let lights =
        getCachedTrafficLights(
            cityId,
        );

    /*
     * Safety fallback in case the simulation
     * was started without initialization.
     */
    if (lights.size === 0) {
        await initializeTrafficLights(
            cityId,
        );

        lights =
            getCachedTrafficLights(
                cityId,
            );
    }

    for (
        const light
        of lights.values()
    ) {
        if (
            light.status !==
            "ACTIVE"
        ) {
            continue;
        }

        const phase =
            getCachedTrafficLightPhase(
                cityId,
                light.id,
                light.currentPhase,
            );

        if (!phase) {
            throw new Error(
                `Phase ${light.currentPhase} not found for traffic light ${light.id}`,
            );
        }

        const tickSeconds =
            SimulationConfig.simulationSecondsPerTick;

        if (
            !Number.isFinite(tickSeconds) ||
            tickSeconds <= 0
        ) {
            throw new Error(
                "SimulationConfig.simulationSecondsPerTick must be a positive number",
            );
        }

        const phases =
            getCachedTrafficLightPhases(
                cityId,
                light.id,
            );

        const phaseNumbers =
            Array.from(
                phases.keys(),
            ).sort(
                (a, b) => a - b,
            );

        if (
            phaseNumbers.length === 0
        ) {
            throw new Error(
                `No phases configured for traffic light ${light.id}`,
            );
        }

        let elapsedRemaining =
            light.phaseElapsed + tickSeconds;

        let phaseChanged = false;

        /*
         * Carry elapsed time across phase boundaries
         * instead of dropping extra simulated seconds.
         */
        while (true) {
            const currentPhaseConfig =
                phases.get(light.currentPhase);

            if (!currentPhaseConfig) {
                throw new Error(
                    `Phase ${light.currentPhase} not found for traffic light ${light.id}`,
                );
            }

            const durationSeconds =
                Number(currentPhaseConfig.durationSeconds);

            if (
                !Number.isFinite(durationSeconds) ||
                durationSeconds <= 0
            ) {
                throw new Error(
                    `Invalid duration for phase ${light.currentPhase} of traffic light ${light.id}`,
                );
            }

            if (elapsedRemaining < durationSeconds) {
                light.phaseElapsed =
                    elapsedRemaining;

                break;
            }

            elapsedRemaining -= durationSeconds;

            const currentIndex =
                phaseNumbers.indexOf(
                    light.currentPhase,
                );

            light.currentPhase =
                currentIndex === -1 ||
                currentIndex === phaseNumbers.length - 1
                    ? phaseNumbers[0]
                    : phaseNumbers[currentIndex + 1];

            phaseChanged = true;
        }

        /*
         * Persist phase transitions only. Elapsed time
         * without a transition remains in the runtime cache.
         */
        if (phaseChanged) {
            await db
                .update(trafficLights)
                .set({
                    currentPhase:
                        light.currentPhase,

                    phaseElapsed:
                        light.phaseElapsed,

                    updatedAt:
                        new Date(),
                })
                .where(
                    eq(
                        trafficLights.id,
                        light.id,
                    ),
                );
        }
    }
}