import { eq, and } from "drizzle-orm";

import { db } from "@/db";
import {
    trafficLights,
    trafficLightPhases,
} from "@/db/schema";

export async function getTrafficLight(
    trafficLightId: number,
) {
    const result = await db
        .select({
            id: trafficLights.id,
            cityId: trafficLights.cityId,
            intersectionId: trafficLights.intersectionId,
            cycleDuration: trafficLights.cycleDuration,
            currentPhase: trafficLights.currentPhase,
            phaseElapsed: trafficLights.phaseElapsed,
            status: trafficLights.status,
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

export async function getTrafficLightPhase(
    trafficLightId: number,
    phaseNumber: number,
) {
    const result = await db
        .select({
            id: trafficLightPhases.id,
            trafficLightId:
                trafficLightPhases.trafficLightId,
            phaseNumber:
                trafficLightPhases.phaseNumber,
            durationSeconds:
                trafficLightPhases.durationSeconds,
            state: trafficLightPhases.state,
        })
        .from(trafficLightPhases)
        .where(
            and(
                eq(
                    trafficLightPhases.trafficLightId,
                    trafficLightId,
                ),
                eq(
                    trafficLightPhases.phaseNumber,
                    phaseNumber,
                ),
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
                phaseElapsed: newElapsed,
                updatedAt: new Date(),
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

    const nextPhase =
        light.currentPhase >= 4
            ? 1
            : light.currentPhase + 1;

    const result = await db
        .update(trafficLights)
        .set({
            currentPhase: nextPhase,
            phaseElapsed: 0,
            updatedAt: new Date(),
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