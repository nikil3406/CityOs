import {
    getSimulationVehicleStates,
    type SimulationVehicleState,
} from "@/modules/vehicle/vehicle_state.service";

export type TrafficQueue = {
    simulationRunId: number;
    segmentId: number;
    isReverse: boolean;
    vehicleIds: number[];
    vehicleCount: number;
    frontVehicleId: number;
    rearVehicleId: number;
    queueLengthMeters: number;
};

const QUEUE_STOP_SPEED_KMH = 1;
const QUEUE_MAX_GAP_METERS = 20;
const MIN_QUEUE_VEHICLES = 2;

export function detectTrafficQueues(
    simulationRunId: number,
): TrafficQueue[] {
    const vehicleStates =
        getSimulationVehicleStates(
            simulationRunId,
        );

    const vehiclesBySegment =
        new Map<
            string,
            SimulationVehicleState[]
        >();

    /*
     * Only stopped vehicles participate
     * in queue detection.
     */
    for (const vehicle of vehicleStates.values()) {
        if (
            vehicle.currentSegmentId === null
        ) {
            continue;
        }

        if (
            vehicle.status !== "WAITING" &&
            vehicle.status !== "WAITING_AT_SIGNAL"
        ) {
            continue;
        }

        if (
            vehicle.status !== "WAITING_AT_SIGNAL" &&
            vehicle.speedKmh >
            QUEUE_STOP_SPEED_KMH
        ) {
            continue;
        }

        const key =
            `${vehicle.currentSegmentId}:` +
            `${vehicle.isReverse}`;

        const vehiclesOnSegment =
            vehiclesBySegment.get(key) ?? [];

        vehiclesOnSegment.push(
            vehicle,
        );

        vehiclesBySegment.set(
            key,
            vehiclesOnSegment,
        );
    }

    const queues: TrafficQueue[] = [];

    for (
        const [
            key,
            vehiclesOnSegment,
        ] of vehiclesBySegment
    ) {
        if (
            vehiclesOnSegment.length <
            MIN_QUEUE_VEHICLES
        ) {
            continue;
        }

        /*
         * Logical progress increases in the
         * direction of travel.
         */
        vehiclesOnSegment.sort(
            (a, b) =>
                a.progress -
                b.progress,
        );

        let currentQueue:
            SimulationVehicleState[] = [];

        for (
            let i = 0;
            i < vehiclesOnSegment.length;
            i++
        ) {
            const vehicle =
                vehiclesOnSegment[i];

            if (
                currentQueue.length === 0
            ) {
                currentQueue = [
                    vehicle,
                ];
                continue;
            }

            const previousVehicle =
                currentQueue[
                    currentQueue.length - 1
                ];

            /*
             * We don't yet have segment length
             * in vehicle state, so use progress
             * difference as the grouping criterion.
             *
             * This will be converted to physical
             * distance when segment metadata is
             * incorporated into queue metrics.
             */
            const progressGap =
                Math.abs(
                    vehicle.progress -
                    previousVehicle.progress,
                );

            /*
             * 20m is intentionally represented
             * approximately here until segment
             * length is supplied.
             */
            if (
                progressGap <= 0.1
            ) {
                currentQueue.push(
                    vehicle,
                );
            } else {
                addQueue(
                    queues,
                    simulationRunId,
                    key,
                    currentQueue,
                );

                currentQueue = [
                    vehicle,
                ];
            }
        }

        addQueue(
            queues,
            simulationRunId,
            key,
            currentQueue,
        );
    }

    return queues;
}

function addQueue(
    queues: TrafficQueue[],
    simulationRunId: number,
    key: string,
    vehicles: SimulationVehicleState[],
) {
    if (
        vehicles.length <
        MIN_QUEUE_VEHICLES
    ) {
        return;
    }

    const [
        segmentIdString,
        reverseString,
    ] = key.split(":");

    queues.push({
        simulationRunId,

        segmentId:
            Number(segmentIdString),

        isReverse:
            reverseString === "true",

        vehicleIds:
            vehicles.map(
                (vehicle) =>
                    vehicle.id,
            ),

        vehicleCount:
            vehicles.length,

        frontVehicleId:
            vehicles[
                vehicles.length - 1
            ].id,

        rearVehicleId:
            vehicles[0].id,

        queueLengthMeters: 0,
    });
}