import {
    getSimulationVehicleStates,
} from "@/modules/vehicle/vehicle_state.service";

import {
    detectTrafficQueues,
} from "@/modules/traffic/queue.service";

export type TrafficMetrics = {
    simulationRunId: number;

    totalVehicles: number;
    activeVehicles: number;
    completedVehicles: number;

    waitingVehicles: number;
    signalWaitingVehicles: number;

    averageSpeedKmh: number;

    activeQueues: number;
    maximumQueueVehicles: number;
    averageQueueLengthMeters: number;
};

export function calculateTrafficMetrics(
    simulationRunId: number,
): TrafficMetrics {
    const vehicleStates =
        getSimulationVehicleStates(
            simulationRunId,
        );

    const vehicles =
        Array.from(
            vehicleStates.values(),
        );

    const totalVehicles =
        vehicles.length;

    const completedVehicles =
        vehicles.filter(
            (vehicle) =>
                vehicle.status ===
                "COMPLETED",
        ).length;

    const waitingVehicles =
        vehicles.filter(
            (vehicle) =>
                vehicle.status ===
                    "WAITING" ||
                vehicle.status ===
                    "WAITING_AT_SIGNAL",
        ).length;

    const signalWaitingVehicles =
        vehicles.filter(
            (vehicle) =>
                vehicle.status ===
                "WAITING_AT_SIGNAL",
        ).length;

    const activeVehicles =
        vehicles.filter(
            (vehicle) =>
                vehicle.status !==
                "COMPLETED",
        ).length;

    const movingVehicles =
        vehicles.filter(
            (vehicle) =>
                vehicle.status !==
                    "COMPLETED" &&
                vehicle.speedKmh > 0,
        );

    const averageSpeedKmh =
        movingVehicles.length === 0
            ? 0
            : movingVehicles.reduce(
                  (sum, vehicle) =>
                      sum +
                      vehicle.speedKmh,
                  0,
              ) / movingVehicles.length;

    const queues =
        detectTrafficQueues(
            simulationRunId,
        );

    const activeQueues =
        queues.length;

    const maximumQueueVehicles =
        queues.length === 0
            ? 0
            : Math.max(
                  ...queues.map(
                      (queue) =>
                          queue.vehicleCount,
                  ),
              );

    const queuesWithLength =
        queues.filter(
            (queue) =>
                queue.queueLengthMeters > 0,
        );

    const averageQueueLengthMeters =
        queuesWithLength.length === 0
            ? 0
            : queuesWithLength.reduce(
                  (sum, queue) =>
                      sum +
                      queue.queueLengthMeters,
                  0,
              ) /
              queuesWithLength.length;

    return {
        simulationRunId,

        totalVehicles,
        activeVehicles,
        completedVehicles,

        waitingVehicles,
        signalWaitingVehicles,

        averageSpeedKmh:
            Number(
                averageSpeedKmh.toFixed(2),
            ),

        activeQueues,
        maximumQueueVehicles,

        averageQueueLengthMeters:
            Number(
                averageQueueLengthMeters.toFixed(
                    2,
                ),
            ),
    };
}