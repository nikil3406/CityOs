import {
    getSimulationVehicleStates,
    type SimulationVehicleState,
} from "@/modules/vehicle/vehicle_state.service";

import { SimulationConfig } from "@/lib/constants";

export type VehicleAheadResult = {
    vehicleId: number;
    distanceMeters: number;
    speedKmh: number;
    shouldStop: boolean;
    shouldSlowDown: boolean;
} | null;

export function checkVehicleAhead(
    vehicleId: number,
    simulationRunId: number,
    currentSegmentId: number,
    segmentLengthMeters: number,
    currentProgress: number,
    speedKmh: number,
    currentIsReverse: boolean,
): VehicleAheadResult {

    const vehicleStates =
        getSimulationVehicleStates(
            simulationRunId,
        );

    let vehicleAhead:
        SimulationVehicleState | null = null;

    let smallestProgressDifference =
        Number.POSITIVE_INFINITY;

    for (const vehicle of vehicleStates.values()) {

        if (vehicle.id === vehicleId) {
            continue;
        }

        if (
            vehicle.currentSegmentId !==
            currentSegmentId
        ) {
            continue;
        }

        if (
            vehicle.isReverse !==
            currentIsReverse
        ) {
            continue;
        }

        if (
            vehicle.status !== "WAITING" &&
            vehicle.status !== "WAITING_AT_SIGNAL"
        ) {
            continue;
        }

        /*
         * Vehicles at exactly the same progress are
         * ordered by vehicle ID to avoid both vehicles
         * considering each other as the vehicle ahead.
         */
        const isAhead =
            vehicle.progress > currentProgress ||
            (
                vehicle.progress === currentProgress &&
                vehicle.id > vehicleId
            );

        if (!isAhead) {
            continue;
        }

        const progressDifference =
            vehicle.progress -
            currentProgress;

        if (
            progressDifference <
            smallestProgressDifference
        ) {
            smallestProgressDifference =
                progressDifference;

            vehicleAhead = vehicle;
        }
    }

    if (!vehicleAhead) {
        return null;
    }

    const distanceMeters = Math.max(
        0,
        (
            vehicleAhead.progress -
            currentProgress
        ) * segmentLengthMeters,
    );

    const safeDistanceMeters =
        SimulationConfig
            .vehicleFollowing
            .safeDistanceMeters;

    const detectionDistanceMeters =
        SimulationConfig
            .vehicleFollowing
            .detectionDistanceMeters;

    const shouldStop =
        distanceMeters <=
        safeDistanceMeters;

    const shouldSlowDown =
        distanceMeters <=
            detectionDistanceMeters &&
        !shouldStop;

    return {
        vehicleId: vehicleAhead.id,
        distanceMeters,
        speedKmh: vehicleAhead.speedKmh,
        shouldStop,
        shouldSlowDown,
    };
}