"use client";

import { useEffect, useState } from "react";

type SimulationMetrics = {
    totalVehicles: number;
    activeVehicles: number;
    completedVehicles: number;
    waitingVehicles: number;
    signalWaitingVehicles: number;
    averageSpeedKmh: number;
    averageTravelTimeSeconds: number;
    activeQueues: number;
    maximumQueueVehicles: number;
    averageQueueLengthMeters: number;
    totalDistanceMeters: number;
};

export function useSimulationMetrics(
    simulationId: number | null,
) {
    const [metrics, setMetrics] =
        useState<SimulationMetrics | null>(null);

    const [loading, setLoading] =
        useState(false);

    const [error, setError] =
        useState<string | null>(null);

    const [simulationStatus, setSimulationStatus] =
        useState<string | null>(null);

    const [simulationTime, setSimulationTime] =
        useState<number | null>(null);

    useEffect(() => {
        if (simulationId === null) {
            setMetrics(null);
            return;
        }

        let cancelled = false;
        let interval: NodeJS.Timeout | null = null;

        const stopPolling = () => {
            if (interval) {
                clearInterval(interval);
                interval = null;

                console.log(
                    `Simulation ${simulationId}: metrics polling stopped.`,
                );
            }
        };

        const fetchMetrics = async () => {
            try {
                /*
                 * First check whether the simulation
                 * is still running.
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
                        "Failed to fetch simulation status",
                    );
                }

                const simulation =
                    await simulationResponse.json();

                if (cancelled) {
                    return;
                }

                setSimulationStatus(simulation.status);
                setSimulationTime(simulation.simulationTime);

                /*
                 * Simulation has stopped.
                 *
                 * Keep the last metrics visible,
                 * but stop making further requests.
                 */
                if (simulation.status !== "RUNNING") {
                    stopPolling();
                    return;
                }

                setLoading(true);

                const response =
                    await fetch(
                        `/api/simulation/runs/${simulationId}/metrics`,
                        {
                            cache: "no-store",
                        },
                    );

                if (!response.ok) {
                    throw new Error(
                        "Failed to fetch simulation metrics",
                    );
                }

                const data =
                    await response.json();

                if (cancelled) {
                    return;
                }

                setMetrics(data.metrics);
                setError(null);
            } catch (error) {
                if (cancelled) {
                    return;
                }

                console.error(
                    "Failed to fetch simulation metrics:",
                    error,
                );

                setError(
                    "Failed to fetch simulation metrics",
                );
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        /*
         * Fetch immediately.
         */
        fetchMetrics();

        /*
         * Continue while simulation is RUNNING.
         * fetchMetrics() will remove this interval
         * once the simulation stops.
         */
        interval = setInterval(
            fetchMetrics,
            1000,
        );

        return () => {
            cancelled = true;

            if (interval) {
                clearInterval(interval);
            }
        };
    }, [simulationId]);

    return {
        metrics,
        loading,
        error,
        simulationStatus,
        simulationTime,
    };
}