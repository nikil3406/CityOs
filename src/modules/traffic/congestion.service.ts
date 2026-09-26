import {
    getSimulationVehicleStates,
    type SimulationVehicleState,
} from "@/modules/vehicle/vehicle_state.service";

import {
    getSimulationVehicleCache,
} from "@/modules/vehicle/vehicle_simulation_cache.service";

import {
    detectTrafficQueues,
    type TrafficQueue,
} from "@/modules/traffic/queue.service";

export type CongestionLevel =
    | "FREE"
    | "MODERATE"
    | "CONGESTED"
    | "SEVERE";

export type RoadSegmentCongestion = {
    segmentId: number;
    roadId: number;

    vehicleCount: number;

    averageSpeedKmh: number;

    speedLimitKmh: number | null;
    speedRatio: number | null;

    queueVehicleCount: number;
    queueLengthMeters: number;

    congestionLevel: CongestionLevel;
};

export function calculateSegmentCongestion(
    simulationRunId: number,
): RoadSegmentCongestion[] {
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

    /*
     * ------------------------------------------------
     * GROUP ACTIVE VEHICLES BY SEGMENT
     * ------------------------------------------------
     */

    const vehiclesBySegment =
        new Map<
            number,
            SimulationVehicleState[]
        >();

    for (const vehicle of vehicleStates.values()) {
        if (
            vehicle.currentSegmentId === null
        ) {
            continue;
        }

        const segmentId =
            vehicle.currentSegmentId;

        const vehicles =
            vehiclesBySegment.get(segmentId) ??
            [];

        vehicles.push(vehicle);

        vehiclesBySegment.set(
            segmentId,
            vehicles,
        );
    }

    /*
     * ------------------------------------------------
     * DETECT EXISTING QUEUES
     * ------------------------------------------------
     */

    const queues =
        detectTrafficQueues(
            simulationRunId,
        );

    const queuesBySegment =
        new Map<
            number,
            TrafficQueue[]
        >();

    for (const queue of queues) {
        const existing =
            queuesBySegment.get(
                queue.segmentId,
            ) ?? [];

        existing.push(queue);

        queuesBySegment.set(
            queue.segmentId,
            existing,
        );
    }

    /*
     * ------------------------------------------------
     * CALCULATE CONGESTION
     * ------------------------------------------------
     */

    const congestion: RoadSegmentCongestion[] = [];

    for (
        const [
            segmentId,
            vehicles,
        ] of vehiclesBySegment
    ) {
        const segment =
            simulationCache.segments.get(
                segmentId,
            );

        if (!segment) {
            continue;
        }

        const vehicleCount =
            vehicles.length;

        const totalSpeed =
            vehicles.reduce(
                (
                    sum,
                    vehicle,
                ) =>
                    sum +
                    vehicle.speedKmh,
                0,
            );

        const averageSpeedKmh =
            vehicleCount > 0
                ? totalSpeed /
                  vehicleCount
                : 0;

        const speedLimitKmh =
            segment.speedLimitKmh;

        const speedRatio =
            speedLimitKmh !== null &&
            speedLimitKmh > 0
                ? averageSpeedKmh /
                  speedLimitKmh
                : null;

        const segmentQueues =
            queuesBySegment.get(
                segmentId,
            ) ?? [];

        const queueVehicleCount =
            segmentQueues.reduce(
                (
                    total,
                    queue,
                ) =>
                    total +
                    queue.vehicleCount,
                0,
            );

        const queueLengthMeters =
            segmentQueues.reduce(
                (
                    total,
                    queue,
                ) =>
                    total +
                    queue.queueLengthMeters,
                0,
            );

        const congestionLevel =
            determineCongestionLevel(
                speedRatio,
                queueVehicleCount,
            );

        congestion.push({
            segmentId,

            roadId:
                segment.roadId,

            vehicleCount,

            averageSpeedKmh:
                Number(
                    averageSpeedKmh.toFixed(
                        2,
                    ),
                ),

            speedLimitKmh,

            speedRatio:
                speedRatio === null
                    ? null
                    : Number(
                        speedRatio.toFixed(
                            2,
                        ),
                    ),

            queueVehicleCount,

            queueLengthMeters:
                Number(
                    queueLengthMeters.toFixed(
                        2,
                    ),
                ),

            congestionLevel,
        });
    }

    return congestion;
}

/*
 * ------------------------------------------------
 * CONGESTION CLASSIFICATION
 * ------------------------------------------------
 */

function determineCongestionLevel(
    speedRatio: number | null,
    queueVehicleCount: number,
): CongestionLevel {
    /*
     * A queue is already a strong indication
     * of traffic congestion.
     */
    if (queueVehicleCount >= 5) {
        return "SEVERE";
    }

    if (queueVehicleCount >= 2) {
        return "CONGESTED";
    }

    /*
     * If there is no speed limit available,
     * speed-based classification cannot be
     * performed.
     */
    if (speedRatio === null) {
        return "FREE";
    }

    if (speedRatio >= 0.7) {
        return "FREE";
    }

    if (speedRatio >= 0.4) {
        return "MODERATE";
    }

    if (speedRatio >= 0.2) {
        return "CONGESTED";
    }

    return "SEVERE";
}