import {
    advanceSimulationTime,
    getSimulationRun,
} from "./simulation.service";

import {
    initializeSimulationVehicleStates,
    clearSimulationVehicleStates,
} from "@/modules/vehicle/vehicle_state.service";

import {
    moveVehicles,
} from "@/modules/vehicle/vehicle_movement.service";

import {
    initializeTrafficLights,
    updateTrafficLights,
} from "@/modules/traffic/traffic_light.service";

import {
    clearTrafficLightCache,
} from "@/modules/traffic/traffic_light_cache.service";

import {
    SimulationConfig,
} from "@/lib/constants";

import {
    clearSimulationVehicleCache,
    getSimulationVehicleCache,
} from "../vehicle/vehicle_simulation_cache.service";

import {
    detectTrafficQueues,
} from "@/modules/traffic/queue.service";

import {
    getPreviousQueueState,
    setPreviousQueueState,
    clearQueueEventState,
} from "@/modules/traffic/queue_event_state.service";

import {
    recordSimulationEvent,
} from "./simulation_event.service";

import {
    calculateSegmentCongestion,
} from "@/modules/traffic/congestion.service";

import {
    getPreviousSevereState,
    getPreviousSevereSegmentIds,
    setPreviousSevereState,
    clearCongestionEventState,
} from "@/modules/traffic/congestion_event_state.service";


class SimulationEngine {
    private timers =
        new Map<
            number,
            NodeJS.Timeout
        >();

    // Locks startup while asynchronous state initialization is running.
    private starting = new Set<number>();

    // Prevents asynchronous interval callbacks from overlapping per simulation.
    private activeTicks = new Set<number>();

    // Records stop requests made while startup is still in progress.
    private stopRequested = new Set<number>();

    // Remembers the city so stop/cleanup does not need an asynchronous DB lookup.
    private cityBySimulation = new Map<number, number>();

    // Traffic-light runtime state is cached per city, so only one simulation may
    // own a city's runtime cache in this engine process at a time.
    private simulationByCity = new Map<number, number>();

    // Defers cleanup until an already-running tick finishes.
    private cleanupPending = new Set<number>();


    async start(
        simulationId: number,
    ) {
        // A timer is registered only after asynchronous initialization finishes.
        // The startup lock prevents two callers from initializing concurrently.
        if (
            this.timers.has(simulationId) ||
            this.starting.has(simulationId) ||
            this.activeTicks.has(simulationId) ||
            this.cleanupPending.has(simulationId)
        ) {
            return;
        }

        this.starting.add(simulationId);
        this.stopRequested.delete(simulationId);
        let cityId: number | undefined;
        let ownsCityReservation = false;

        try {
            const simulation =
                await getSimulationRun(simulationId);

            if (!simulation) {
                throw new Error("Simulation run not found");
            }

            if (simulation.status !== "RUNNING") {
                throw new Error(
                    `Simulation is not RUNNING. Current status: ${simulation.status}`,
                );
            }

            cityId = simulation.cityId;

            const existingSimulationId =
                this.simulationByCity.get(cityId);

            if (
                existingSimulationId !== undefined &&
                existingSimulationId !== simulationId
            ) {
                throw new Error(
                    `City ${cityId} already has active simulation ${existingSimulationId}. ` +
                    `Stop that simulation before starting ${simulationId}.`,
                );
            }

            this.simulationByCity.set(cityId, simulationId);
            ownsCityReservation = true;
            this.cityBySimulation.set(simulationId, cityId);

            await initializeSimulationVehicleStates(simulationId);

            // Reload signal configuration when starting a simulation.
            clearTrafficLightCache(simulation.cityId);
            await initializeTrafficLights(simulation.cityId);

            // stop() can be called while either initialization call is awaiting I/O.
            const latestSimulation =
                await getSimulationRun(simulationId);

            if (
                this.stopRequested.has(simulationId) ||
                !latestSimulation ||
                latestSimulation.status !== "RUNNING"
            ) {
                this.clearSimulationRuntimeState(simulationId, cityId);
                this.cityBySimulation.delete(simulationId);
                this.releaseCityReservation(simulationId, cityId);
                this.cleanupPending.delete(simulationId);
                return;
            }

            const timer = setInterval(async () => {
                // setInterval does not await an async callback. Skip a tick if the
                // previous tick for this simulation is still running.
                if (this.activeTicks.has(simulationId)) {
                    return;
                }

                this.activeTicks.add(simulationId);

                try {
                    const current =
                        await getSimulationRun(simulationId);

                    if (!current || current.status !== "RUNNING") {
                        this.stop(simulationId);
                        return;
                    }

                    const updated =
                        await advanceSimulationTime(simulationId);

                    if (updated) {
                        await updateTrafficLights(updated.cityId);
                    }

                    const movedVehicles = await moveVehicles(simulationId);
                    const queues = detectTrafficQueues(simulationId);
                    const hadQueues = getPreviousQueueState(simulationId);
                    const hasQueues = queues.length > 0;

                    if (!hadQueues && hasQueues && updated) {
                        await recordSimulationEvent({
                            simulationRunId: simulationId,
                            type: "TRAFFIC_QUEUE_STARTED",
                            simulationTime: updated.simulationTime,
                            data: {
                                queueCount: queues.length,
                                maximumQueueVehicles: Math.max(
                                    ...queues.map((queue) => queue.vehicleCount),
                                ),
                                averageQueueLengthMeters:
                                    queues.reduce(
                                        (sum, queue) => sum + queue.queueLengthMeters,
                                        0,
                                    ) / queues.length,
                            },
                        });
                    }

                    if (hadQueues && !hasQueues && updated) {
                        await recordSimulationEvent({
                            simulationRunId: simulationId,
                            type: "TRAFFIC_QUEUE_CLEARED",
                            simulationTime: updated.simulationTime,
                        });
                    }

                    setPreviousQueueState(simulationId, hasQueues);

                    // Snapshot prior severe segments before updating their states.
                    // A segment with no active vehicles is omitted by
                    // calculateSegmentCongestion(), so it must be handled below.
                    const previouslySevereSegmentIds =
                        getPreviousSevereSegmentIds(simulationId);

                    const congestion = calculateSegmentCongestion(simulationId);
                    const currentSegmentIds = new Set(
                        congestion.map((segment) => segment.segmentId),
                    );

                    for (const segment of congestion) {
                        const isSevere = segment.congestionLevel === "SEVERE";
                        const wasSevere = getPreviousSevereState(
                            simulationId,
                            segment.segmentId,
                        );

                        if (!wasSevere && isSevere && updated) {
                            await recordSimulationEvent({
                                simulationRunId: simulationId,
                                type: "CONGESTION_DETECTED",
                                roadId: segment.roadId,
                                simulationTime: updated.simulationTime,
                                data: {
                                    segmentId: segment.segmentId,
                                    roadId: segment.roadId,
                                    vehicleCount: segment.vehicleCount,
                                    averageSpeedKmh: segment.averageSpeedKmh,
                                    speedLimitKmh: segment.speedLimitKmh,
                                    speedRatio: segment.speedRatio,
                                    queueVehicleCount: segment.queueVehicleCount,
                                    queueLengthMeters: segment.queueLengthMeters,
                                    congestionLevel: segment.congestionLevel,
                                },
                            });
                        }

                        if (wasSevere && !isSevere && updated) {
                            await recordSimulationEvent({
                                simulationRunId: simulationId,
                                type: "CONGESTION_CLEARED",
                                roadId: segment.roadId,
                                simulationTime: updated.simulationTime,
                                data: {
                                    segmentId: segment.segmentId,
                                    roadId: segment.roadId,
                                    previousLevel: "SEVERE",
                                    currentLevel: segment.congestionLevel,
                                    vehicleCount: segment.vehicleCount,
                                    averageSpeedKmh: segment.averageSpeedKmh,
                                    queueVehicleCount: segment.queueVehicleCount,
                                    queueLengthMeters: segment.queueLengthMeters,
                                },
                            });
                        }

                        setPreviousSevereState(
                            simulationId,
                            segment.segmentId,
                            isSevere,
                        );
                    }

                    // A previously severe segment that is absent from the current
                    // results has no active vehicles (or no current congestion row).
                    // Record the transition explicitly instead of leaving it severe
                    // forever in the event-state cache.
                    const vehicleCache =
                        getSimulationVehicleCache(simulationId);

                    for (const segmentId of previouslySevereSegmentIds) {
                        if (currentSegmentIds.has(segmentId)) {
                            continue;
                        }

                        const cachedSegment =
                            vehicleCache?.segments.get(segmentId);

                        if (updated) {
                            await recordSimulationEvent({
                                simulationRunId: simulationId,
                                type: "CONGESTION_CLEARED",
                                roadId: cachedSegment?.roadId,
                                simulationTime: updated.simulationTime,
                                data: {
                                    segmentId,
                                    roadId: cachedSegment?.roadId ?? null,
                                    previousLevel: "SEVERE",
                                    currentLevel: "FREE",
                                    vehicleCount: 0,
                                    averageSpeedKmh: 0,
                                    queueVehicleCount: 0,
                                    queueLengthMeters: 0,
                                    reason: "NO_ACTIVE_VEHICLES_ON_SEGMENT",
                                },
                            });
                        }

                        setPreviousSevereState(
                            simulationId,
                            segmentId,
                            false,
                        );
                    }

                    console.log(
                        `Simulation ${simulationId}: ` +
                        `${updated?.simulationTime}s | ` +
                        `Moved vehicles: ${movedVehicles}`,
                    );
                } catch (error) {
                    console.error(
                        `Simulation ${simulationId} tick failed:`,
                        error,
                    );
                    this.stop(simulationId);
                } finally {
                    this.activeTicks.delete(simulationId);

                    // stop() defers cleanup while a tick is active so the tick
                    // cannot continue using caches that were cleared mid-update.
                    if (this.cleanupPending.delete(simulationId)) {
                        const activeCityId =
                            this.cityBySimulation.get(simulationId);

                        this.clearSimulationRuntimeState(
                            simulationId,
                            activeCityId,
                        );
                        this.cityBySimulation.delete(simulationId);
                        this.releaseCityReservation(
                            simulationId,
                            activeCityId,
                        );
                    }
                }
            }, SimulationConfig.tickIntervalMs);

            this.timers.set(simulationId, timer);

            console.log(
                `Simulation ${simulationId} started ` +
                `(${SimulationConfig.tickIntervalMs}ms real time = ` +
                `${SimulationConfig.simulationSecondsPerTick}s simulation time)`,
            );
        } catch (error) {
            // Only clean up city-level state if this simulation acquired the
            // reservation. A rejected second simulation must not clear the
            // active simulation's traffic-light cache.
            if (ownsCityReservation) {
                this.clearSimulationRuntimeState(simulationId, cityId);
                this.cityBySimulation.delete(simulationId);
                this.releaseCityReservation(simulationId, cityId);
            }
            this.cleanupPending.delete(simulationId);
            throw error;
        } finally {
            this.starting.delete(simulationId);
            this.stopRequested.delete(simulationId);
        }
    }

    stop(
        simulationId: number,
    ) {
        if (this.starting.has(simulationId)) {
            this.stopRequested.add(simulationId);
        }

        const timer = this.timers.get(simulationId);

        if (timer) {
            clearInterval(timer);
            this.timers.delete(simulationId);
        }

        // Do not clear state while a tick is actively reading/updating it.
        // The tick's finally block performs cleanup as soon as it exits.
        if (this.activeTicks.has(simulationId)) {
            this.cleanupPending.add(simulationId);
            console.log(
                `Simulation ${simulationId} stopping after current tick`,
            );
            return;
        }

        const cityId = this.cityBySimulation.get(simulationId);
        this.clearSimulationRuntimeState(simulationId, cityId);
        this.cityBySimulation.delete(simulationId);
        this.releaseCityReservation(simulationId, cityId);
        this.cleanupPending.delete(simulationId);

        if (timer) {
            console.log(`Simulation ${simulationId} engine stopped`);
        }
    }

    private releaseCityReservation(
        simulationId: number,
        cityId?: number,
    ) {
        if (cityId === undefined) {
            return;
        }

        if (this.simulationByCity.get(cityId) === simulationId) {
            this.simulationByCity.delete(cityId);
        }
    }

    private clearSimulationRuntimeState(
        simulationId: number,
        cityId?: number,
    ) {
        clearSimulationVehicleCache(simulationId);
        clearQueueEventState(simulationId);
        clearSimulationVehicleStates(simulationId);
        clearCongestionEventState(simulationId);

        if (cityId !== undefined) {
            clearTrafficLightCache(cityId);
        }
    }

    isRunning(
        simulationId: number,
    ) {
        return this.timers.has(
            simulationId,
        );
    }

    async waitForIdle(
        simulationId: number,
    ) {
        while (
            this.starting.has(simulationId) ||
            this.activeTicks.has(simulationId)
        ) {
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 10);
            });
        }
    }
}


export const simulationEngine =
    new SimulationEngine();
