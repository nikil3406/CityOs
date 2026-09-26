"use client";

import { useState } from "react";

import CityMapClient from "@/components/map/CityMapClient";
import { useCityMapData } from "@/components/map/hooks/useCityMapData";

import type { VisibleLayers } from "@/components/map/types/map.types";

import SimulationSelector
    from "@/components/simulation/SimulationSelector";

import {
    useSimulationMetrics,
} from "@/components/simulation/useSimulationMetrics";

import SimulationEvents
    from "@/components/simulation/SimulationEvents";

export default function DashboardPage() {
    const [selectedCityId, setSelectedCityId] =
        useState(1);

    const [visibleLayers, setVisibleLayers] =
        useState<VisibleLayers>({
            roads: false,
            intersections: false,
            buildings: false,
            trees: false,
            waterways: false,
            contours: false,
        });

    const [selectedSimulationId, setSelectedSimulationId] =
        useState<number | null>(null);

    const {
        cities,
        roads,
        intersections,
        buildings,
        trees,
        waterAreas,
        waterLines,
        contours,
        boundary,
        loading,
        error,
    } = useCityMapData(selectedCityId);

    const {
        metrics,
        simulationStatus,
        simulationTime,
        loading: metricsLoading,
        error: metricsError,
    } = useSimulationMetrics(selectedSimulationId);

    const toggleLayer = (
        layer: keyof VisibleLayers,
        checked: boolean,
    ) => {
        setVisibleLayers((current) => ({
            ...current,
            [layer]: checked,
        }));
    };

    const vehicleRoads = roads.filter(
        (road) => road.type?.toLowerCase() !== "footway",
    );

    return (
        <main className="min-h-screen bg-slate-50">
            <header className="border-b bg-white px-8 py-6">
                <h1 className="text-3xl font-bold tracking-tight text-slate-800">
                    CityOS
                </h1>

                <p className="mt-1 text-sm text-slate-500">
                    City Operations Dashboard
                </p>
            </header>

            <div className="grid min-h-[calc(100vh-81px)] grid-cols-1 items-start gap-4 p-4 lg:grid-cols-[1.1fr_1fr]">
                <div className="flex flex-col gap-4">
                    <section className="h-[650px] overflow-hidden rounded-2xl border bg-white shadow-sm">
                        <div className="h-full w-full">
                            <CityMapClient
                                selectedCityId={
                                    selectedCityId
                                }
                                setSelectedCityId={
                                    setSelectedCityId
                                }
                                visibleLayers={
                                    visibleLayers
                                }
                                cities={cities}
                                roads={roads}
                                intersections={
                                    intersections
                                }
                                buildings={buildings}
                                trees={trees}
                                waterAreas={
                                    waterAreas
                                }
                                waterLines={
                                    waterLines
                                }
                                contours={contours}
                                boundary={boundary}
                                loading={loading}
                                error={error}
                            />
                        </div>
                    </section>

                    <SimulationEvents
                        simulationId={
                            selectedSimulationId
                        }
                    />
                </div>

                <aside className="grid grid-rows-[auto_auto_1fr] gap-4">
                    {/* CITY OVERVIEW */}
                    <section className="rounded-xl border bg-white p-5 shadow-sm">
                        <h2 className="text-lg font-semibold text-slate-800">
                            City Overview
                        </h2>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <div className="rounded-lg bg-slate-50 p-4">
                                <p className="text-sm text-slate-500">
                                    Roads
                                </p>

                                <p className="mt-1 text-2xl font-semibold text-slate-800">
                                    {loading
                                        ? "—"
                                        : vehicleRoads.length}
                                </p>
                            </div>

                            <div className="rounded-lg bg-slate-50 p-4">
                                <p className="text-sm text-slate-500">
                                    Intersections
                                </p>

                                <p className="mt-1 text-2xl font-semibold text-slate-800">
                                    {loading
                                        ? "—"
                                        : intersections.length}
                                </p>
                            </div>

                            <div className="rounded-lg bg-slate-50 p-4">
                                <p className="text-sm text-slate-500">
                                    Buildings
                                </p>

                                <p className="mt-1 text-2xl font-semibold text-slate-800">
                                    {loading
                                        ? "—"
                                        : buildings.length}
                                </p>
                            </div>

                            <div className="rounded-lg bg-slate-50 p-4">
                                <p className="text-sm text-slate-500">
                                    Trees
                                </p>

                                <p className="mt-1 text-2xl font-semibold text-slate-800">
                                    {loading
                                        ? "—"
                                        : trees.length}
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* TRAFFIC STATUS */}
                    <section className="rounded-xl border bg-white p-5 shadow-sm">
                        <h2 className="text-lg font-semibold text-slate-800">
                            Traffic Simulation
                        </h2>

                        <div className="mt-4">
                            <SimulationSelector
                                value={selectedSimulationId}
                                onChange={setSelectedSimulationId}
                            />
                        </div>

                        {selectedSimulationId === null ? (
                            <div className="mt-4 rounded-lg bg-slate-50 p-4">
                                <p className="text-sm text-slate-500">
                                    Select a simulation to view live traffic
                                    metrics.
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 p-4">
                                    <div className="flex items-center gap-3">
                                        <div
                                            className={`h-3 w-3 rounded-full ${simulationStatus === "RUNNING"
                                                ? "bg-green-500"
                                                : "bg-slate-400"
                                                }`}
                                        />

                                        <div>
                                            <p className="font-medium text-slate-800">
                                                {simulationStatus}
                                            </p>

                                            <p className="text-sm text-slate-500">
                                                Simulation time:{" "}
                                                {simulationTime}s
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {metricsLoading && !metrics ? (
                                    <p className="mt-4 text-sm text-slate-500">
                                        Loading metrics...
                                    </p>
                                ) : metricsError ? (
                                    <p className="mt-4 text-sm text-red-500">
                                        {metricsError}
                                    </p>
                                ) : metrics ? (
                                    <div className="mt-4 grid grid-cols-2 gap-3">
                                        <div className="rounded-lg bg-slate-50 p-3">
                                            <p className="text-xs text-slate-500">
                                                Total Vehicles
                                            </p>
                                            <p className="mt-1 text-xl font-semibold text-slate-800">
                                                {metrics.totalVehicles}
                                            </p>
                                        </div>

                                        <div className="rounded-lg bg-slate-50 p-3">
                                            <p className="text-xs text-slate-500">
                                                Active Vehicles
                                            </p>
                                            <p className="mt-1 text-xl font-semibold text-slate-800">
                                                {metrics.activeVehicles}
                                            </p>
                                        </div>

                                        <div className="rounded-lg bg-slate-50 p-3">
                                            <p className="text-xs text-slate-500">
                                                Waiting Vehicles
                                            </p>
                                            <p className="mt-1 text-xl font-semibold text-slate-800">
                                                {metrics.waitingVehicles}
                                            </p>
                                        </div>

                                        <div className="rounded-lg bg-slate-50 p-3">
                                            <p className="text-xs text-slate-500">
                                                Average Speed
                                            </p>
                                            <p className="mt-1 text-xl font-semibold text-slate-800">
                                                {metrics.averageSpeedKmh.toFixed(1)}
                                                {" "}
                                                <span className="text-sm font-normal">
                                                    km/h
                                                </span>
                                            </p>
                                        </div>

                                        <div className="rounded-lg bg-slate-50 p-3">
                                            <p className="text-xs text-slate-500">
                                                Active Queues
                                            </p>
                                            <p className="mt-1 text-xl font-semibold text-slate-800">
                                                {metrics.activeQueues}
                                            </p>
                                        </div>

                                        <div className="rounded-lg bg-slate-50 p-3">
                                            <p className="text-xs text-slate-500">
                                                Max Queue
                                            </p>
                                            <p className="mt-1 text-xl font-semibold text-slate-800">
                                                {metrics.maximumQueueVehicles}
                                            </p>
                                        </div>
                                    </div>
                                ) : null}
                            </>
                        )}
                    </section>

                    {/* CITY INFRASTRUCTURE */}
                    <section className="rounded-2xl border bg-white p-5 shadow-sm">
                        <h2 className="text-base font-semibold text-gray-900">
                            City Infrastructure
                        </h2>

                        <p className="mt-1 text-sm text-gray-500">
                            Select the components to
                            display on the map.
                        </p>

                        <div className="mt-4 space-y-3">
                            <label className="flex cursor-pointer items-center justify-between">
                                <span className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        checked={
                                            visibleLayers.roads
                                        }
                                        onChange={(
                                            event,
                                        ) =>
                                            toggleLayer(
                                                "roads",
                                                event
                                                    .target
                                                    .checked,
                                            )
                                        }
                                        className="h-4 w-4 rounded border-gray-300"
                                    />

                                    <span className="text-sm text-gray-700">
                                        Roads
                                    </span>
                                </span>

                                <span className="text-sm font-medium text-gray-500">
                                    {loading
                                        ? "—"
                                        : roads.length}
                                </span>
                            </label>

                            <label className="flex cursor-pointer items-center justify-between">
                                <span className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        checked={
                                            visibleLayers.intersections
                                        }
                                        onChange={(
                                            event,
                                        ) =>
                                            toggleLayer(
                                                "intersections",
                                                event
                                                    .target
                                                    .checked,
                                            )
                                        }
                                        className="h-4 w-4 rounded border-gray-300"
                                    />

                                    <span className="text-sm text-gray-700">
                                        Intersections
                                    </span>
                                </span>

                                <span className="text-sm font-medium text-gray-500">
                                    {loading
                                        ? "—"
                                        : intersections.length}
                                </span>
                            </label>

                            <label className="flex cursor-pointer items-center justify-between">
                                <span className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        checked={
                                            visibleLayers.buildings
                                        }
                                        onChange={(
                                            event,
                                        ) =>
                                            toggleLayer(
                                                "buildings",
                                                event
                                                    .target
                                                    .checked,
                                            )
                                        }
                                        className="h-4 w-4 rounded border-gray-300"
                                    />

                                    <span className="text-sm text-gray-700">
                                        Buildings
                                    </span>
                                </span>

                                <span className="text-sm font-medium text-gray-500">
                                    {loading
                                        ? "—"
                                        : buildings.length}
                                </span>
                            </label>

                            <label className="flex cursor-pointer items-center justify-between">
                                <span className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        checked={
                                            visibleLayers.trees
                                        }
                                        onChange={(
                                            event,
                                        ) =>
                                            toggleLayer(
                                                "trees",
                                                event
                                                    .target
                                                    .checked,
                                            )
                                        }
                                        className="h-4 w-4 rounded border-gray-300"
                                    />

                                    <span className="text-sm text-gray-700">
                                        Trees
                                    </span>
                                </span>

                                <span className="text-sm font-medium text-gray-500">
                                    {loading
                                        ? "—"
                                        : trees.length}
                                </span>
                            </label>

                            <label className="flex cursor-pointer items-center justify-between">
                                <span className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        checked={
                                            visibleLayers.waterways
                                        }
                                        onChange={(
                                            event,
                                        ) =>
                                            toggleLayer(
                                                "waterways",
                                                event
                                                    .target
                                                    .checked,
                                            )
                                        }
                                        className="h-4 w-4 rounded border-gray-300"
                                    />

                                    <span className="text-sm text-gray-700">
                                        Waterways
                                    </span>
                                </span>

                                <span className="text-sm font-medium text-gray-500">
                                    {loading
                                        ? "—"
                                        : waterAreas.length +
                                        waterLines.length}
                                </span>
                            </label>

                            <label className="flex cursor-pointer items-center justify-between">
                                <span className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        checked={
                                            visibleLayers.contours
                                        }
                                        onChange={(
                                            event,
                                        ) =>
                                            toggleLayer(
                                                "contours",
                                                event
                                                    .target
                                                    .checked,
                                            )
                                        }
                                        className="h-4 w-4 rounded border-gray-300"
                                    />

                                    <span className="text-sm text-gray-700">
                                        Contours
                                    </span>
                                </span>

                                <span className="text-sm font-medium text-gray-500">
                                    {loading
                                        ? "—"
                                        : contours.length}
                                </span>
                            </label>
                        </div>
                    </section>
                </aside>
            </div>
        </main>
    );
}