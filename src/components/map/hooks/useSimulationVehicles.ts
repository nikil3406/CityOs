"use client";

import { useEffect, useState } from "react";

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
        let interval: NodeJS.Timeout | null = null;

        const stopPolling = () => {
            if (interval) {
                clearInterval(interval);
                interval = null;

                console.log(
                    `Simulation ${simulationId}: vehicle polling stopped.`,
                );
            }
        };

        async function fetchVehicles() {
            try {
                const response = await fetch(
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

                const data = await response.json();

                const vehicleData =
                    Array.isArray(data)
                        ? data
                        : data.vehicles ?? [];

                if (cancelled) return;

                const activeVehicles =
                    vehicleData.filter(
                        (vehicle: SimulationVehicle) =>
                            vehicle.status !== "COMPLETED",
                    );

                setVehicles(activeVehicles);

                /*
                 * No active vehicles remain.
                 */
                if (activeVehicles.length === 0) {
                    stopPolling();
                }
            } catch (error) {
                console.error(
                    "Failed to fetch simulation vehicles:",
                    error,
                );
            }
        }

        /*
         * Fetch immediately.
         */
        fetchVehicles();

        /*
         * Continue polling while vehicles exist.
         */
        interval = setInterval(
            fetchVehicles,
            3000,
        );

        return () => {
            cancelled = true;

            if (interval) {
                clearInterval(interval);
            }
        };
    }, [simulationId]);

    return vehicles;
}