"use client";

import { useEffect, useState } from "react";

type SimulationEvent = {
    id: number;
    simulationRunId: number;
    type: string;
    roadId: number | null;
    intersectionId: number | null;
    location: unknown;
    data: Record<string, unknown> | null;
    simulationTime: number;
    createdAt: string;
};

type SimulationEventsProps = {
    simulationId: number | null;
};

export default function SimulationEvents({
    simulationId,
}: SimulationEventsProps) {
    const [events, setEvents] =
        useState<SimulationEvent[]>([]);

    const [loading, setLoading] =
        useState(false);

    const [error, setError] =
        useState<string | null>(null);

    useEffect(() => {
        if (simulationId === null) {
            setEvents([]);
            return;
        }

        let cancelled = false;

        const fetchEvents = async () => {
            try {
                setLoading(true);

                const response = await fetch(
                    `/api/simulation/runs/${simulationId}/events`,
                    {
                        cache: "no-store",
                    },
                );

                if (!response.ok) {
                    throw new Error(
                        "Failed to fetch simulation events",
                    );
                }

                const data = await response.json();

                if (cancelled) {
                    return;
                }

                setEvents(data.events);
                setError(null);
            } catch (error) {
                if (cancelled) {
                    return;
                }

                console.error(
                    "Failed to fetch simulation events:",
                    error,
                );

                setError(
                    "Failed to fetch simulation events",
                );
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        fetchEvents();

        const interval = setInterval(
            fetchEvents,
            2000,
        );

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [simulationId]);

    return (
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-slate-800">
                        Simulation Events
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                        Significant events recorded during
                        the simulation.
                    </p>
                </div>

                {loading && (
                    <span className="text-xs text-slate-400">
                        Updating...
                    </span>
                )}
            </div>

            {simulationId === null ? (
                <div className="mt-4 rounded-lg bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">
                        Select a simulation to view events.
                    </p>
                </div>
            ) : error ? (
                <div className="mt-4 rounded-lg bg-red-50 p-4">
                    <p className="text-sm text-red-600">
                        {error}
                    </p>
                </div>
            ) : events.length === 0 ? (
                <div className="mt-4 rounded-lg bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">
                        No events recorded yet.
                    </p>
                </div>
            ) : (
                <div className="mt-4 space-y-3">
                    {events
                        .slice()
                        .reverse()
                        .map((event) => (
                            <div
                                key={event.id}
                                className="rounded-lg border border-slate-100 bg-slate-50 p-4"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="font-medium text-slate-800">
                                            {event.type
                                                .replaceAll(
                                                    "_",
                                                    " ",
                                                )}
                                        </p>

                                        <p className="mt-1 text-xs text-slate-500">
                                            Simulation time:{" "}
                                            {event.simulationTime}s
                                        </p>
                                    </div>

                                    <span className="text-xs text-slate-400">
                                        #{event.id}
                                    </span>
                                </div>

                                {event.data && (
                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                        {Object.entries(
                                            event.data,
                                        ).map(
                                            ([key, value]) => (
                                                <div
                                                    key={key}
                                                    className="rounded-md bg-white p-2"
                                                >
                                                    <p className="text-xs text-slate-400">
                                                        {key.replaceAll(
                                                            "_",
                                                            " ",
                                                        )}
                                                    </p>

                                                    <p className="text-sm font-medium text-slate-700">
                                                        {String(
                                                            value,
                                                        )}
                                                    </p>
                                                </div>
                                            ),
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                </div>
            )}
        </section>
    );
}