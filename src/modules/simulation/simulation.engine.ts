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

import { detectTrafficQueues } from "@/modules/traffic/queue.service";

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
        clearTrafficLightCache(simulation.cityId);

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

                        const queues =
                            detectTrafficQueues(simulationId);

                        if (queues.length > 0) {
                            console.log(
                                `Simulation ${simulationId}: ` +
                                `${queues.length} traffic queue(s) detected`
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

        clearSimulationVehicleStates(
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