import {
    getSimulationVehicleStates,
    type SimulationVehicleState,
} from "@/modules/vehicle/vehicle_state.service";

import {
    getSimulationVehicleCache,
} from "@/modules/vehicle/vehicle_simulation_cache.service";

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

    const simulationCache =
        getSimulationVehicleCache(
            simulationRunId,
        );

    if (!simulationCache) {
        return [];
    }

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
            vehicle.status !==
                "WAITING_AT_SIGNAL"
        ) {
            continue;
        }

        /*
         * A vehicle explicitly waiting at
         * a traffic signal is considered stopped
         * even if its speed value has not yet
         * reached zero.
         *
         * Ordinary WAITING vehicles must have
         * effectively stopped.
         */
        if (
            vehicle.status !==
                "WAITING_AT_SIGNAL" &&
            vehicle.speedKmh >
                QUEUE_STOP_SPEED_KMH
        ) {
            continue;
        }

        const key =
            `${vehicle.currentSegmentId}:` +
            `${vehicle.isReverse}`;

        const vehiclesOnSegment =
            vehiclesBySegment.get(key) ??
            [];

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
         * direction of travel:
         *
         * 0 → beginning of segment
         * 1 → end of segment
         *
         * Therefore the vehicle with the
         * highest progress is physically ahead.
         */
        vehiclesOnSegment.sort(
            (a, b) =>
                a.progress -
                b.progress,
        );

        const [
            segmentIdString,
        ] = key.split(":");

        const segmentId =
            Number(segmentIdString);

        const segment =
            simulationCache.segments.get(
                segmentId,
            );

        if (!segment) {
            continue;
        }

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
             * Convert logical progress
             * difference into physical
             * distance.
             *
             * Example:
             *
             * segment = 100m
             * progress difference = 0.15
             *
             * distance = 15m
             */
            const physicalGap =
                Math.abs(
                    vehicle.progress -
                    previousVehicle.progress,
                ) *
                segment.lengthMeters;

            /*
             * Vehicles are considered part
             * of the same queue when the physical
             * gap between consecutive vehicles
             * is <= 20 meters.
             */
            if (
                physicalGap <=
                QUEUE_MAX_GAP_METERS
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
                    segment.lengthMeters,
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
            segment.lengthMeters,
        );
    }

    return queues;
}

function addQueue(
    queues: TrafficQueue[],
    simulationRunId: number,
    key: string,
    vehicles: SimulationVehicleState[],
    segmentLengthMeters: number,
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

    /*
     * Vehicles are sorted by increasing
     * logical progress.
     *
     * Therefore:
     *
     * highest progress = front
     * lowest progress  = rear
     */
    const frontVehicle =
        vehicles[
            vehicles.length - 1
        ];

    const rearVehicle =
        vehicles[0];

    /*
     * Queue length is the physical distance
     * between the rear-most and front-most
     * vehicles.
     *
     * progress is normalized from 0 → 1,
     * so multiplying the difference by
     * segment length gives meters.
     */
    const queueLengthMeters =
        Math.abs(
            frontVehicle.progress -
            rearVehicle.progress,
        ) *
        segmentLengthMeters;

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
            frontVehicle.id,

        rearVehicleId:
            rearVehicle.id,

        queueLengthMeters:
            Number(
                queueLengthMeters.toFixed(
                    2,
                ),
            ),
    });
}