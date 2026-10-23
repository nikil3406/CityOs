"use client";

import { useEffect, useState } from "react";

import { SimulationConfig } from "@/lib/constants";
import type { SimulationVehicle } from "../types/map.types";

export function useSimulationVehicles(
    simulationId: number | null,
) {
    const [snapshot, setSnapshot] = useState<{
        simulationId: number;
        vehicles: SimulationVehicle[];
    } | null>(null);

    useEffect(() => {
        if (simulationId === null) {
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

                // Keep generated vehicles visible while CREATED or PAUSED too.
                // Their positions stay fixed until the engine is running.
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

                setSnapshot({ simulationId: Number(simulationId), vehicles: activeVehicles });
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

    return snapshot?.simulationId === simulationId ? snapshot.vehicles : [];
}
