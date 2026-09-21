"use client";

import { useEffect, useState } from "react";

import { SimulationConfig } from "@/lib/constants";
import type { SimulationVehicle } from "../types/map.types";

export function useSimulationVehicles(
    simulationId: number | null,
) {
    const [vehicles, setVehicles] = useState<
        SimulationVehicle[]
    >([]);

    useEffect(() => {
        if (simulationId === null) {
            setVehicles([]);
            return;
        }

        let cancelled = false;
        let interval: ReturnType<
            typeof setInterval
        > | null = null;

        async function fetchVehicles() {
            try {
                /*
                 * First check the simulation status.
                 */
                const simulationResponse =
                    await fetch(
                        `/api/simulation/runs/${simulationId}`,
                        {
                            cache: "no-store",
                        },
                    );

                if (!simulationResponse.ok) {
                    throw new Error(
                        `Failed to fetch simulation: ${simulationResponse.status}`,
                    );
                }

                const simulation =
                    await simulationResponse.json();

                console.log(
                    `Simulation ${simulationId} status:`,
                    simulation.status,
                );

                /*
                 * Simulation has stopped.
                 */
                if (
                    simulation.status !==
                    "RUNNING"
                ) {
                    if (!cancelled) {
                        setVehicles([]);
                    }

                    if (interval !== null) {
                        clearInterval(interval);
                        interval = null;
                    }

                    return;
                }

                /*
                 * Simulation is running.
                 * Fetch vehicle positions.
                 */
                const response =
                    await fetch(
                        `/api/simulation/runs/${simulationId}/vehicles`,
                        {
                            cache: "no-store",
                        },
                    );

                if (!response.ok) {
                    throw new Error(
                        `Failed to fetch simulation vehicles: ${response.status}`,
                    );
                }

                const data =
                    await response.json();

                const vehicleData =
                    Array.isArray(data)
                        ? data
                        : data.vehicles ?? [];

                if (cancelled) {
                    return;
                }

                const activeVehicles =
                    vehicleData.filter(
                        (
                            vehicle: SimulationVehicle,
                        ) =>
                            vehicle.status !==
                            "COMPLETED",
                    );

                setVehicles(
                    activeVehicles,
                );
            } catch (error) {
                if (cancelled) {
                    return;
                }

                console.error(
                    "Failed to fetch simulation vehicles:",
                    error,
                );
            }
        }

        /*
         * Initial request.
         */
        fetchVehicles();

        /*
         * Poll while simulation is active.
         */
        interval = setInterval(
            fetchVehicles,
            SimulationConfig.tickIntervalMs,
        );

        return () => {
            cancelled = true;

            if (interval !== null) {
                clearInterval(interval);
            }
        };
    }, [simulationId]);

    return vehicles;
}