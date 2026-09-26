"use client";

import { useEffect, useState } from "react";

type SimulationRun = {
    id: number;
    cityId: number;
    status: string;
    simulationTime: number;
};

type SimulationSelectorProps = {
    value: number | null;
    onChange: (simulationId: number | null) => void;
};

export default function SimulationSelector({
    value,
    onChange,
}: SimulationSelectorProps) {
    const [simulations, setSimulations] =
        useState<SimulationRun[]>([]);

    const [loading, setLoading] =
        useState(true);

    const [error, setError] =
        useState<string | null>(null);

    useEffect(() => {
        const fetchSimulations = async () => {
            try {
                const response = await fetch(
                    "/api/simulation/runs",
                    {
                        cache: "no-store",
                    },
                );

                if (!response.ok) {
                    throw new Error(
                        "Failed to fetch simulations",
                    );
                }

                const data: SimulationRun[] =
                    await response.json();

                setSimulations(data);
                setError(null);
            } catch (error) {
                console.error(
                    "Failed to fetch simulations:",
                    error,
                );

                setError(
                    "Failed to load simulations",
                );
            } finally {
                setLoading(false);
            }
        };

        fetchSimulations();
    }, []);

    return (
        <div>
            <label
                htmlFor="simulation"
                className="text-sm font-medium text-slate-700"
            >
                Simulation
            </label>

            <select
                id="simulation"
                value={value ?? ""}
                onChange={(event) => {
                    const simulationId =
                        Number(event.target.value);

                    onChange(
                        simulationId > 0
                            ? simulationId
                            : null,
                    );
                }}
                disabled={loading}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-500"
            >
                <option value="">
                    Select simulation
                </option>

                {simulations.map((simulation) => (
                    <option
                        key={simulation.id}
                        value={simulation.id}
                    >
                        Simulation #{simulation.id} —{" "}
                        {simulation.status}
                    </option>
                ))}
            </select>

            {loading && (
                <p className="mt-2 text-xs text-slate-500">
                    Loading simulations...
                </p>
            )}

            {error && (
                <p className="mt-2 text-xs text-red-500">
                    {error}
                </p>
            )}
        </div>
    );
}