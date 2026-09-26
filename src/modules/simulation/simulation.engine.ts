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
    setPreviousSevereState,
    clearCongestionEventState,
} from "@/modules/traffic/congestion_event_state.service";


class SimulationEngine {
    private timers =
        new Map<
            number,
            NodeJS.Timeout
        >();


    async start(
        simulationId: number,
    ) {
        /*
         * Prevent starting the same
         * simulation twice.
         */
        if (
            this.timers.has(
                simulationId,
            )
        ) {
            return;
        }

        const simulation =
            await getSimulationRun(
                simulationId,
            );

        if (!simulation) {
            throw new Error(
                "Simulation run not found",
            );
        }

        if (
            simulation.status !==
            "RUNNING"
        ) {
            throw new Error(
                `Simulation is not RUNNING. Current status: ${simulation.status}`,
            );
        }

        /*
         * --------------------------------------------------
         * Initialize high-frequency simulation state.
         * --------------------------------------------------
         *
         * Vehicle state:
         *     PostgreSQL → RAM
         *
         * Traffic lights:
         *     PostgreSQL → RAM
         *
         * These happen once when the simulation starts.
         */
        await initializeSimulationVehicleStates(
            simulationId,
        );

        /*
         * Always reload traffic-light config from the DB
         * on simulation start so that any DB changes
         * (e.g. phase configuration in tests) are picked up.
         */
        clearTrafficLightCache(
            simulation.cityId,
        );

        await initializeTrafficLights(
            simulation.cityId,
        );

        const timer =
            setInterval(
                async () => {
                    try {
                        const current =
                            await getSimulationRun(
                                simulationId,
                            );

                        if (!current) {
                            this.stop(
                                simulationId,
                            );

                            return;
                        }

                        if (
                            current.status !==
                            "RUNNING"
                        ) {
                            this.stop(
                                simulationId,
                            );

                            return;
                        }

                        /*
                         * Advance simulation clock.
                         */
                        const updated =
                            await advanceSimulationTime(
                                simulationId,
                            );

                        /*
                         * Update traffic-light
                         * runtime state.
                         *
                         * This now uses RAM.
                         */
                        if (updated) {
                            await updateTrafficLights(
                                updated.cityId,
                            );
                        }

                        /*
                         * Move vehicles.
                         *
                         * Vehicle discovery now
                         * comes from RAM.
                         */
                        const movedVehicles =
                            await moveVehicles(
                                simulationId,
                            );

                        /*
                         * Detect traffic queues
                         * after vehicle movement.
                         */
                        const queues =
                            detectTrafficQueues(
                                simulationId,
                            );

                        const hadQueues =
                            getPreviousQueueState(
                                simulationId,
                            );

                        const hasQueues =
                            queues.length > 0;

                        if (
                            !hadQueues &&
                            hasQueues &&
                            updated
                        ) {
                            await recordSimulationEvent({
                                simulationRunId:
                                    simulationId,

                                type:
                                    "TRAFFIC_QUEUE_STARTED",

                                simulationTime:
                                    updated.simulationTime,

                                data: {
                                    queueCount:
                                        queues.length,

                                    maximumQueueVehicles:
                                        Math.max(
                                            ...queues.map(
                                                (queue) =>
                                                    queue.vehicleCount,
                                            ),
                                        ),

                                    averageQueueLengthMeters:
                                        queues.reduce(
                                            (sum, queue) =>
                                                sum +
                                                queue.queueLengthMeters,
                                            0,
                                        ) / queues.length,
                                },
                            });
                        }

                        if (
                            hadQueues &&
                            !hasQueues &&
                            updated
                        ) {
                            await recordSimulationEvent({
                                simulationRunId:
                                    simulationId,

                                type:
                                    "TRAFFIC_QUEUE_CLEARED",

                                simulationTime:
                                    updated.simulationTime,
                            });
                        }

                        setPreviousQueueState(
                            simulationId,
                            hasQueues,
                        );

                        /*
 * --------------------------------------------------
 * Detect severe congestion.
 *
 * Congestion is evaluated per road segment.
 * Only transitions into/out of SEVERE are
 * recorded as simulation events.
 * --------------------------------------------------
 */

                        const congestion =
                            calculateSegmentCongestion(
                                simulationId,
                            );

                        for (const segment of congestion) {
                            const isSevere =
                                segment.congestionLevel ===
                                "SEVERE";

                            const wasSevere =
                                getPreviousSevereState(
                                    simulationId,
                                    segment.segmentId,
                                );

                            /*
                             * --------------------------------------------------
                             * SEVERE CONGESTION STARTED
                             * --------------------------------------------------
                             */

                            if (
                                !wasSevere &&
                                isSevere &&
                                updated
                            ) {
                                await recordSimulationEvent({
                                    simulationRunId:
                                        simulationId,

                                    type:
                                        "CONGESTION_DETECTED",

                                    roadId:
                                        segment.roadId,

                                    simulationTime:
                                        updated.simulationTime,

                                    data: {
                                        segmentId:
                                            segment.segmentId,

                                        roadId:
                                            segment.roadId,

                                        vehicleCount:
                                            segment.vehicleCount,

                                        averageSpeedKmh:
                                            segment.averageSpeedKmh,

                                        speedLimitKmh:
                                            segment.speedLimitKmh,

                                        speedRatio:
                                            segment.speedRatio,

                                        queueVehicleCount:
                                            segment.queueVehicleCount,

                                        queueLengthMeters:
                                            segment.queueLengthMeters,

                                        congestionLevel:
                                            segment.congestionLevel,
                                    },
                                });
                            }

                            /*
                             * --------------------------------------------------
                             * SEVERE CONGESTION CLEARED
                             * --------------------------------------------------
                             */

                            if (
                                wasSevere &&
                                !isSevere &&
                                updated
                            ) {
                                await recordSimulationEvent({
                                    simulationRunId:
                                        simulationId,

                                    type:
                                        "CONGESTION_CLEARED",

                                    roadId:
                                        segment.roadId,

                                    simulationTime:
                                        updated.simulationTime,

                                    data: {
                                        segmentId:
                                            segment.segmentId,

                                        roadId:
                                            segment.roadId,

                                        previousLevel:
                                            "SEVERE",

                                        currentLevel:
                                            segment.congestionLevel,

                                        vehicleCount:
                                            segment.vehicleCount,

                                        averageSpeedKmh:
                                            segment.averageSpeedKmh,

                                        queueVehicleCount:
                                            segment.queueVehicleCount,

                                        queueLengthMeters:
                                            segment.queueLengthMeters,
                                    },
                                });
                            }

                            /*
                             * Remember the current state for
                             * the next simulation tick.
                             */

                            setPreviousSevereState(
                                simulationId,
                                segment.segmentId,
                                isSevere,
                            );
                        }

                        /*
 * Calculate current traffic metrics
 * from runtime simulation state.
 *
 * Metrics are not persisted every tick.
 * They will be exposed through the
 * live simulation state API.
 */

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

                        this.stop(
                            simulationId,
                        );
                    }
                },
                SimulationConfig
                    .tickIntervalMs,
            );

        this.timers.set(
            simulationId,
            timer,
        );

        console.log(
            `Simulation ${simulationId} started ` +
            `(${SimulationConfig.tickIntervalMs}ms real time = ` +
            `${SimulationConfig.simulationSecondsPerTick}s simulation time)`,
        );
    }


    stop(
        simulationId: number,
    ) {
        const timer =
            this.timers.get(
                simulationId,
            );

        if (!timer) {
            clearSimulationVehicleCache(
                simulationId,
            );

            clearSimulationVehicleStates(
                simulationId,
            );

            return;
        }

        clearInterval(
            timer,
        );

        this.timers.delete(
            simulationId,
        );

        /*
         * Clear simulation-local caches.
         */
        clearSimulationVehicleCache(
            simulationId,
        );

        clearQueueEventState(
            simulationId,
        );

        clearSimulationVehicleStates(
            simulationId,
        );

        clearCongestionEventState(
            simulationId,
        );

        /*
         * Traffic-light cache is city-scoped
         * in the current single-simulation
         * architecture.
         *
         * We need the simulation information
         * to know which city to clear.
         */
        void this.clearTrafficLightCache(
            simulationId,
        );

        console.log(
            `Simulation ${simulationId} engine stopped`,
        );
    }


    private async clearTrafficLightCache(
        simulationId: number,
    ) {
        const simulation =
            await getSimulationRun(
                simulationId,
            );

        if (!simulation) {
            return;
        }

        clearTrafficLightCache(
            simulation.cityId,
        );
    }


    isRunning(
        simulationId: number,
    ) {
        return this.timers.has(
            simulationId,
        );
    }
}


export const simulationEngine =
    new SimulationEngine();