"use client";

import { useState } from "react";

import CityMapClient from "@/components/map/CityMapClient";

import type { VisibleLayers } from "@/components/map/types/map.types";

export default function DashboardPage() {
    const [visibleLayers, setVisibleLayers] =
        useState<VisibleLayers>({
            roads: false,
            intersections: false,
            buildings: false,
            trees: false,
            waterways: false,
            contours: false,
        });
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


            <div className="grid min-h-[calc(100vh-81px)] grid-cols-1 gap-4 p-4 lg:grid-cols-[1.1fr_1fr]">
                <section className="h-full min-h-[650px] overflow-hidden rounded-2xl border bg-white shadow-sm">
                    <div className="h-full w-full">
                        <CityMapClient
                            visibleLayers={visibleLayers}
                        />
                    </div>
                </section>

                <aside className="grid grid-rows-[auto_auto_1fr] gap-4">
                    <section className="rounded-xl border bg-white p-5 shadow-sm">
                        <h2 className="text-lg font-semibold">
                            City Overview
                        </h2>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <div className="rounded-lg bg-slate-50 p-4">
                                <p className="text-sm text-slate-500">
                                    Roads
                                </p>

                                <p className="mt-1 text-2xl font-semibold">
                                    14
                                </p>
                            </div>

                            <div className="rounded-lg bg-slate-50 p-4">
                                <p className="text-sm text-slate-500">
                                    Intersections
                                </p>

                                <p className="mt-1 text-2xl font-semibold">
                                    9
                                </p>
                            </div>

                            <div className="rounded-lg bg-slate-50 p-4">
                                <p className="text-sm text-slate-500">
                                    Buildings
                                </p>

                                <p className="mt-1 text-2xl font-semibold">
                                    —
                                </p>
                            </div>

                            <div className="rounded-lg bg-slate-50 p-4">
                                <p className="text-sm text-slate-500">
                                    Trees
                                </p>

                                <p className="mt-1 text-2xl font-semibold">
                                    —
                                </p>
                            </div>
                        </div>
                    </section>

                    <section className="rounded-xl border bg-white p-5 shadow-sm">
                        <h2 className="text-lg font-semibold">
                            Traffic Status
                        </h2>

                        <div className="mt-4 flex items-center gap-3 rounded-lg bg-slate-50 p-4">
                            <div className="h-3 w-3 rounded-full bg-green-500" />

                            <div>
                                <p className="font-medium">
                                    Simulation inactive
                                </p>

                                <p className="text-sm text-slate-500">
                                    Traffic simulation will be
                                    available in Phase 3.
                                </p>
                            </div>
                        </div>
                    </section>

                    <div className="rounded-2xl border bg-white p-5 shadow-sm">
                        <h2 className="text-base font-semibold text-gray-900">
                            City Infrastructure
                        </h2>

                        <p className="mt-1 text-sm text-gray-500">
                            Select the components to display on the map.
                        </p>

                        <div className="mt-4 space-y-3">
                            <label className="flex cursor-pointer items-center gap-3">
                                <input
                                    type="checkbox"
                                    checked={visibleLayers.roads}
                                    onChange={(event) =>
                                        setVisibleLayers((current) => ({
                                            ...current,
                                            roads: event.target.checked,
                                        }))
                                    }
                                    className="h-4 w-4 rounded border-gray-300"
                                />

                                <span className="text-sm text-gray-700">
                                    Roads
                                </span>
                            </label>

                            <label className="flex cursor-pointer items-center gap-3">
                                <input
                                    type="checkbox"
                                    checked={visibleLayers.intersections}
                                    onChange={(event) =>
                                        setVisibleLayers((current) => ({
                                            ...current,
                                            intersections:
                                                event.target.checked,
                                        }))
                                    }
                                    className="h-4 w-4 rounded border-gray-300"
                                />

                                <span className="text-sm text-gray-700">
                                    Intersections
                                </span>
                            </label>

                            <label className="flex cursor-pointer items-center gap-3">
                                <input
                                    type="checkbox"
                                    checked={visibleLayers.buildings}
                                    onChange={(event) =>
                                        setVisibleLayers((current) => ({
                                            ...current,
                                            buildings:
                                                event.target.checked,
                                        }))
                                    }
                                    className="h-4 w-4 rounded border-gray-300"
                                />

                                <span className="text-sm text-gray-700">
                                    Buildings
                                </span>
                            </label>

                            <label className="flex cursor-pointer items-center gap-3">
                                <input
                                    type="checkbox"
                                    checked={visibleLayers.trees}
                                    onChange={(event) =>
                                        setVisibleLayers((current) => ({
                                            ...current,
                                            trees: event.target.checked,
                                        }))
                                    }
                                    className="h-4 w-4 rounded border-gray-300"
                                />

                                <span className="text-sm text-gray-700">
                                    Trees
                                </span>
                            </label>

                            <label className="flex cursor-pointer items-center gap-3">
                                <input
                                    type="checkbox"
                                    checked={visibleLayers.waterways}
                                    onChange={(event) =>
                                        setVisibleLayers((current) => ({
                                            ...current,
                                            waterways:
                                                event.target.checked,
                                        }))
                                    }
                                    className="h-4 w-4 rounded border-gray-300"
                                />

                                <span className="text-sm text-gray-700">
                                    Waterways
                                </span>
                            </label>

                            <label className="flex cursor-pointer items-center gap-3">
                                <input
                                    type="checkbox"
                                    checked={visibleLayers.contours}
                                    onChange={(event) =>
                                        setVisibleLayers((current) => ({
                                            ...current,
                                            contours:
                                                event.target.checked,
                                        }))
                                    }
                                    className="h-4 w-4 rounded border-gray-300"
                                />

                                <span className="text-sm text-gray-700">
                                    Contours
                                </span>
                            </label>
                        </div>
                    </div>
                </aside>
            </div>
        </main>
    );
}