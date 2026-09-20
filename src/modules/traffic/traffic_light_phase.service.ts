import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
    trafficLights,
    trafficLightPhases,
} from "@/db/schema";

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
            state:
                trafficLightPhases.state,
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

export async function getTrafficLightPhases(
    trafficLightId: number,
) {
    return db
        .select({
            id: trafficLightPhases.id,
            trafficLightId:
                trafficLightPhases.trafficLightId,
            phaseNumber:
                trafficLightPhases.phaseNumber,
            durationSeconds:
                trafficLightPhases.durationSeconds,
            state:
                trafficLightPhases.state,
        })
        .from(trafficLightPhases)
        .where(
            eq(
                trafficLightPhases.trafficLightId,
                trafficLightId,
            ),
        )
        .orderBy(
            trafficLightPhases.phaseNumber,
        );
}