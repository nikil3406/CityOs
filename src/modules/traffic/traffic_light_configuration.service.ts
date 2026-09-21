import { and, eq } from "drizzle-orm";

import { db } from "@/db";

import {
    trafficLights,
    trafficLightMovements,
} from "@/db/schema";

import {
    classifyIntersectionMovements,
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

export async function generateTrafficLightConfiguration(
    cityId: number,
    intersectionId: number,
): Promise<TrafficLightMovementConfiguration[]> {
    const topology =
        await getIntersectionTopology(
            cityId,
            intersectionId,
        );

    const movements =
        await classifyIntersectionMovements(
            topology.incomingSegments.map(
                (segment) => ({
                    id: segment.id,
                    roadId: segment.roadId,
                }),
            ),
            topology.outgoingSegments.map(
                (segment) => ({
                    id: segment.id,
                    roadId: segment.roadId,
                }),
            ),
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

    await db.transaction(
        async (tx) => {
            await tx
                .delete(
                    trafficLightMovements,
                )
                .where(
                    eq(
                        trafficLightMovements.trafficLightId,
                        trafficLightId,
                    ),
                );

            const rows =
                configuration.flatMap(
                    (movement) =>
                        movement.states.map(
                            (state) => ({
                                trafficLightId,

                                phaseNumber:
                                    state.phase,

                                fromRoadId:
                                    movement.incomingRoadId,

                                toRoadId:
                                    movement.outgoingRoadId,

                                state:
                                    state.state,
                            }),
                        ),
                );

            if (rows.length === 0) {
                throw new Error(
                    `No movements generated for traffic light ${trafficLightId}`,
                );
            }

            await tx
                .insert(
                    trafficLightMovements,
                )
                .values(rows);
        },
    );

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