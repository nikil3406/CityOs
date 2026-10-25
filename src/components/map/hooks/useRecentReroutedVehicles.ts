"use client";

import { useEffect, useState } from "react";

const HIGHLIGHT_MS = 5_000;

type RerouteEvent = {
    type: string;
    createdAt: string;
    data: { vehicleId?: number } | null;
};

export function useRecentReroutedVehicles(
    simulationId: number | null,
    simulationStatus: string | null,
) {
    const [snapshot, setSnapshot] = useState<{ simulationId: number; reroutedUntil: Map<number, number> } | null>(null);

    useEffect(() => {
        if (simulationId === null) return;

        let cancelled = false;
        const refresh = async () => {
            try {
                const response = await fetch(
                    `/api/simulation/runs/${simulationId}/events?type=DYNAMIC_REROUTE_APPLIED`,
                    { cache: "no-store" },
                );
                if (!response.ok) return;
                const result = await response.json();
                if (cancelled) return;

                const now = Date.now();
                setSnapshot((current) => {
                    const currentMap = current?.simulationId === simulationId ? current.reroutedUntil : new Map<number, number>();
                    const next = new Map<number, number>();
                    for (const [vehicleId, expiresAt] of currentMap) {
                        if (expiresAt > now) next.set(vehicleId, expiresAt);
                    }
                    for (const event of (result.events ?? []) as RerouteEvent[]) {
                        const vehicleId = Number(event.data?.vehicleId);
                        const createdAt = Date.parse(event.createdAt);
                        const expiresAt = createdAt + HIGHLIGHT_MS;
                        if (Number.isInteger(vehicleId) && vehicleId > 0 && expiresAt > now) {
                            next.set(vehicleId, Math.max(next.get(vehicleId) ?? 0, expiresAt));
                        }
                    }
                    return { simulationId, reroutedUntil: next };
                });
            } catch (error) {
                if (!cancelled) console.error("Failed to fetch recent reroutes:", error);
            }
        };

        void refresh();
        const interval = simulationStatus === "RUNNING"
            ? setInterval(() => void refresh(), 750)
            : null;
        const expiryTimer = setInterval(() => {
            const now = Date.now();
            setSnapshot((current) => {
                if (!current || current.simulationId !== simulationId) return current;
                const next = new Map([...current.reroutedUntil].filter(([, expiresAt]) => expiresAt > now));
                return next.size === current.reroutedUntil.size ? current : { ...current, reroutedUntil: next };
            });
        }, 250);

        return () => {
            cancelled = true;
            if (interval) clearInterval(interval);
            clearInterval(expiryTimer);
        };
    }, [simulationId, simulationStatus]);

    const reroutedUntil = snapshot?.simulationId === simulationId ? snapshot.reroutedUntil : null;
    return (vehicleId: number) => (reroutedUntil?.get(vehicleId) ?? 0) > Date.now();
}
