import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
    vehicles,
    vehicleRoutes,
} from "@/db/schema";

export type SimulationVehicleState = {
    id: number;
    simulationRunId: number;
    currentSegmentId: number | null;
    destinationIntersectionId: number | null;
    routeSequence: number;
    speedKmh: number;
    progress: number;
    status: string;
    isReverse: boolean;
};

const vehicleStatesBySimulation =
    new Map<
        number,
        Map<number, SimulationVehicleState>
    >();

export async function initializeSimulationVehicleStates(
    simulationRunId: number,
) {
    const vehicleRows =
        await db
            .select({
                id:
                    vehicles.id,

                simulationRunId:
                    vehicles.simulationRunId,

                currentSegmentId:
                    vehicles.currentSegmentId,

                destinationIntersectionId:
                    vehicles.destinationIntersectionId,

                routeSequence:
                    vehicles.routeSequence,

                speedKmh:
                    vehicles.speedKmh,

                progress:
                    vehicles.progress,

                status:
                    vehicles.status,

                isReverse:
                    vehicleRoutes.isReverse,
            })
            .from(vehicles)
            .leftJoin(
                vehicleRoutes,
                and(
                    eq(
                        vehicleRoutes.vehicleId,
                        vehicles.id,
                    ),

                    eq(
                        vehicleRoutes.sequence,
                        vehicles.routeSequence,
                    ),
                ),
            )
            .where(
                eq(
                    vehicles.simulationRunId,
                    simulationRunId,
                ),
            );

    setSimulationVehicleStates(
        simulationRunId,

        vehicleRows.map(
            (vehicle) => ({
                id:
                    Number(
                        vehicle.id,
                    ),

                simulationRunId:
                    Number(
                        vehicle.simulationRunId,
                    ),

                currentSegmentId:
                    vehicle.currentSegmentId ===
                    null
                        ? null
                        : Number(
                              vehicle.currentSegmentId,
                          ),

                destinationIntersectionId:
                    vehicle.destinationIntersectionId ===
                    null
                        ? null
                        : Number(
                              vehicle.destinationIntersectionId,
                          ),

                routeSequence:
                    Number(
                        vehicle.routeSequence,
                    ),

                speedKmh:
                    Number(
                        vehicle.speedKmh,
                    ),

                progress:
                    Number(
                        vehicle.progress,
                    ),

                status:
                    vehicle.status,

                isReverse:
                    Boolean(
                        vehicle.isReverse,
                    ),
            }),
        ),
    );
}

export function setSimulationVehicleStates(
    simulationRunId: number,
    vehicles: SimulationVehicleState[],
) {
    const states =
        new Map<
            number,
            SimulationVehicleState
        >();

    for (
        const vehicle of vehicles
    ) {
        states.set(
            vehicle.id,
            vehicle,
        );
    }

    vehicleStatesBySimulation.set(
        simulationRunId,
        states,
    );
}

export function getSimulationVehicleStates(
    simulationRunId: number,
) {
    return (
        vehicleStatesBySimulation.get(
            simulationRunId,
        ) ??
        new Map<
            number,
            SimulationVehicleState
        >()
    );
}

export function getSimulationVehicleState(
    simulationRunId: number,
    vehicleId: number,
) {
    return getSimulationVehicleStates(
        simulationRunId,
    ).get(vehicleId);
}

export function updateSimulationVehicleState(
    simulationRunId: number,
    vehicle: SimulationVehicleState,
) {
    const states =
        getSimulationVehicleStates(
            simulationRunId,
        );

    states.set(
        vehicle.id,
        vehicle,
    );
}

export function clearSimulationVehicleStates(
    simulationRunId: number,
) {
    vehicleStatesBySimulation.delete(
        simulationRunId,
    );
}