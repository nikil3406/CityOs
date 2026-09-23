import {
    advanceSimulationTime,
    getSimulationRun,
} from "./simulation.service";

import { moveVehicles } from "../vehicle/vehicle_movement.service";
import {
    updateTrafficLights,
} from "../traffic/traffic_light.service";
import { SimulationConfig } from "@/lib/constants";

import {
    clearSimulationVehicleCache,
} from "../vehicle/vehicle_simulation_cache.service";

class SimulationEngine {
    private timers = new Map<number, NodeJS.Timeout>();

    async start(simulationId: number) {
        if (this.timers.has(simulationId)) {
            return;
        }

        const simulation = await getSimulationRun(
            simulationId,
        );

        if (!simulation) {
            throw new Error("Simulation run not found");
        }

        if (simulation.status !== "RUNNING") {
            throw new Error(
                `Simulation is not RUNNING. Current status: ${simulation.status}`,
            );
        }

        const timer = setInterval(async () => {
            try {
                const current =
                    await getSimulationRun(simulationId);

                if (!current) {
                    this.stop(simulationId);
                    return;
                }

                if (current.status !== "RUNNING") {
                    this.stop(simulationId);
                    return;
                }

                const updated =
                    await advanceSimulationTime(
                        simulationId,
                    );

                if (updated) {
                    await updateTrafficLights(
                        updated.cityId,
                    );
                }

                const movedVehicles =
                    await moveVehicles(simulationId);

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
            }
        }, SimulationConfig.tickIntervalMs);

        this.timers.set(simulationId, timer);

        console.log(
            `Simulation ${simulationId} started ` +
            `(${SimulationConfig.tickIntervalMs}ms real time = ` +
            `${SimulationConfig.simulationSecondsPerTick}s simulation time)`,
        );
    }

    stop(simulationId: number) {
        const timer =
            this.timers.get(simulationId);

        if (!timer) {
            clearSimulationVehicleCache(
                simulationId,
            );

            return;
        }

        clearInterval(timer);

        this.timers.delete(
            simulationId,
        );

        clearSimulationVehicleCache(
            simulationId,
        );

        console.log(
            `Simulation ${simulationId} engine stopped`,
        );
    }

    isRunning(simulationId: number) {
        return this.timers.has(simulationId);
    }
}

export const simulationEngine =
    new SimulationEngine();