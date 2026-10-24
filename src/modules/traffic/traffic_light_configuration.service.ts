import { and, eq } from "drizzle-orm";

import { db } from "@/db";

import {
    trafficLights,
    trafficLightMovements,
    trafficLightPhases,
} from "@/db/schema";

import {
    classifyAllIntersectionMovements,
} from "@/modules/road/road_geometry.service";

import {
    getIntersectionTopology,
} from "@/modules/road/road_network.service";

import {
    getMovementPhase,
    getMovementState,
    type TrafficLightPhaseNumber,
    type TrafficLightMovementState,
} from "./traffic_light_strategy";

import {
    clearTrafficLightCache,
    loadTrafficLightCache,
} from "./traffic_light_cache.service";



export type TrafficLightMovementConfiguration = {
    incomingSegmentId: number;
    outgoingSegmentId: number;

    incomingRoadId: number;
    outgoingRoadId: number;

    approach:
        | "NORTH_SOUTH"
        | "EAST_WEST";

    turn:
        | "STRAIGHT"
        | "RIGHT"
        | "LEFT";

    movementPhase:
        TrafficLightPhaseNumber;

    states: {
        phase:
            TrafficLightPhaseNumber;
        state:
            TrafficLightMovementState;
    }[];
};

const TRAFFIC_LIGHT_PHASES = [
    { phaseNumber: 1, durationSeconds: 20, state: "GREEN" },
    { phaseNumber: 2, durationSeconds: 3, state: "YELLOW" },
    { phaseNumber: 3, durationSeconds: 20, state: "GREEN" },
    { phaseNumber: 4, durationSeconds: 3, state: "YELLOW" },
    { phaseNumber: 5, durationSeconds: 10, state: "GREEN" },
    { phaseNumber: 6, durationSeconds: 10, state: "GREEN" },
] as const;

const TRAFFIC_LIGHT_CYCLE_DURATION = 66;

export async function generateTrafficLightConfiguration(
    cityId: number,
    intersectionId: number,
): Promise<TrafficLightMovementConfiguration[]> {
    
    const topology =
        await getIntersectionTopology(
            cityId,
            intersectionId,
        );

    const connectedSegments = Array.from(
        new Map(
            [
                ...topology.incomingSegments,
                ...topology.outgoingSegments,
            ].map((segment) => [segment.id, segment]),
        ).values(),
    );

    const movements =
        await classifyAllIntersectionMovements(
            connectedSegments,
            intersectionId,
        );

    return movements.map(
        (movement) => ({
            incomingSegmentId:
                movement.incomingSegmentId,

            outgoingSegmentId:
                movement.outgoingSegmentId,

            incomingRoadId:
                movement.incomingRoadId,

            outgoingRoadId:
                movement.outgoingRoadId,

            approach:
                movement.approach,

            turn:
                movement.turn,

            movementPhase:
                getMovementPhase(
                    movement.approach,
                    movement.turn,
                ),

            states: [1, 2, 3, 4, 5, 6].map(
                (phase) => ({
                    phase:
                        phase as TrafficLightPhaseNumber,

                    state:
                        getMovementState(
                            movement.approach,
                            movement.turn,
                            phase as TrafficLightPhaseNumber,
                        ),
                }),
            ),
        }),
    );
}

export async function configureTrafficLight(
    trafficLightId: number,
) {
    const trafficLight =
        await db
            .select({
                id: trafficLights.id,
                cityId: trafficLights.cityId,
                intersectionId:
                    trafficLights.intersectionId,
            })
            .from(trafficLights)
            .where(
                eq(
                    trafficLights.id,
                    trafficLightId,
                ),
            )
            .limit(1);

    if (trafficLight.length === 0) {
        throw new Error(
            `Traffic light ${trafficLightId} not found`,
        );
    }

    const light = trafficLight[0];

    const configuration =
        await generateTrafficLightConfiguration(
            light.cityId,
            light.intersectionId,
        );

    
    await db.transaction(async (tx) => {
        // 1. Remove existing movement-state records.
        await tx
            .delete(trafficLightMovements)
            .where(
                eq(
                    trafficLightMovements.trafficLightId,
                    trafficLightId,
                ),
            );

        // 2. Remove existing phase records.
        await tx
            .delete(trafficLightPhases)
            .where(
                eq(
                    trafficLightPhases.trafficLightId,
                    trafficLightId,
                ),
            );

        // 3. Insert the six phases.
        await tx
            .insert(trafficLightPhases)
            .values(
                TRAFFIC_LIGHT_PHASES.map((phase) => ({
                    trafficLightId,
                    phaseNumber: phase.phaseNumber,
                    durationSeconds: phase.durationSeconds,
                    state: phase.state,
                })),
            );

        // 4. Generate all movement states across six phases.
        const rows = configuration.flatMap((movement) =>
            movement.states.map((state) => ({
                trafficLightId,
                phaseNumber: state.phase,
                fromRoadId: movement.incomingRoadId,
                toRoadId: movement.outgoingRoadId,
                state: state.state,
            })),
        );

        if (rows.length === 0) {
            throw new Error(
                `No movements generated for traffic light ${trafficLightId}`,
            );
        }

        // 5. Insert the movement states.
        await tx
            .insert(trafficLightMovements)
            .values(rows);

        // 6. Synchronize the cycle duration and reset the phase timer.
        await tx
            .update(trafficLights)
            .set({
                cycleDuration: TRAFFIC_LIGHT_CYCLE_DURATION,
                currentPhase: 1,
                phaseElapsed: 0,
                updatedAt: new Date(),
            })
            .where(
                eq(trafficLights.id, trafficLightId),
            );
    });

    // Signal reads during simulation use the in-memory cache. Reload it so
    // vehicles see the newly persisted movement states and phase schedule.
    clearTrafficLightCache(light.cityId);
    await loadTrafficLightCache(light.cityId);

    return {
        trafficLightId,
        cityId: light.cityId,
        intersectionId:
            light.intersectionId,
        movementCount:
            configuration.length,
        stateCount:
            configuration.reduce(
                (total, movement) =>
                    total +
                    movement.states.length,
                0,
            ),
    };
}
