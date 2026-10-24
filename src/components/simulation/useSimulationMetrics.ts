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

type Snapshot = {
    simulationId: number;
    metrics: SimulationMetrics;
    status: string;
    simulationTime: number;
    error: string | null;
};

export function useSimulationMetrics(simulationId: number | null, isRunning: boolean) {
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (simulationId === null) return;

        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let observedStatus: string | null = null;
        const fetchMetrics = async () => {
            setLoading(true);
            try {
                const response = await fetch(
                    `/api/simulation/runs/${simulationId}/metrics`,
                    { cache: "no-store" },
                );
                if (!response.ok) throw new Error("Failed to fetch simulation metrics");
                const data = await response.json();
                observedStatus = data.simulation.status;
                if (!cancelled) {
                    setSnapshot({
                        simulationId,
                        metrics: data.metrics,
                        status: data.simulation.status,
                        simulationTime: data.simulation.simulationTime,
                        error: null,
                    });
                }
            } catch (error) {
                observedStatus = null;
                if (!cancelled) {
                    setSnapshot((current) => ({
                        simulationId,
                        metrics: current?.simulationId === simulationId ? current.metrics : {
                            totalVehicles: 0,
                            activeVehicles: 0,
                            completedVehicles: 0,
                            waitingVehicles: 0,
                            signalWaitingVehicles: 0,
                            averageSpeedKmh: 0,
                            averageTravelTimeSeconds: 0,
                            activeQueues: 0,
                            maximumQueueVehicles: 0,
                            averageQueueLengthMeters: 0,
                            totalDistanceMeters: 0,
                        },
                        status: current?.simulationId === simulationId ? current.status : "UNKNOWN",
                        simulationTime: current?.simulationId === simulationId ? current.simulationTime : 0,
                        error: error instanceof Error ? error.message : "Failed to fetch simulation metrics",
                    }));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        const fetchAndSchedule = async () => {
            await fetchMetrics();
            if (!cancelled && isRunning && observedStatus === "RUNNING") {
                timer = setTimeout(() => void fetchAndSchedule(), 1000);
            }
        };

        void fetchAndSchedule();
        return () => {
            cancelled = true;
            if (timer !== null) clearTimeout(timer);
        };
    }, [simulationId, isRunning]);

    const current = snapshot?.simulationId === simulationId ? snapshot : null;
    return {
        metrics: current?.metrics ?? null,
        loading,
        error: current?.error ?? null,
        simulationStatus: current?.status ?? null,
        simulationTime: current?.simulationTime ?? null,
    };
}
