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
    let interval: NodeJS.Timeout | null = null;

    const stopPolling = () => {
        if (interval) {
            clearInterval(interval);
            interval = null;

            console.log(
                `Simulation ${simulationId}: event polling stopped.`,
            );
        }
    };

    const fetchEvents = async () => {
        try {
            /*
             * Check simulation status first.
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

            /*
             * Once the simulation stops,
             * stop polling events.
             *
             * Existing events remain visible.
             */
            if (simulation.status !== "RUNNING") {
                stopPolling();
                return;
            }

            setLoading(true);

            const response =
                await fetch(
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

            const data =
                await response.json();

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

    /*
     * Initial fetch.
     */
    fetchEvents();

    /*
     * Poll while the simulation is running.
     */
    interval = setInterval(
        fetchEvents,
        2000,
    );

    return () => {
        cancelled = true;

        if (interval) {
            clearInterval(interval);
        }
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
                        .map((event) => {
                            const isCongestionDetected =
                                event.type ===
                                "CONGESTION_DETECTED";

                            const isCongestionCleared =
                                event.type ===
                                "CONGESTION_CLEARED";

                            return (
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
                                                {
                                                    event.simulationTime
                                                }
                                                s
                                            </p>
                                        </div>

                                        <span className="text-xs text-slate-400">
                                            #{event.id}
                                        </span>
                                    </div>

                                    {event.data &&
                                        isCongestionDetected && (
                                            <div className="mt-3">
                                                <div className="mb-3 rounded-md bg-red-50 px-3 py-2">
                                                    <p className="text-xs font-medium uppercase tracking-wide text-red-500">
                                                        Congestion level
                                                    </p>

                                                    <p className="mt-1 text-sm font-semibold text-red-700">
                                                        {
                                                            String(
                                                                event
                                                                    .data
                                                                    .congestionLevel ??
                                                                    "UNKNOWN",
                                                            )
                                                        }
                                                    </p>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2">
                                                    <EventValue
                                                        label="Road"
                                                        value={
                                                            event
                                                                .data
                                                                .roadId
                                                        }
                                                    />

                                                    <EventValue
                                                        label="Segment"
                                                        value={
                                                            event
                                                                .data
                                                                .segmentId
                                                        }
                                                    />

                                                    <EventValue
                                                        label="Vehicles"
                                                        value={
                                                            event
                                                                .data
                                                                .vehicleCount
                                                        }
                                                    />

                                                    <EventValue
                                                        label="Average speed"
                                                        value={
                                                            event
                                                                .data
                                                                .averageSpeedKmh !==
                                                            null
                                                                ? `${String(
                                                                      event
                                                                          .data
                                                                          .averageSpeedKmh,
                                                                  )} km/h`
                                                                : null
                                                        }
                                                    />

                                                    <EventValue
                                                        label="Queued vehicles"
                                                        value={
                                                            event
                                                                .data
                                                                .queueVehicleCount
                                                        }
                                                    />

                                                    <EventValue
                                                        label="Queue length"
                                                        value={
                                                            event
                                                                .data
                                                                .queueLengthMeters !==
                                                            null
                                                                ? `${String(
                                                                      event
                                                                          .data
                                                                          .queueLengthMeters,
                                                                  )} m`
                                                                : null
                                                        }
                                                    />
                                                </div>
                                            </div>
                                        )}

                                    {event.data &&
                                        isCongestionCleared && (
                                            <div className="mt-3">
                                                <div className="mb-3 rounded-md bg-green-50 px-3 py-2">
                                                    <p className="text-xs font-medium uppercase tracking-wide text-green-600">
                                                        Congestion status
                                                    </p>

                                                    <p className="mt-1 text-sm font-semibold text-green-700">
                                                        Cleared
                                                    </p>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2">
                                                    <EventValue
                                                        label="Road"
                                                        value={
                                                            event
                                                                .data
                                                                .roadId
                                                        }
                                                    />

                                                    <EventValue
                                                        label="Segment"
                                                        value={
                                                            event
                                                                .data
                                                                .segmentId
                                                        }
                                                    />

                                                    <EventValue
                                                        label="Current level"
                                                        value={
                                                            event
                                                                .data
                                                                .currentLevel
                                                        }
                                                    />

                                                    <EventValue
                                                        label="Vehicles"
                                                        value={
                                                            event
                                                                .data
                                                                .vehicleCount
                                                        }
                                                    />

                                                    <EventValue
                                                        label="Average speed"
                                                        value={
                                                            event
                                                                .data
                                                                .averageSpeedKmh !==
                                                            null
                                                                ? `${String(
                                                                      event
                                                                          .data
                                                                          .averageSpeedKmh,
                                                                  )} km/h`
                                                                : null
                                                        }
                                                    />

                                                    <EventValue
                                                        label="Queued vehicles"
                                                        value={
                                                            event
                                                                .data
                                                                .queueVehicleCount
                                                        }
                                                    />

                                                    <EventValue
                                                        label="Queue length"
                                                        value={
                                                            event
                                                                .data
                                                                .queueLengthMeters !==
                                                            null
                                                                ? `${String(
                                                                      event
                                                                          .data
                                                                          .queueLengthMeters,
                                                                  )} m`
                                                                : null
                                                        }
                                                    />
                                                </div>
                                            </div>
                                        )}

                                    {event.data &&
                                        !isCongestionDetected &&
                                        !isCongestionCleared && (
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
                            );
                        })}
                </div>
            )}
        </section>
    );
}

function EventValue({
    label,
    value,
}: {
    label: string;
    value: unknown;
}) {
    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }

    return (
        <div className="rounded-md bg-white p-2">
            <p className="text-xs text-slate-400">
                {label}
            </p>

            <p className="text-sm font-medium text-slate-700">
                {String(value)}
            </p>
        </div>
    );
}