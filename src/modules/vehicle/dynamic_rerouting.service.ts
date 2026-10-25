import { loadSimulationTrafficSnapshot } from "@/modules/road/simulation_traffic_snapshot.service";
import { findRouteOnNetwork, estimateRouteTravelTimeOnNetwork, type RouteSegment } from "@/modules/road/routing.service";
import { getVehicleRoadNetwork, type NetworkSegment } from "@/modules/road/road_network.service";
import { SimulationConfig } from "@/lib/constants";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { vehicleRoutes } from "@/db/schema";
import { getSimulationVehicleState, getSimulationVehicleStates } from "./vehicle_state.service";
import { getSimulationVehicleCache, loadSimulationVehicleCache, replaceCachedVehicleRouteSuffix, type CachedRoute } from "./vehicle_simulation_cache.service";
import { recordSimulationEvent } from "@/modules/simulation/simulation_event.service";
import {
    evaluateCandidate,
    getDirectedSegmentEndpoints,
    isRerouteAttemptActive,
    isEligibleVehicleState,
    candidateMatchesVehicleState,
    trafficSnapshotMatchesRun,
    validateDirectedRoute,
    sameRoute,
    buildRouteSuffixEntries,
    persistThenSyncRoute,
    withRerouteAttempt,
    type RerouteCandidate,
} from "./dynamic_rerouting_candidate";

export type DynamicRerouteCandidate = RerouteCandidate & {
    vehicleId: number;
    routeSequence: number;
    currentSegmentId: number;
    progress: number;
    isReverse: boolean;
};

const lastAttemptAt = new Map<string, number>();

/**
 * Calculate a bounded batch of route candidates. The active segment is kept
 * intact; alternatives start at its directed exit so candidates are safe at
 * any progress value without moving or teleporting the vehicle.
 */
export async function calculateDynamicRerouteCandidates(simulationRunId: number) {
    // The snapshot loader requires the city ID. Obtain it from active cached vehicle states.
    const states = getSimulationVehicleStates(simulationRunId);
    const firstState = states.values().next().value;
    if (!firstState || firstState.simulationRunId !== simulationRunId) return [];
    const cityId = firstState.cityId;
    const traffic = await loadSimulationTrafficSnapshot(simulationRunId, cityId);
    if (!traffic || !trafficSnapshotMatchesRun(traffic, simulationRunId, cityId)) return [];

    const cache = await loadSimulationVehicleCache(simulationRunId);
    const { segments: network } = await getVehicleRoadNetwork(cityId);
    const candidates: DynamicRerouteCandidate[] = [];
    let calculations = 0;
    for (const vehicle of states.values()) {
        if (calculations >= SimulationConfig.dynamicRerouting.maxCalculationsPerInterval) break;
        const key = `${simulationRunId}:${vehicle.id}`;
        const attemptedAt = lastAttemptAt.get(key);
        if (isRerouteAttemptActive(key) ||
            (attemptedAt !== undefined && traffic.simulationTime - attemptedAt < SimulationConfig.dynamicRerouting.retryCooldownSeconds)) continue;
        if (!isEligibleVehicleState(vehicle, simulationRunId)) continue;

        const activeEntry = cache.routesByVehicle.get(vehicle.id)?.get(vehicle.routeSequence);
        const currentSegment = network.find((segment) => segment.id === vehicle.currentSegmentId);
        if (!currentSegment || !activeEntry || activeEntry.segmentId !== vehicle.currentSegmentId || activeEntry.isReverse !== vehicle.isReverse) continue;
        const endpoints = getDirectedSegmentEndpoints(currentSegment, vehicle.isReverse);
        if (!endpoints || endpoints.exitIntersectionId === vehicle.destinationIntersectionId) continue;

        const suffix = cache.routesByVehicle.get(vehicle.id);
        if (!suffix) continue;
        const currentRoute: RouteSegment[] = [];
        for (let sequence = vehicle.routeSequence; ; sequence++) {
            const entry = suffix.get(sequence);
            if (!entry) break;
            if (entry.segmentId === null) break;
            currentRoute.push({ segmentId: entry.segmentId, isReverse: entry.isReverse });
        }
        if (currentRoute.length === 0) continue;

        const result = await withRerouteAttempt(key, async () => {
            calculations++;
            lastAttemptAt.set(key, traffic.simulationTime);
            const currentIntersections = [endpoints.entryIntersectionId];
            for (const traversal of currentRoute) {
                const segment = network.find((item) => item.id === traversal.segmentId);
                if (!segment) return null;
                const from = traversal.isReverse ? segment.endIntersectionId : segment.startIntersectionId;
                const to = traversal.isReverse ? segment.startIntersectionId : segment.endIntersectionId;
                if (from !== currentIntersections[currentIntersections.length - 1]) return null;
                currentIntersections.push(to);
            }
            if (currentIntersections.at(-1) !== vehicle.destinationIntersectionId) return null;

            if (currentIntersections[1] !== endpoints.exitIntersectionId) return null;
            const currentCost = estimateRouteTravelTimeOnNetwork(
                network,
                currentRoute,
                currentIntersections,
                traffic,
                vehicle.progress,
            );
            if (currentCost === null) return null;
            const activeTraversal = { segmentId: currentSegment.id, isReverse: vehicle.isReverse };
            const continuation = findRouteOnNetwork(
                network,
                endpoints.exitIntersectionId,
                vehicle.destinationIntersectionId,
                "FASTEST_TIME",
                traffic,
                activeTraversal,
            );
            if (!continuation || continuation.segments.length === 0) return null;
            const route: RouteSegment[] = [activeTraversal, ...continuation.segments];
            const routeIntersections = [endpoints.entryIntersectionId, ...continuation.intersections];
            const candidateCost = estimateRouteTravelTimeOnNetwork(
                network,
                route,
                routeIntersections,
                traffic,
                vehicle.progress,
            );
            const pricedRoute = candidateCost !== null
                ? { segments: route, intersections: routeIntersections, estimatedTravelTimeSeconds: candidateCost }
                : null;
            return evaluateCandidate(
                endpoints.entryIntersectionId,
                endpoints.exitIntersectionId,
                vehicle.destinationIntersectionId,
                currentRoute,
                currentIntersections,
                currentCost,
                pricedRoute,
                network,
                SimulationConfig.dynamicRerouting,
            );
        }).catch((error) => {
            console.error(`Simulation ${simulationRunId}: reroute candidate calculation failed for vehicle ${vehicle.id}`, error);
            return null;
        });
        if (result) candidates.push({
            vehicleId: vehicle.id,
            routeSequence: vehicle.routeSequence,
            currentSegmentId: vehicle.currentSegmentId!,
            progress: vehicle.progress,
            isReverse: vehicle.isReverse,
            ...result,
        });
    }
    return candidates;
}

/** Apply one previously calculated candidate, rechecking both live state and persisted route under row locks. */
async function applyOneDynamicReroute(
    simulationRunId: number,
    simulationTime: number,
    candidate: DynamicRerouteCandidate,
    network: NetworkSegment[],
): Promise<boolean> {
    const key = `${simulationRunId}:${candidate.vehicleId}`;
    const applied = await withRerouteAttempt(key, async () => {
        const state = getSimulationVehicleState(simulationRunId, candidate.vehicleId);
        if (!state || !isEligibleVehicleState(state, simulationRunId) ||
            state.currentSegmentId !== candidate.currentSegmentId || state.routeSequence !== candidate.routeSequence ||
            state.destinationIntersectionId !== candidate.destinationIntersectionId || state.progress !== candidate.progress ||
            state.isReverse !== candidate.isReverse) return false;

        const cache = getSimulationVehicleCache(simulationRunId);
        const cachedRoute = cache?.routesByVehicle.get(candidate.vehicleId);
        if (!cache || !cachedRoute) return false;
        const cachedSuffix: RouteSegment[] = [];
        for (let sequence = candidate.routeSequence; ; sequence++) {
            const entry = cachedRoute.get(sequence);
            if (!entry || entry.segmentId === null) break;
            cachedSuffix.push({ segmentId: entry.segmentId, isReverse: entry.isReverse });
        }
        if (cachedSuffix.length !== candidate.currentRoute.length || cachedSuffix.some((entry, index) =>
            entry.segmentId !== candidate.currentRoute[index]?.segmentId || entry.isReverse !== candidate.currentRoute[index]?.isReverse,
        )) return false;

        const networkById = new Map(network.map((segment) => [segment.id, segment]));
        const activeSegment = networkById.get(state.currentSegmentId!);
        const currentRouteIntersections = [candidate.currentIntersectionId];
        for (const traversal of candidate.currentRoute) {
            const segment = networkById.get(traversal.segmentId);
            if (!segment || !Number.isFinite(segment.lengthMeters) || segment.lengthMeters <= 0) return false;
            const from = traversal.isReverse ? segment.endIntersectionId : segment.startIntersectionId;
            const to = traversal.isReverse ? segment.startIntersectionId : segment.endIntersectionId;
            if (from !== currentRouteIntersections[currentRouteIntersections.length - 1]) return false;
            currentRouteIntersections.push(to);
        }
        const activeEndpoints = getDirectedSegmentEndpoints(activeSegment, state.isReverse);
        const activeTraversal = candidate.currentRoute[0];
        if (!activeSegment || !activeEndpoints || !activeTraversal ||
            activeTraversal.segmentId !== activeSegment.id || activeTraversal.isReverse !== state.isReverse ||
            activeEndpoints.entryIntersectionId !== candidate.currentIntersectionId ||
            activeEndpoints.exitIntersectionId !== candidate.continuationIntersectionId ||
            !candidateMatchesVehicleState(candidate, state, simulationRunId) ||
            currentRouteIntersections.at(-1) !== candidate.destinationIntersectionId ||
            !validateDirectedRoute(candidate.candidate, network, candidate.currentIntersectionId, candidate.destinationIntersectionId) ||
            candidate.candidate.segments[0]?.segmentId !== activeSegment.id ||
            candidate.candidate.segments[0]?.isReverse !== state.isReverse ||
            sameRoute(candidate.currentRoute, candidate.candidate.segments) ||
            candidate.candidate.segments.length < 2 ||
            candidate.improvementSeconds < SimulationConfig.dynamicRerouting.minimumSeconds ||
            candidate.improvementPercent < SimulationConfig.dynamicRerouting.minimumPercent) return false;

        // The current segment is never changed. Movement checks the signal for
        // the newly planned turn at the actual intersection before crossing.
        const replacementFromSequence = candidate.routeSequence + 1;
        const replacementRoute = candidate.candidate.segments.slice(1);
        if (replacementRoute.length === 0) return false;

        // Prove the cache update can be constructed before committing the database transaction.
        const replacement: CachedRoute[] = buildRouteSuffixEntries(replacementFromSequence, replacementRoute);
        const replacementSegments = replacementRoute.map((entry) => networkById.get(entry.segmentId)!)
            .map((segment) => ({ ...segment }));
        const prospectiveSequences = Array.from(cachedRoute.keys())
            .filter((sequence) => sequence < replacementFromSequence)
            .concat(replacement.map((entry) => entry.sequence))
            .sort((a, b) => a - b);
        if (prospectiveSequences.some((sequence, index) => index > 0 && sequence !== prospectiveSequences[index - 1] + 1)) return false;

        let applicationSucceeded = false;
        try {
            applicationSucceeded = await persistThenSyncRoute(
                () => db.transaction(async (tx) => {
                const rows = await tx.execute(sql`
                    SELECT v.id, v.simulation_run_id AS "simulationRunId",
                           v.current_segment_id AS "currentSegmentId", v.route_sequence AS "routeSequence",
                           v.progress, v.destination_intersection_id AS "destinationIntersectionId",
                           v.status, sr.status AS "simulationStatus", sr.city_id AS "cityId",
                           vr.is_reverse AS "isReverse"
                    FROM vehicles v
                    JOIN simulation_runs sr ON sr.id = v.simulation_run_id
                    LEFT JOIN vehicle_routes vr ON vr.vehicle_id = v.id AND vr.sequence = v.route_sequence
                    WHERE v.id = ${candidate.vehicleId}
                    FOR UPDATE OF v, sr;
                `) as unknown as Array<Record<string, unknown>>;
                const row = rows[0];
                if (!row || Number(row.simulationRunId) !== simulationRunId || Number(row.cityId) !== state.cityId || row.simulationStatus !== "RUNNING" ||
                    Number(row.currentSegmentId) !== candidate.currentSegmentId || Number(row.routeSequence) !== candidate.routeSequence ||
                    Number(row.destinationIntersectionId) !== candidate.destinationIntersectionId || Number(row.progress) !== candidate.progress ||
                    row.status === "COMPLETED" || row.status !== state.status || Boolean(row.isReverse) !== state.isReverse) return null;

                const persistedRows = await tx.select({
                    segmentId: vehicleRoutes.segmentId,
                    sequence: vehicleRoutes.sequence,
                    isReverse: vehicleRoutes.isReverse,
                }).from(vehicleRoutes)
                    .where(eq(vehicleRoutes.vehicleId, candidate.vehicleId))
                    .orderBy(asc(vehicleRoutes.sequence));
                const persistedTail = persistedRows.filter((entry) => entry.sequence >= candidate.routeSequence);
                if (persistedTail.slice(0, -1).some((entry) => entry.segmentId === null)) return null;
                const persistedSuffix = persistedTail
                    .filter((entry) => entry.segmentId !== null)
                    .map((entry) => ({ segmentId: Number(entry.segmentId), isReverse: entry.isReverse }));
                if (persistedSuffix.length !== candidate.currentRoute.length || persistedSuffix.some((entry, index) =>
                    entry.segmentId !== candidate.currentRoute[index]?.segmentId || entry.isReverse !== candidate.currentRoute[index]?.isReverse,
                )) return null;

                await tx.delete(vehicleRoutes).where(and(
                    eq(vehicleRoutes.vehicleId, candidate.vehicleId),
                    gte(vehicleRoutes.sequence, replacementFromSequence),
                ));
                await tx.insert(vehicleRoutes).values(replacementRoute.map((entry, index) => ({
                    vehicleId: candidate.vehicleId,
                    segmentId: entry.segmentId,
                    roadId: networkById.get(entry.segmentId)!.roadId,
                    sequence: replacementFromSequence + index,
                    isReverse: entry.isReverse,
                })));
                return { replacementFromSequence };
            }),
                () => {
                    const cacheUpdated = replaceCachedVehicleRouteSuffix(
                        simulationRunId,
                        candidate.vehicleId,
                        replacementFromSequence,
                        replacement,
                        replacementSegments,
                    );
                    if (!cacheUpdated) {
                        console.error(`Simulation ${simulationRunId}: cache replacement failed after committed route change for vehicle ${candidate.vehicleId}.`);
                        return false;
                    }
                    return true;
                },
                async () => {
                    try {
                        await recordSimulationEvent({
                            simulationRunId,
                            type: "DYNAMIC_REROUTE_APPLIED",
                            // The vehicle may be partway along its preserved
                            // active segment; the continuation intersection is
                            // a planned point, not the event's current location.
                            intersectionId: null,
                            simulationTime,
                            data: {
                                vehicleId: candidate.vehicleId,
                                destinationIntersectionId: candidate.destinationIntersectionId,
                                previousRoute: candidate.currentRoute,
                                replacementRoute: candidate.candidate.segments,
                                replannedFromIntersectionId: candidate.continuationIntersectionId,
                                previousEstimatedTravelTimeSeconds: candidate.currentTravelTimeSeconds,
                                replacementEstimatedTravelTimeSeconds: candidate.candidateTravelTimeSeconds,
                                improvementSeconds: candidate.improvementSeconds,
                                improvementPercent: candidate.improvementPercent,
                            },
                        });
                    } catch (error) {
                        console.error(`Simulation ${simulationRunId}: reroute event write failed after route commit for vehicle ${candidate.vehicleId}`, error);
                    }
                },
            );
        } catch (error) {
            console.error(`Simulation ${simulationRunId}: route transaction failed for vehicle ${candidate.vehicleId}`, error);
            return false;
        }
        return applicationSucceeded;
    });
    return applied === true;
}

/** Run the bounded calculation pass and apply only candidates that remain current. */
export async function applyDynamicRerouteCandidates(simulationRunId: number, simulationTime: number): Promise<number> {
    const candidates = await calculateDynamicRerouteCandidates(simulationRunId);
    if (candidates.length === 0) return 0;
    const state = getSimulationVehicleStates(simulationRunId).values().next().value;
    if (!state) return 0;
    const { segments: network } = await getVehicleRoadNetwork(state.cityId);
    let applied = 0;
    for (const candidate of candidates) {
        if (await applyOneDynamicReroute(simulationRunId, simulationTime, candidate, network)) applied++;
    }
    return applied;
}
