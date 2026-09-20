import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
    trafficLights,
    trafficLightMovements,
} from "@/db/schema";

export type TrafficLightDecision = {
    hasTrafficLight: boolean;
    state: "GREEN" | "YELLOW" | "RED";
    phase: number | null;
    trafficLightId: number | null;
};

/*
 * Find the traffic-light decision for an exact movement.
 *
 * Important:
 *
 * The current phase and the movement MUST come from
 * the SAME traffic light.
 *
 * We therefore do not:
 *
 *     1. find an arbitrary traffic light
 *     2. get its phase
 *     3. find a movement separately
 *
 * Instead, we join traffic_lights with
 * traffic_light_movements and find the movement
 * belonging to the traffic light's current phase.
 */
export async function getMovementSignal(
    intersectionId: number,
    fromRoadId: number,
    toRoadId: number,
): Promise<TrafficLightDecision> {

    const movementRows = await db
        .select({
            trafficLightId:
                trafficLights.id,

            currentPhase:
                trafficLights.currentPhase,

            state:
                trafficLightMovements.state,
        })
        .from(trafficLightMovements)
        .innerJoin(
            trafficLights,
            eq(
                trafficLightMovements.trafficLightId,
                trafficLights.id,
            ),
        )
        .where(
            and(

                /*
                 * The traffic light controls
                 * this intersection.
                 */
                eq(
                    trafficLights.intersectionId,
                    intersectionId,
                ),

                /*
                 * Only active traffic lights
                 * participate in simulation.
                 */
                eq(
                    trafficLights.status,
                    "ACTIVE",
                ),

                /*
                 * Exact movement:
                 *
                 * current road → next road
                 */
                eq(
                    trafficLightMovements.fromRoadId,
                    fromRoadId,
                ),

                eq(
                    trafficLightMovements.toRoadId,
                    toRoadId,
                ),

                /*
                 * MOST IMPORTANT CONDITION:
                 *
                 * Use the movement belonging to
                 * the traffic light's CURRENT phase.
                 */
                eq(
                    trafficLightMovements.phaseNumber,
                    trafficLights.currentPhase,
                ),
            ),
        )
        .limit(1);

    /*
     * Exact movement is controlled by a traffic light.
     */
    if (movementRows.length > 0) {
        const movement = movementRows[0];

        return {
            hasTrafficLight: true,

            state:
                movement.state as
                    | "GREEN"
                    | "YELLOW"
                    | "RED",

            phase:
                movement.currentPhase,

            trafficLightId:
                movement.trafficLightId,
        };
    }

    /*
     * We did not find a configured movement.
     *
     * Check whether this intersection has
     * any active traffic light.
     */
    const activeLights = await db
        .select({
            id: trafficLights.id,
        })
        .from(trafficLights)
        .where(
            and(
                eq(
                    trafficLights.intersectionId,
                    intersectionId,
                ),

                eq(
                    trafficLights.status,
                    "ACTIVE",
                ),
            ),
        )
        .limit(1);

    /*
     * No active traffic light at this intersection.
     *
     * Vehicle can continue.
     */
    if (activeLights.length === 0) {
        return {
            hasTrafficLight: false,
            state: "GREEN",
            phase: null,
            trafficLightId: null,
        };
    }

    /*
     * There is an active traffic light,
     * but this particular movement has
     * not been configured.
     *
     * Fail safely.
     */
    return {
        hasTrafficLight: true,
        state: "RED",
        phase: null,
        trafficLightId:
            activeLights[0].id,
    };
}