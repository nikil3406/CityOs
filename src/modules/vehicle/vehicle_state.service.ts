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
    new Map<number, Map<number, SimulationVehicleState>>();

export function setSimulationVehicleStates(
    simulationRunId: number,
    vehicles: SimulationVehicleState[],
) {
    const states = new Map<number, SimulationVehicleState>();

    for (const vehicle of vehicles) {
        states.set(vehicle.id, vehicle);
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
        ) ?? new Map()
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

    states.set(vehicle.id, vehicle);
}

export function clearSimulationVehicleStates(
    simulationRunId: number,
) {
    vehicleStatesBySimulation.delete(
        simulationRunId,
    );

    console.log(
        `Simulation ${simulationRunId}: vehicle state cache cleared`,
    );
}