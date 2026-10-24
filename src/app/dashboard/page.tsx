"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CityMapClient from "@/components/map/CityMapClient";
import { useCityMapData } from "@/components/map/hooks/useCityMapData";
import type { VisibleLayers } from "@/components/map/types/map.types";
import { useSimulationMetrics } from "@/components/simulation/useSimulationMetrics";
import SimulationEvents from "@/components/simulation/SimulationEvents";
import type { RouteResult, RoutingStrategy } from "@/modules/road/routing.service";

type Run = { id: number; cityId: number; status: string; simulationTime: number; createdAt: string };
type Light = { id: number; intersectionId: number; intersectionName: string | null; currentPhase: number; cycleDuration: number; phaseElapsed: number; status: string; phases: { phaseNumber: number; durationSeconds: number; state: string }[]; movements: { phaseNumber: number; fromRoadId: number; toRoadId: number; state: string }[] };
type Congestion = { congestionLevel: string; queueVehicleCount: number };
type RoutePreview = RouteResult & { cityId: number; startIntersectionId: number; destinationIntersectionId: number; strategy: RoutingStrategy; routeGeometry: [number, number][] };
type ManualRoute = { sourceIntersectionId: number; destinationIntersectionId: number; strategy: RoutingStrategy; route: RouteResult };

const initialLayers: VisibleLayers = { roads: true, intersections: true, buildings: false, trees: false, waterways: false, contours: false };
const panel = "rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_-24px_rgba(15,23,42,.35)]";

export default function DashboardPage() {
    const [cityId, setCityId] = useState(1);
    const [runs, setRuns] = useState<Run[]>([]);
    const [runId, setRunId] = useState<number | null>(null);
    const [lights, setLights] = useState<Light[]>([]);
    const [lightId, setLightId] = useState<number | null>(null);
    const [sourceId, setSourceId] = useState<number | null>(null);
    const [destinationId, setDestinationId] = useState<number | null>(null);
    const [manualRoutes, setManualRoutes] = useState<ManualRoute[]>([]);
    const [shortestPreview, setShortestPreview] = useState<RoutePreview | null>(null);
    const [fastestPreview, setFastestPreview] = useState<RoutePreview | null>(null);
    const [selectedStrategy, setSelectedStrategy] = useState<RoutingStrategy | null>(null);
    const [previewingStrategy, setPreviewingStrategy] = useState<RoutingStrategy | null>(null);
    const previewRequestId = useRef(0);
    const [selectionTarget, setSelectionTarget] = useState<"source" | "destination">("source");
    const [showEndpointMarkers, setShowEndpointMarkers] = useState(true);
    const [showRouteLine, setShowRouteLine] = useState(true);
    const [mode, setMode] = useState<"automatic" | "manual">("automatic");
    const [count, setCount] = useState(25);
    const [layers, setLayers] = useState(initialLayers);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState("");
    const [congestion, setCongestion] = useState<Congestion[]>([]);
    const [vehicleCountSnapshot, setVehicleCountSnapshot] = useState<{ runId: number; count: number } | null>(null);

    const { cities, roads, intersections, buildings, trees, waterAreas, waterLines, contours, boundary, loading: mapLoading, error: mapError } = useCityMapData(cityId);
    const selectedRun = runs.find((run) => run.id === runId) ?? null;
    const hasRunningRuns = runs.some((run) => run.status === "RUNNING");
    const { metrics, loading: metricsLoading, error: metricsError } = useSimulationMetrics(runId, selectedRun?.status === "RUNNING");
    const selectedLight = lights.find((light) => light.id === lightId) ?? null;
    const signalIndicators = useMemo(() => lights.map((light) => ({ intersectionId: light.intersectionId, state: light.phases.find((phase) => phase.phaseNumber === light.currentPhase)?.state ?? light.status })), [lights]);
    const congestedRoads = congestion.filter((segment) => segment.congestionLevel === "CONGESTED" || segment.congestionLevel === "SEVERE").length;
    const visibleVehicleCount = vehicleCountSnapshot?.runId === runId ? vehicleCountSnapshot.count : null;
    const cityName = cities.find((city) => city.id === cityId)?.name ?? `City ${cityId}`;
    const selectedPreview = selectedStrategy === "SHORTEST_DISTANCE"
        ? shortestPreview
        : selectedStrategy === "FASTEST_TIME"
          ? fastestPreview
          : null;

    const invalidateRoutePreviews = () => {
        previewRequestId.current += 1;
        setShortestPreview(null);
        setFastestPreview(null);
        setSelectedStrategy(null);
        setPreviewingStrategy(null);
    };

    const refreshRuns = useCallback(async () => {
        try {
            const response = await fetch("/api/simulation/runs", { cache: "no-store" });
            if (!response.ok) throw new Error("Could not load simulations");
            const data: Run[] = await response.json();
            setRuns(data);
            setRunId((current) => current && data.some((run) => run.id === current && run.cityId === cityId) ? current : null);
        } catch (error) { setNotice(error instanceof Error ? error.message : "Could not load simulations"); }
    }, [cityId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void refreshRuns();
        if (!hasRunningRuns) return;
        const timer = setInterval(() => void refreshRuns(), 3000);
        return () => clearInterval(timer);
    }, [refreshRuns, hasRunningRuns]);
    useEffect(() => {
        let active = true;
        const loadSignals = async () => {
            try {
                const response = await fetch(`/api/traffic_lights?cityId=${cityId}`, { cache: "no-store" });
                if (!response.ok) throw new Error("Could not load signal data");
                const signals = await response.json();
                if (active) {
                    const nextLights: Light[] = signals.trafficLights ?? [];
                    setLights(nextLights);
                    setLightId((current) => current && nextLights.some((light) => light.id === current) ? current : nextLights[0]?.id ?? null);
                }
            } catch { if (active) setNotice("Could not load signal data"); }
        };
        void loadSignals();
        if (!hasRunningRuns) return () => { active = false; };
        const timer = setInterval(() => void loadSignals(), 2000);
        return () => { active = false; clearInterval(timer); };
    }, [cityId, hasRunningRuns]);
    useEffect(() => {
        if (!runId) return;
        let active = true;
        const load = async () => {
            try {
                const response = await fetch(`/api/simulation/runs/${runId}/congestion`, { cache: "no-store" });
                if (!response.ok) return;
                const data = await response.json();
                if (active) setCongestion(Array.isArray(data.congestion) ? data.congestion : []);
            } catch { if (active) setCongestion([]); }
        };
        void load();
        if (selectedRun?.status !== "RUNNING") return () => { active = false; };
        const timer = setInterval(() => void load(), 3000);
        return () => { active = false; clearInterval(timer); };
    }, [runId, selectedRun?.status]);
    useEffect(() => {
        if (!runId) return;
        let active = true;
        const loadCount = async () => {
            try {
                const response = await fetch(`/api/simulation/runs/${runId}/vehicles`, { cache: "no-store" });
                if (!response.ok) return;
                const data = await response.json();
                if (active) setVehicleCountSnapshot({ runId, count: Array.isArray(data) ? data.length : 0 });
            } catch { /* Keep the latest successful count visible. */ }
        };
        void loadCount();
        if (selectedRun?.status !== "RUNNING") return () => { active = false; };
        const timer = setInterval(() => void loadCount(), 3000);
        return () => { active = false; clearInterval(timer); };
    }, [runId, selectedRun?.status]);

    const runAction = async (action: "start" | "pause" | "stop") => {
        if (!runId) return;
        if (action === "stop" && !window.confirm("Stop this simulation? A stopped run cannot be resumed.")) return;
        setBusy(true); setNotice("");
        try {
            const response = await fetch(`/api/simulation/runs/${runId}/${action}`, { method: "POST" });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error ?? `Unable to ${action} simulation`);
            await refreshRuns(); setNotice(`Simulation ${action === "start" ? "started or resumed" : `${action}ped`}.`);
        } catch (error) { setNotice(error instanceof Error ? error.message : "Simulation action failed"); }
        finally { setBusy(false); }
    };

    const createRun = async () => {
        setBusy(true); setNotice("");
        try { const response = await fetch("/api/simulation/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cityId }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Could not create simulation"); await refreshRuns(); setRunId(data.id); setNotice(`Created simulation #${data.id}.`); }
        catch (error) { setNotice(error instanceof Error ? error.message : "Could not create simulation"); } finally { setBusy(false); }
    };

    const previewRoute = async (strategy: RoutingStrategy): Promise<void> => {
        if (sourceId === null || destinationId === null || sourceId === destinationId) {
            setNotice("Choose two different intersections.");
            return;
        }
        const requestId = ++previewRequestId.current;
        setPreviewingStrategy(strategy);
        setNotice("");
        try {
            const response = await fetch(
                `/api/cities/${cityId}/route?start=${sourceId}&destination=${destinationId}&strategy=${strategy}`,
                { cache: "no-store" },
            );
            const data = await response.json();
            if (!response.ok) throw new Error(data.error ?? "No route found");
            if (requestId !== previewRequestId.current) return;
            const preview = data as RoutePreview;
            if (strategy === "SHORTEST_DISTANCE") setShortestPreview(preview);
            else setFastestPreview(preview);
            setNotice(`${strategy === "SHORTEST_DISTANCE" ? "Shortest-distance" : "Fastest-time"} route preview ready.`);
        } catch (error) {
            if (requestId !== previewRequestId.current) return;
            if (strategy === "SHORTEST_DISTANCE") setShortestPreview(null);
            else setFastestPreview(null);
            setSelectedStrategy((current) => {
                if (current !== strategy) return current;
                return strategy === "SHORTEST_DISTANCE" && fastestPreview
                    ? "FASTEST_TIME"
                    : strategy === "FASTEST_TIME" && shortestPreview
                      ? "SHORTEST_DISTANCE"
                      : null;
            });
            setNotice(error instanceof Error ? error.message : "Route lookup failed");
        } finally {
            if (requestId === previewRequestId.current) setPreviewingStrategy(null);
        }
    };

    const addManualRoute = () => {
        if (sourceId === null || destinationId === null || !selectedPreview) {
            setNotice("Preview and select a valid route before adding it to the vehicle plan.");
            return;
        }
        if (manualRoutes.some((route) => route.sourceIntersectionId === sourceId && route.destinationIntersectionId === destinationId)) {
            setNotice("That source and destination pair is already in the route list.");
            return;
        }
        if (manualRoutes.length >= 25) {
            setNotice("You can add up to 25 routes per vehicle generation batch.");
            return;
        }
        const { intersections, segments, totalDistanceMeters, estimatedTravelTimeSeconds, estimatedTravelTimeUsesDefaultSpeedLimit } = selectedPreview;
        setManualRoutes((current) => [...current, {
            sourceIntersectionId: sourceId,
            destinationIntersectionId: destinationId,
            strategy: selectedPreview.strategy,
            route: { intersections, segments, totalDistanceMeters, estimatedTravelTimeSeconds, estimatedTravelTimeUsesDefaultSpeedLimit },
        }]);
        setNotice(`Added route #${sourceId} → #${destinationId}.`);
        setSourceId(null);
        setDestinationId(null);
        invalidateRoutePreviews();
        setSelectionTarget("source");
    };

    const generate = async () => {
        if (!runId) { setNotice("Create or select a simulation first."); return; }
        if (!selectedRun || !["CREATED", "RUNNING", "PAUSED"].includes(selectedRun.status)) { setNotice("Vehicles can only be added to a created, running, or paused simulation."); return; }
        if (mode === "manual" && manualRoutes.length === 0) { setNotice("Preview and add at least one source-to-destination route first."); return; }
        setBusy(true); setNotice("");
        try {
            const submittedRouteCount = manualRoutes.length;
            const response = await fetch(`/api/simulation/runs/${runId}/vehicles`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count, ...(mode === "manual" ? { routes: manualRoutes } : {}) }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Vehicle generation failed"); setVehicleCountSnapshot((current) => ({ runId, count: (current?.runId === runId ? current.count : 0) + Number(data.count ?? 0) }));
            if (mode === "manual") setManualRoutes([]);
            setNotice(`Generated ${data.count} vehicles for simulation #${runId}.${mode === "manual" ? ` Distributed across ${submittedRouteCount} selected routes.` : ""}${selectedRun.status === "RUNNING" ? " They should now be moving on the map." : " They are visible on the map but stationary; click Start or Resume to move them."}`);
        } catch (error) { setNotice(error instanceof Error ? error.message : "Vehicle generation failed"); } finally { setBusy(false); }
    };

    const configureLight = async () => {
        if (!selectedLight || !window.confirm(`Generate a new six-phase signal plan for intersection ${selectedLight.intersectionId}? This replaces its current phases and movement configuration.`)) return;
        setBusy(true); try { const response = await fetch(`/api/traffic_lights/${selectedLight.id}/configure`, { method: "POST" }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Signal configuration failed"); const result = await fetch(`/api/traffic_lights?cityId=${cityId}`, { cache: "no-store" }).then((r) => r.json()); setLights(result.trafficLights ?? []); setNotice(`Signal plan generated with ${data.movementCount} movements.`); } catch (error) { setNotice(error instanceof Error ? error.message : "Signal configuration failed"); } finally { setBusy(false); }
    };

    const canGenerate = selectedRun && ["CREATED", "RUNNING", "PAUSED"].includes(selectedRun.status);
    const roadsCount = useMemo(() => roads.filter((road) => road.type?.toLowerCase() !== "footway").length, [roads]);

    return <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
        <header className="sticky top-0 z-[1100] border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-4 px-5 py-3 lg:px-8">
                <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-700 text-lg font-black text-white">C</div><div><div className="font-bold tracking-tight">CityOS <span className="font-medium text-slate-400">/ Control Center</span></div><div className="text-xs text-slate-500">Urban mobility simulation workspace</div></div></div>
                <div className="flex flex-wrap items-center gap-3 text-sm"><a href="/map" className="rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100">Map</a><div className="h-7 border-l border-slate-200"/><select aria-label="Selected city" value={cityId} onChange={(e) => { setCityId(Number(e.target.value)); setRunId(null); setSourceId(null); setDestinationId(null); setManualRoutes([]); invalidateRoutePreviews(); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2">{cities.map((city) => <option key={city.id} value={city.id}>{city.name}, {city.country}</option>)}</select><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${selectedRun?.status === "RUNNING" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{selectedRun?.status ?? "NO RUN"}</span><span className="text-slate-500">{selectedRun ? `Run #${selectedRun.id} · T+${selectedRun.simulationTime}s` : cityName}</span></div>
            </div>
        </header>
        <div className="mx-auto max-w-[1800px] space-y-5 p-4 lg:p-7">
            {notice && <div role="status" className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss" className="ml-4 font-bold">×</button></div>}
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(370px,.85fr)]">
                <section className={`${panel} overflow-hidden`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4"><div><h1 className="font-semibold">Live network map</h1><p className="mt-0.5 text-xs text-slate-500">{mode === "manual" ? `Click an intersection to set the ${selectionTarget}.` : `${cityName} · live traffic and infrastructure`}</p></div><div className="flex flex-wrap gap-3 text-xs text-slate-500">{Object.entries(layers).map(([key, value]) => <label className="flex items-center gap-1.5" key={key}><input type="checkbox" checked={value} onChange={(e) => setLayers((current) => ({ ...current, [key]: e.target.checked }))}/>{key[0].toUpperCase() + key.slice(1)}</label>)}<span className="mx-1 hidden border-l border-slate-200 sm:inline"/><label className="flex items-center gap-1.5"><input type="checkbox" checked={showEndpointMarkers} onChange={(event) => setShowEndpointMarkers(event.target.checked)}/>Endpoint markers</label><label className="flex items-center gap-1.5"><input type="checkbox" checked={showRouteLine} onChange={(event) => setShowRouteLine(event.target.checked)}/>Route previews</label></div></div>
                    <div className="h-[470px] lg:h-[610px]"><CityMapClient selectedCityId={cityId} setSelectedCityId={(id) => { setCityId(id); setSourceId(null); setDestinationId(null); setManualRoutes([]); invalidateRoutePreviews(); }} selectedSimulationId={runId} simulationStatus={selectedRun?.status ?? null} visibleLayers={layers} cities={cities} roads={roads} intersections={intersections} buildings={buildings} trees={trees} waterAreas={waterAreas} waterLines={waterLines} contours={contours} boundary={boundary} loading={mapLoading} error={mapError} routePreviews={showRouteLine ? [ ...(shortestPreview ? [{ strategy: "SHORTEST_DISTANCE" as const, routeGeometry: shortestPreview.routeGeometry, selected: selectedStrategy === "SHORTEST_DISTANCE" }] : []), ...(fastestPreview ? [{ strategy: "FASTEST_TIME" as const, routeGeometry: fastestPreview.routeGeometry, selected: selectedStrategy === "FASTEST_TIME" }] : []) ] : []} sourceIntersectionId={showEndpointMarkers ? sourceId : null} destinationIntersectionId={showEndpointMarkers ? destinationId : null} signalIndicators={signalIndicators} onIntersectionSelect={(id) => { if (mode === "manual") { if (selectionTarget === "source") { setSourceId(id); setSelectionTarget("destination"); } else { setDestinationId(id); } invalidateRoutePreviews(); } }}/></div>
                    <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">{showEndpointMarkers && <><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-green-600"/>Source</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-red-600"/>Destination</span></>}{showRouteLine && <><span className="font-semibold text-blue-700"><i aria-hidden="true" className="mr-1 inline-block w-5 border-t-2 border-blue-600 align-middle"/>Shortest distance</span><span className="font-semibold text-purple-700"><i aria-hidden="true" className="mr-1 inline-block w-5 border-t-2 border-dashed border-purple-600 align-middle"/>Fastest time</span><span>{selectedStrategy ? `Selected: ${selectedStrategy === "SHORTEST_DISTANCE" ? "Shortest distance" : "Fastest time"}` : "Select a route preview"}</span></>}<span className="ml-auto">{roadsCount} roads · {intersections.length} intersections</span></div>
                    {selectedRun && visibleVehicleCount === 0 && <p className="border-t border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-900">No vehicles are attached to run #{selectedRun.id} yet. Generate vehicles in the panel below, then Start or Resume the run to move them.</p>}
                </section>
                <aside className="space-y-5">
                    <section className={`${panel} p-5`}><div className="flex items-start justify-between"><div><h2 className="font-semibold">Simulation runs</h2><p className="mt-1 text-xs text-slate-500">Manage lifecycle for {cityName}</p></div><button disabled={busy} onClick={createRun} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50">+ New run</button></div>
                        <select aria-label="Simulation run" value={runId ?? ""} onChange={(e) => setRunId(e.target.value ? Number(e.target.value) : null)} className="mt-4 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="">Select a run…</option>{runs.filter((run) => run.cityId === cityId).map((run) => <option key={run.id} value={run.id}>Run #{run.id} · {run.status} · T+{run.simulationTime}s</option>)}</select>
                        <div className="mt-3 grid grid-cols-3 gap-2"><button disabled={busy || !selectedRun || !["CREATED", "PAUSED"].includes(selectedRun.status)} onClick={() => void runAction("start")} className="rounded-lg bg-emerald-600 px-2 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">{selectedRun?.status === "PAUSED" ? "Resume" : "Start"}</button><button disabled={busy || selectedRun?.status !== "RUNNING"} onClick={() => void runAction("pause")} className="rounded-lg border border-slate-200 px-2 py-2.5 text-xs font-bold disabled:cursor-not-allowed disabled:text-slate-300">Pause</button><button disabled={busy || !selectedRun || !["RUNNING", "PAUSED"].includes(selectedRun.status)} onClick={() => void runAction("stop")} className="rounded-lg border border-red-200 px-2 py-2.5 text-xs font-bold text-red-700 disabled:cursor-not-allowed disabled:text-slate-300">Stop</button></div>
                    </section>
                    <section className={`${panel} p-5`}><div className="flex items-center justify-between"><div><h2 className="font-semibold">Vehicle generation</h2><p className="mt-1 text-xs text-slate-500">Real route plans on the city road network</p></div></div><div className="mt-4 flex rounded-lg bg-slate-100 p-1"><button onClick={() => setMode("automatic")} className={`flex-1 rounded-md py-2 text-xs font-semibold ${mode === "automatic" ? "bg-white shadow-sm" : "text-slate-500"}`}>Automatic</button><button onClick={() => setMode("manual")} className={`flex-1 rounded-md py-2 text-xs font-semibold ${mode === "manual" ? "bg-white shadow-sm" : "text-slate-500"}`}>Source & destination</button></div>
                        <label className="mt-4 block text-xs font-medium text-slate-600">Vehicles <input type="number" min={1} max={1000} value={count} onChange={(e) => setCount(Math.min(1000, Math.max(1, Number(e.target.value))))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"/></label>
                        {mode === "manual" && <>
                            <div className="mt-3 flex items-center justify-between gap-2"><div className="text-xs font-medium text-slate-600">Choose which endpoint the next map click sets</div><button type="button" onClick={() => { setSourceId(null); setDestinationId(null); setSelectionTarget("source"); invalidateRoutePreviews(); }} disabled={sourceId === null && destinationId === null && !shortestPreview && !fastestPreview} className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Clear current route</button></div>
                            <div className="mt-2 grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => setSelectionTarget("source")} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${selectionTarget === "source" ? "border-green-300 bg-green-50 text-green-800" : "border-slate-200 text-slate-500"}`}>Source{sourceId ? ` / #${sourceId}` : ""}</button>
                                <button type="button" onClick={() => setSelectionTarget("destination")} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${selectionTarget === "destination" ? "border-red-300 bg-red-50 text-red-800" : "border-slate-200 text-slate-500"}`}>Destination{destinationId ? ` / #${destinationId}` : ""}</button>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2">
                                {([sourceId, destinationId] as const).map((value, index) => <label key={index} className="text-xs font-medium text-slate-600">{index === 0 ? "Source" : "Destination"}<select value={value ?? ""} onChange={(e) => { const id = e.target.value ? Number(e.target.value) : null; if (index === 0) { setSourceId(id); setSelectionTarget("destination"); } else { setDestinationId(id); setSelectionTarget("source"); } invalidateRoutePreviews(); }} className="mt-1.5 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2.5 text-xs"><option value="">Select intersection</option>{intersections.map((item) => <option key={item.id} value={item.id}>#{item.id} {item.name ?? "Intersection"}</option>)}</select></label>)}
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => void previewRoute("SHORTEST_DISTANCE")} disabled={!sourceId || !destinationId || previewingStrategy !== null || busy} className="rounded-lg border border-blue-200 px-2 py-2 text-xs font-semibold text-blue-700 disabled:opacity-40">{previewingStrategy === "SHORTEST_DISTANCE" ? "Loading..." : "Preview shortest path"}</button>
                                <button type="button" onClick={() => void previewRoute("FASTEST_TIME")} disabled={!sourceId || !destinationId || previewingStrategy !== null || busy} className="rounded-lg border border-purple-200 px-2 py-2 text-xs font-semibold text-purple-700 disabled:opacity-40">{previewingStrategy === "FASTEST_TIME" ? "Loading..." : "Preview fastest path"}</button>
                            </div>
                            {(shortestPreview || fastestPreview) && <div role="radiogroup" aria-label="Select route to use for vehicles" className="mt-3 grid gap-2">
                                {shortestPreview ? <button type="button" role="radio" aria-checked={selectedStrategy === "SHORTEST_DISTANCE"} onClick={() => setSelectedStrategy("SHORTEST_DISTANCE")} className={`rounded-lg border p-3 text-left ${selectedStrategy === "SHORTEST_DISTANCE" ? "border-blue-500 bg-blue-50 ring-1 ring-blue-300" : "border-slate-200 bg-white"}`}><div className="flex items-center justify-between gap-2"><span className="font-semibold text-blue-800">Shortest-distance route</span><span aria-hidden="true">{selectedStrategy === "SHORTEST_DISTANCE" ? "Selected" : "Select"}</span></div><div className="mt-1 text-xs text-slate-600">{(shortestPreview.totalDistanceMeters / 1000).toFixed(2)} km / {shortestPreview.estimatedTravelTimeSeconds === null ? "Travel time unavailable (invalid or missing speed limit)" : `${Math.ceil(shortestPreview.estimatedTravelTimeSeconds / 60)} min estimated${shortestPreview.estimatedTravelTimeUsesDefaultSpeedLimit ? " (30 km/h assumed where missing)" : ""}`} / {shortestPreview.segments.length} road segments</div><div className="mt-1 break-words text-[11px] text-slate-500">Intersections: {shortestPreview.intersections.join(" -> ")}</div></button> : <p className="rounded-lg border border-slate-200 p-3 text-xs text-slate-500">Shortest-distance route unavailable.</p>}
                                {fastestPreview ? <button type="button" role="radio" aria-checked={selectedStrategy === "FASTEST_TIME"} onClick={() => setSelectedStrategy("FASTEST_TIME")} className={`rounded-lg border p-3 text-left ${selectedStrategy === "FASTEST_TIME" ? "border-purple-500 bg-purple-50 ring-1 ring-purple-300" : "border-slate-200 bg-white"}`}><div className="flex items-center justify-between gap-2"><span className="font-semibold text-purple-800">Fastest-time route</span><span aria-hidden="true">{selectedStrategy === "FASTEST_TIME" ? "Selected" : "Select"}</span></div><div className="mt-1 text-xs text-slate-600">{(fastestPreview.totalDistanceMeters / 1000).toFixed(2)} km / {fastestPreview.estimatedTravelTimeSeconds === null ? "Travel time unavailable" : `${Math.ceil(fastestPreview.estimatedTravelTimeSeconds / 60)} min estimated${fastestPreview.estimatedTravelTimeUsesDefaultSpeedLimit ? " (30 km/h assumed where missing)" : ""}`} / {fastestPreview.segments.length} road segments</div><div className="mt-1 break-words text-[11px] text-slate-500">Intersections: {fastestPreview.intersections.join(" -> ")}</div></button> : <p className="rounded-lg border border-slate-200 p-3 text-xs text-slate-500">Fastest-time route unavailable.</p>}
                            </div>}
                            <button onClick={addManualRoute} disabled={!sourceId || !destinationId || !selectedPreview || manualRoutes.length >= 25 || busy || previewingStrategy !== null} className="mt-3 w-full rounded-lg bg-blue-700 py-2 text-xs font-semibold text-white disabled:opacity-40">Add selected route</button>
                            <div className="mt-3 rounded-lg bg-slate-50 p-3"><div className="flex items-center justify-between text-xs font-semibold text-slate-700"><span>Routes in this batch</span><span>{manualRoutes.length}/25</span></div>{manualRoutes.length === 0 ? <p className="mt-2 text-xs text-slate-500">Preview both route types, select one, and add it here. Vehicles will be distributed across the listed routes.</p> : <ul className="mt-2 space-y-1.5">{manualRoutes.map((route, index) => <li key={`${route.sourceIntersectionId}-${route.destinationIntersectionId}`} className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 text-xs"><span>Route {index + 1}: #{route.sourceIntersectionId} / #{route.destinationIntersectionId} / {route.strategy === "SHORTEST_DISTANCE" ? "Shortest" : "Fastest"} / {(route.route.totalDistanceMeters / 1000).toFixed(2)} km / {route.route.estimatedTravelTimeSeconds === null ? "time unavailable" : `${Math.ceil(route.route.estimatedTravelTimeSeconds / 60)} min${route.route.estimatedTravelTimeUsesDefaultSpeedLimit ? " (estimated)" : ""}`}</span><button type="button" aria-label={`Clear route ${index + 1}`} title={`Clear route ${index + 1}`} onClick={() => setManualRoutes((current) => current.filter((_, routeIndex) => routeIndex !== index))} className="rounded border border-red-200 px-2 py-1 font-semibold text-red-600 hover:bg-red-50">Clear</button></li>)}</ul>}</div>
                        </>}
                        <button disabled={busy || !canGenerate} onClick={() => void generate()} className="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">{busy ? "Working…" : "Generate vehicles"}</button></section>
                    <section className={`${panel} p-5`}><div className="flex items-start justify-between gap-2"><div><h2 className="font-semibold">Traffic signals</h2><p className="mt-1 text-xs text-slate-500">Inspect configured phases by intersection</p></div><select aria-label="Traffic light" value={lightId ?? ""} onChange={(e) => setLightId(e.target.value ? Number(e.target.value) : null)} className="max-w-[180px] rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs">{lights.length === 0 && <option value="">No signals</option>}{lights.map((light) => <option key={light.id} value={light.id}>#{light.intersectionId} {light.intersectionName ?? "Signal"}</option>)}</select></div>
                        {selectedLight ? <><div className="mt-3 flex items-center justify-between text-xs"><span className="text-slate-500">Signal #{selectedLight.id} · {selectedLight.status}</span><span className="font-semibold">Phase {selectedLight.currentPhase} · {selectedLight.phaseElapsed}/{selectedLight.cycleDuration}s</span></div><div className="mt-3 grid grid-cols-3 gap-2">{selectedLight.phases.length ? selectedLight.phases.map((phase) => <div key={phase.phaseNumber} className={`rounded-lg p-2 text-center ${phase.phaseNumber === selectedLight.currentPhase ? "bg-blue-50 ring-1 ring-blue-200" : "bg-slate-50"}`}><div className="text-[10px] uppercase text-slate-500">Phase {phase.phaseNumber}</div><div className="mt-0.5 text-xs font-bold">{phase.state}</div><div className="text-[10px] text-slate-500">{phase.durationSeconds}s</div></div>) : <p className="col-span-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">No phase configuration exists yet.</p>}</div><p className="mt-2 text-[11px] text-slate-500">{selectedLight.movements.length} movement state records · runtime state is managed by the simulation engine</p><button onClick={() => void configureLight()} disabled={busy} className="mt-3 w-full rounded-lg border border-slate-200 py-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50">Generate / replace signal plan…</button></> : <p className="mt-4 text-sm text-slate-500">No traffic lights are registered for this city.</p>}</section>
                </aside>
            </div>
            <section className={`${panel} p-5`}><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">Live monitoring</h2><p className="mt-1 text-xs text-slate-500">Metrics are sourced from the selected simulation run</p></div><span className="text-xs text-slate-500">{selectedRun?.status ?? "Select a run"} · T+{selectedRun?.simulationTime ?? 0}s</span></div>{metricsError && <p className="mb-3 text-sm text-red-600">{metricsError}</p>}<div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{[["Total vehicles", metrics?.totalVehicles], ["Active vehicles", metrics?.activeVehicles], ["Waiting at signals", metrics?.signalWaitingVehicles], ["Active queues", metrics?.activeQueues], ["Max queue", metrics?.maximumQueueVehicles], ["Mean speed", metrics ? `${metrics.averageSpeedKmh.toFixed(1)} km/h` : null]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-4"><div className="text-xs text-slate-500">{label}</div><div className="mt-2 text-2xl font-semibold tracking-tight">{value ?? (metricsLoading ? "…" : "—")}</div></div>)}</div>{!runId && <p className="mt-3 text-sm text-slate-500">Create or select a run to view metrics and events.</p>}</section>
            {runId && <div className={`${panel} px-5 py-3 text-sm text-slate-600`}>Road congestion: <strong className="text-slate-900">{congestedRoads}</strong> congested or severe segments out of {congestion.length} measured segments.</div>}
            {runId && <SimulationEvents simulationId={runId} isRunning={selectedRun?.status === "RUNNING"}/>}
            {!mapLoading && <div className="text-xs text-slate-400">Network inventory · {roadsCount} drivable roads · {intersections.length} intersections · {buildings.length} buildings · {trees.length} trees · {waterAreas.length + waterLines.length} waterways · {contours.length} contour lines</div>}
        </div>
    </main>;
}
