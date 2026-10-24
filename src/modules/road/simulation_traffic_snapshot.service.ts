import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import {
    simulationRuns,
    trafficLightMovements,
    trafficLightPhases,
    trafficLights,
    vehicleRoutes,
    vehicles,
} from "@/db/schema";
import { sql } from "drizzle-orm";
import { SimulationConfig } from "@/lib/constants";

export type SnapshotVehicle = {
    segmentId: number | null;
    isReverse: boolean;
    speedKmh: number;
    progress: number;
    status: string;
};

export type SnapshotSignal = {
    id: number;
    intersectionId: number;
    currentPhase: number;
    phaseElapsed: number;
    status: string;
    phases: { phaseNumber: number; durationSeconds: number }[];
    movements: { phaseNumber: number; fromRoadId: number; toRoadId: number; state: string }[];
};

export type SimulationTrafficSnapshot = {
    simulationRunId: number;
    cityId: number;
    status: string;
    simulationTime: number;
    vehicles: SnapshotVehicle[];
    signals: SnapshotSignal[];
};

export function simulationStatusUsesLiveTraffic(status: string): boolean {
    return status === "RUNNING" || status === "PAUSED";
}

export function signalSnapshotBelongsToRun(
    simulationStatus: string,
    simulationUpdatedAt: Date,
    signalUpdatedAt: Date,
): boolean {
    return simulationStatus !== "PAUSED" || signalUpdatedAt.getTime() <= simulationUpdatedAt.getTime();
}

/** Read a run's traffic data under one repeatable-read database snapshot. */
export async function loadSimulationTrafficSnapshot(
    simulationRunId: number,
    expectedCityId: number,
): Promise<SimulationTrafficSnapshot | null> {
    return db.transaction(async (tx) => {
        await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`);

        const [run] = await tx
            .select({
                id: simulationRuns.id,
                cityId: simulationRuns.cityId,
                status: simulationRuns.status,
                simulationTime: simulationRuns.simulationTime,
                updatedAt: simulationRuns.updatedAt,
                startedAt: simulationRuns.startedAt,
            })
            .from(simulationRuns)
            .where(eq(simulationRuns.id, simulationRunId))
            .limit(1);

        if (!run) return null;
        if (run.cityId !== expectedCityId) {
            throw new Error(`Simulation ${simulationRunId} belongs to city ${run.cityId}, not city ${expectedCityId}.`);
        }

        if (!simulationStatusUsesLiveTraffic(run.status)) {
            return {
                simulationRunId: run.id,
                cityId: run.cityId,
                status: run.status,
                simulationTime: run.simulationTime,
                vehicles: [],
                signals: [],
            };
        }

        const vehicleRows = await tx
            .select({
                segmentId: vehicles.currentSegmentId,
                isReverse: vehicleRoutes.isReverse,
                speedKmh: vehicles.speedKmh,
                progress: vehicles.progress,
                status: vehicles.status,
            })
            .from(vehicles)
            .leftJoin(
                vehicleRoutes,
                and(
                    eq(vehicleRoutes.vehicleId, vehicles.id),
                    eq(vehicleRoutes.sequence, vehicles.routeSequence),
                ),
            )
            .where(and(
                eq(vehicles.simulationRunId, simulationRunId),
                ne(vehicles.status, "COMPLETED"),
            ));

        const lightRows = await tx
            .select({
                id: trafficLights.id,
                intersectionId: trafficLights.intersectionId,
                currentPhase: trafficLights.currentPhase,
                phaseElapsed: trafficLights.phaseElapsed,
                updatedAt: trafficLights.updatedAt,
                status: trafficLights.status,
            })
            .from(trafficLights)
            .where(eq(trafficLights.cityId, expectedCityId));

        const phaseRows = await tx
            .select({
                trafficLightId: trafficLightPhases.trafficLightId,
                phaseNumber: trafficLightPhases.phaseNumber,
                durationSeconds: trafficLightPhases.durationSeconds,
            })
            .from(trafficLightPhases)
            .innerJoin(trafficLights, eq(trafficLights.id, trafficLightPhases.trafficLightId))
            .where(eq(trafficLights.cityId, expectedCityId));

        const movementRows = await tx
            .select({
                trafficLightId: trafficLightMovements.trafficLightId,
                phaseNumber: trafficLightMovements.phaseNumber,
                fromRoadId: trafficLightMovements.fromRoadId,
                toRoadId: trafficLightMovements.toRoadId,
                state: trafficLightMovements.state,
            })
            .from(trafficLightMovements)
            .innerJoin(trafficLights, eq(trafficLights.id, trafficLightMovements.trafficLightId))
            .where(eq(trafficLights.cityId, expectedCityId));

        const signals = lightRows
            .filter((light) => signalSnapshotBelongsToRun(run.status, run.updatedAt, light.updatedAt))
            .map((light) => ({
            id: light.id,
            intersectionId: light.intersectionId,
            currentPhase: light.currentPhase,
            phaseElapsed: (() => {
                const currentPhaseDuration = phaseRows.find(
                    (phase) => phase.trafficLightId === light.id && phase.phaseNumber === light.currentPhase,
                )?.durationSeconds ?? 0;
                const runStartedAt = run.startedAt ?? run.updatedAt;
                const elapsedSincePersisted = Math.max(
                    0,
                    run.updatedAt.getTime() - Math.max(light.updatedAt.getTime(), runStartedAt.getTime()),
                ) * SimulationConfig.simulationSecondsPerTick / SimulationConfig.tickIntervalMs;
                return Math.min(currentPhaseDuration, light.phaseElapsed + elapsedSincePersisted);
            })(),
            status: light.status,
            phases: phaseRows
                .filter((phase) => phase.trafficLightId === light.id)
                .map(({ phaseNumber, durationSeconds }) => ({ phaseNumber, durationSeconds }))
                .sort((a, b) => a.phaseNumber - b.phaseNumber),
            movements: movementRows
                .filter((movement) => movement.trafficLightId === light.id)
                .map(({ phaseNumber, fromRoadId, toRoadId, state }) => ({
                    phaseNumber,
                    fromRoadId,
                    toRoadId,
                    state,
                })),
            }));

        return {
            simulationRunId: run.id,
            cityId: run.cityId,
            status: run.status,
            simulationTime: run.simulationTime,
            vehicles: vehicleRows.map((vehicle) => ({
                segmentId: vehicle.segmentId === null ? null : Number(vehicle.segmentId),
                isReverse: vehicle.isReverse === true,
                speedKmh: Number(vehicle.speedKmh),
                progress: Number(vehicle.progress),
                status: vehicle.status,
            })),
            signals,
        };
    });
}

export type SegmentTrafficStats = {
    vehicleCount: number;
    averageSpeedKmh: number;
    queueVehicleCount: number;
    queueLengthMeters: number;
    signalWaitingVehicleCount: number;
};

/** Build all direction-specific segment statistics in one pass over the snapshot. */
export function buildSegmentTrafficStats(
    snapshot: SimulationTrafficSnapshot,
    segments: { id: number; lengthMeters: number }[],
): Map<string, SegmentTrafficStats> {
    const grouped = new Map<string, SnapshotVehicle[]>();
    for (const vehicle of snapshot.vehicles) {
        if (vehicle.segmentId === null) continue;
        const key = `${vehicle.segmentId}:${vehicle.isReverse}`;
        const list = grouped.get(key) ?? [];
        list.push(vehicle);
        grouped.set(key, list);
    }

    const lengths = new Map(segments.map((segment) => [segment.id, Number(segment.lengthMeters)]));
    const statsByDirection = new Map<string, SegmentTrafficStats>();
    for (const [key, vehiclesOnSegment] of grouped) {
        const segmentId = Number(key.slice(0, key.lastIndexOf(":")));
        const segmentLengthMeters = lengths.get(segmentId);
        if (segmentLengthMeters === undefined) continue;
        const averageSpeedKmh = vehiclesOnSegment.reduce(
            (sum, vehicle) => sum + Math.max(0, vehicle.speedKmh),
            0,
        ) / vehiclesOnSegment.length;
        const stopped = vehiclesOnSegment
            .filter((vehicle) =>
                vehicle.status === "WAITING_AT_SIGNAL" ||
                vehicle.status === "WAITING_BEHIND_VEHICLE" ||
                (vehicle.status === "WAITING" && vehicle.speedKmh <= 1),
            )
            .sort((a, b) => a.progress - b.progress);

        let queueVehicleCount = 0;
        let queueLengthMeters = 0;
        let currentQueue: typeof stopped = [];
        const flushQueue = () => {
            if (currentQueue.length >= 2) {
                queueVehicleCount += currentQueue.length;
                queueLengthMeters += Math.abs(
                    currentQueue[currentQueue.length - 1].progress - currentQueue[0].progress,
                ) * segmentLengthMeters;
            }
            currentQueue = [];
        };

        for (const vehicle of stopped) {
            const previous = currentQueue[currentQueue.length - 1];
            if (
                previous &&
                Math.abs(vehicle.progress - previous.progress) * segmentLengthMeters > 20
            ) {
                flushQueue();
            }
            currentQueue.push(vehicle);
        }
        flushQueue();

        statsByDirection.set(key, {
            vehicleCount: vehiclesOnSegment.length,
            averageSpeedKmh,
            queueVehicleCount,
            queueLengthMeters,
            signalWaitingVehicleCount: vehiclesOnSegment.filter(
                (vehicle) => vehicle.status === "WAITING_AT_SIGNAL",
            ).length,
        });
    }

    return statsByDirection;
}
