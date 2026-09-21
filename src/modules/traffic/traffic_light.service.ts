import { eq } from "drizzle-orm";

import { db } from "@/db";
import { trafficLights } from "@/db/schema";

import {
    getTrafficLightPhase,
    getTrafficLightPhases,
} from "./traffic_light_phase.service";

export async function getTrafficLight(
    trafficLightId: number,
) {
    const result = await db
        .select({
            id: trafficLights.id,
            cityId: trafficLights.cityId,
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
                trafficLights.id,
                trafficLightId,
            ),
        )
        .limit(1);

    return result[0] ?? null;
}

export async function updateTrafficLight(
    trafficLightId: number,
) {
    const light =
        await getTrafficLight(
            trafficLightId,
        );

    if (!light) {
        throw new Error(
            `Traffic light ${trafficLightId} not found`,
        );
    }

    if (light.status !== "ACTIVE") {
        return light;
    }

    const phase =
        await getTrafficLightPhase(
            trafficLightId,
            light.currentPhase,
        );

    if (!phase) {
        throw new Error(
            `Phase ${light.currentPhase} not found for traffic light ${trafficLightId}`,
        );
    }

    const newElapsed =
        light.phaseElapsed + 1;

    if (
        newElapsed <
        phase.durationSeconds
    ) {
        const result = await db
            .update(trafficLights)
            .set({
                phaseElapsed:
                    newElapsed,
                updatedAt:
                    new Date(),
            })
            .where(
                eq(
                    trafficLights.id,
                    trafficLightId,
                ),
            )
            .returning();

        return result[0];
    }

    /*
     * Phase progression will be made
     * dynamic after the six-phase
     * strategy is implemented.
     *
     * For now this preserves the
     * currently working behavior.
     */
    const nextPhase =
        await getNextTrafficLightPhase(
            light.id,
            light.currentPhase,
        );

    if (!nextPhase) {
        throw new Error(
            `No phases configured for traffic light ${light.id}`,
        );
    }

    const result = await db
        .update(trafficLights)
        .set({
            currentPhase:
                nextPhase.phaseNumber,
            phaseElapsed: 0,
            updatedAt:
                new Date(),
        })
        .where(
            eq(
                trafficLights.id,
                trafficLightId,
            ),
        )
        .returning();

    return result[0];
}

async function getNextTrafficLightPhase(
    trafficLightId: number,
    currentPhase: number,
) {
    const phases =
        await getTrafficLightPhases(
            trafficLightId,
        );

    if (phases.length === 0) {
        return null;
    }

    const currentIndex =
        phases.findIndex(
            (phase) =>
                phase.phaseNumber ===
                currentPhase,
        );

    if (currentIndex === -1) {
        return phases[0];
    }

    const nextIndex =
        (currentIndex + 1) %
        phases.length;

    return phases[nextIndex];
}

export async function updateTrafficLights(
    cityId: number,
) {
    const lights = await db
        .select({
            id: trafficLights.id,
        })
        .from(trafficLights)
        .where(
            eq(
                trafficLights.cityId,
                cityId,
            ),
        );

    for (const light of lights) {
        await updateTrafficLight(
            light.id,
        );
    }
}