import { useEffect, useState } from "react";

export type SimulationMetrics = {
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

type SimulationResponse = {
    simulation: {
        id: number;
        cityId: number;
        status: string;
        simulationTime: number;
    };
    metrics: SimulationMetrics;
};

export function useSimulationMetrics(
    simulationId: number | null,
) {
    const [metrics, setMetrics] =
        useState<SimulationMetrics | null>(null);

    const [simulationStatus, setSimulationStatus] =
        useState<string>("INACTIVE");

    const [simulationTime, setSimulationTime] =
        useState(0);

    const [loading, setLoading] =
        useState(false);

    const [error, setError] =
        useState<string | null>(null);

    useEffect(() => {
        if (simulationId === null) {
            setMetrics(null);
            setSimulationStatus("INACTIVE");
            setSimulationTime(0);
            return;
        }

        let cancelled = false;

        const fetchMetrics = async () => {
            try {
                setLoading(true);

                const response = await fetch(
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

                const data: SimulationResponse =
                    await response.json();

                if (cancelled) {
                    return;
                }

                setMetrics(data.metrics);
                setSimulationStatus(
                    data.simulation.status,
                );
                setSimulationTime(
                    data.simulation.simulationTime,
                );
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

        fetchMetrics();

        const interval = setInterval(
            fetchMetrics,
            1000,
        );

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [simulationId]);

    return {
        metrics,
        simulationStatus,
        simulationTime,
        loading,
        error,
    };
}