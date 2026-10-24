import {
    buildTraversalGraph,
    getVehicleRoadNetwork,
    type NetworkSegment,
} from "../road/road_network.service";
import {
    buildSegmentTrafficStats,
    loadSimulationTrafficSnapshot,
    simulationStatusUsesLiveTraffic,
    type SimulationTrafficSnapshot,
    type SegmentTrafficStats,
} from "./simulation_traffic_snapshot.service";

export type RoutingStrategy = "SHORTEST_DISTANCE" | "FASTEST_TIME";
/** Matches vehicle movement's speed fallback for roads without stored limits. */
export const DEFAULT_ROUTE_SPEED_LIMIT_KMH = 30;

export type RouteSegment = {
    segmentId: number;
    isReverse: boolean;
};

export type RouteResult = {
    intersections: number[];
    segments: RouteSegment[];
    totalDistanceMeters: number;
    estimatedTravelTimeSeconds: number | null;
    estimatedTravelTimeUsesDefaultSpeedLimit: boolean;
    trafficEstimate?: {
        source: "STATIC" | "LIVE_OBSERVED" | "LIVE_HEURISTIC" | "LIVE_SIGNAL" | "LIVE_MIXED";
        simulationRunId: number | null;
        simulationTime: number | null;
        simulationStatus?: string | null;
        observedSpeedSegments: number;
        heuristicSegments: number;
        signalDelaySeconds: number;
    };
};

/** Return every intersection reachable from the supplied starting intersection. */
export async function getReachableIntersections(
    cityId: number,
    startIntersectionId: number,
): Promise<number[]> {
    const { segments } = await getVehicleRoadNetwork(cityId);
    const graph = buildTraversalGraph(segments);

    if (!graph.has(startIntersectionId)) return [];

    const visited = new Set<number>([startIntersectionId]);
    const queue: number[] = [startIntersectionId];
    let head = 0;

    while (head < queue.length) {
        const current = queue[head++];
        for (const edge of graph.get(current) ?? []) {
            if (!visited.has(edge.to)) {
                visited.add(edge.to);
                queue.push(edge.to);
            }
        }
    }

    return Array.from(visited);
}

function emptyRoute(intersectionId: number): RouteResult {
    return {
        intersections: [intersectionId],
        segments: [],
        totalDistanceMeters: 0,
        estimatedTravelTimeSeconds: 0,
        estimatedTravelTimeUsesDefaultSpeedLimit: false,
    };
}

function routeSegmentTravelTime(
    segment: NetworkSegment,
    isReverse: boolean,
    snapshot?: SimulationTrafficSnapshot,
    trafficStats?: Map<string, SegmentTrafficStats>,
): { seconds: number; method: "STATIC" | "LIVE_OBSERVED" | "LIVE_HEURISTIC"; stats?: SegmentTrafficStats } {
    const length = Number(segment.lengthMeters);
    const storedSpeed = segment.speedLimitKmh;
    const hasValidSpeed = storedSpeed !== null && Number.isFinite(storedSpeed) && storedSpeed > 0;
    const speedLimit = hasValidSpeed ? storedSpeed : DEFAULT_ROUTE_SPEED_LIMIT_KMH;
    const freeFlowSeconds = (length * 3.6) / speedLimit;
    if (!snapshot) return { seconds: freeFlowSeconds, method: "STATIC" };

    const stats = trafficStats?.get(`${segment.id}:${isReverse}`) ?? {
        vehicleCount: 0,
        averageSpeedKmh: 0,
        queueVehicleCount: 0,
        queueLengthMeters: 0,
        signalWaitingVehicleCount: 0,
    };
    // Three direction-matched observations are the minimum for using measured speeds.
    if (stats.vehicleCount >= 3) {
        const observedSpeed = Math.max(1, Math.min(speedLimit, stats.averageSpeedKmh));
        return {
            seconds: (length * 3.6) / observedSpeed,
            method: "LIVE_OBSERVED",
            stats,
        };
    }

    if (stats.vehicleCount > 0) {
        // Sparse samples use an explicit one-lane occupancy heuristic (7.5 m per vehicle).
        // A detected stopped queue uses its measured physical extent instead, avoiding
        // counting the same queued vehicles twice.
        const occupancyRatio = Math.min(1, (stats.vehicleCount * 7.5) / Math.max(length, 1));
        const multiplier = stats.queueVehicleCount > 0
            ? 1 + Math.min(1, stats.queueLengthMeters / Math.max(length, 1))
            : 1 + 0.5 * occupancyRatio;
        return {
            seconds: freeFlowSeconds * multiplier,
            method: "LIVE_HEURISTIC",
            stats,
        };
    }

    return { seconds: freeFlowSeconds, method: "STATIC", ...(snapshot ? { stats } : {}) };
}

function signalDelaySeconds(
    snapshot: SimulationTrafficSnapshot,
    intersectionId: number,
    fromRoadId: number,
    toRoadId: number,
): number | null {
    const light = snapshot.signals.find(
        (candidate) => candidate.intersectionId === intersectionId && candidate.status === "ACTIVE",
    );
    if (!light || light.phases.length === 0) return null;

    const movementState = (phaseNumber: number) => light.movements.find(
        (movement) => movement.phaseNumber === phaseNumber &&
            movement.fromRoadId === fromRoadId && movement.toRoadId === toRoadId,
    )?.state;
    if (!light.movements.some((movement) =>
        movement.fromRoadId === fromRoadId && movement.toRoadId === toRoadId,
    )) return null;

    const currentIndex = light.phases.findIndex((phase) => phase.phaseNumber === light.currentPhase);
    if (currentIndex < 0) return null;
    const currentState = movementState(light.currentPhase);
    if (currentState === "GREEN" || currentState === "YELLOW") return 0;

    const currentPhase = light.phases[currentIndex];
    let delay = Math.max(0, currentPhase.durationSeconds - light.phaseElapsed);
    for (let offset = 1; offset <= light.phases.length; offset++) {
        const phase = light.phases[(currentIndex + offset) % light.phases.length];
        const state = movementState(phase.phaseNumber);
        if (state === "GREEN" || state === "YELLOW") return delay;
        delay += Math.max(0, phase.durationSeconds);
    }
    return null;
}

export function findRouteOnNetwork(
    networkSegments: NetworkSegment[],
    startIntersectionId: number,
    destinationIntersectionId: number,
    strategy: RoutingStrategy,
    trafficSnapshot?: SimulationTrafficSnapshot,
): RouteResult | null {
    if (
        !Number.isInteger(startIntersectionId) ||
        !Number.isInteger(destinationIntersectionId) ||
        startIntersectionId <= 0 ||
        destinationIntersectionId <= 0
    ) {
        return null;
    }

    if (startIntersectionId === destinationIntersectionId) {
        return emptyRoute(startIntersectionId);
    }

    const graph = buildTraversalGraph(networkSegments);
    if (
        !graph.has(startIntersectionId) ||
        !graph.has(destinationIntersectionId)
    ) {
        return null;
    }

    const useTraversalStates = strategy === "FASTEST_TIME" && trafficSnapshot !== undefined;
    type SearchState = { key: string; intersectionId: number; incomingSegment: RouteSegment | null };
    const states = new Map<string, SearchState>();
    const startKey = useTraversalStates ? `start:${startIntersectionId}` : `node:${startIntersectionId}`;
    const distances = new Map<string, number>();
    const previous = new Map<string, { stateKey: string; segment: RouteSegment }>();
    const unvisited = new Set<string>();
    const segmentsById = new Map(networkSegments.map((segment) => [segment.id, segment]));
    const trafficStats = trafficSnapshot
        ? buildSegmentTrafficStats(trafficSnapshot, networkSegments)
        : undefined;
    const observedCostSegments = new Set<string>();
    const heuristicCostSegments = new Set<string>();
    let signalCostInfluencedRouteSearch = false;
    for (const intersectionId of graph.keys()) {
        if (useTraversalStates && intersectionId !== startIntersectionId) continue;
        const key = useTraversalStates ? startKey : `node:${intersectionId}`;
        states.set(key, { key, intersectionId, incomingSegment: null });
        distances.set(key, intersectionId === startIntersectionId ? 0 : Infinity);
        unvisited.add(key);
    }

    while (unvisited.size > 0) {
        let current: string | null = null;
        let currentCost = Infinity;

        for (const stateKey of unvisited) {
            const cost = distances.get(stateKey) ?? Infinity;
            if (cost < currentCost) {
                currentCost = cost;
                current = stateKey;
            }
        }

        if (current === null || currentCost === Infinity) break;
        const currentState = states.get(current)!;
        if (currentState.intersectionId === destinationIntersectionId) break;
        unvisited.delete(current);

        for (const edge of graph.get(currentState.intersectionId) ?? []) {

            const edgeLength = Number(edge.segment.lengthMeters);
            if (!Number.isFinite(edgeLength) || edgeLength < 0) continue;

            let edgeCost = edgeLength;
            if (strategy === "FASTEST_TIME") {
                const estimate = routeSegmentTravelTime(edge.segment, edge.isReverse, trafficSnapshot, trafficStats);
                edgeCost = estimate.seconds;
                const traversalKey = `${edge.segment.id}:${edge.isReverse}`;
                if (estimate.method === "LIVE_OBSERVED") observedCostSegments.add(traversalKey);
                if (estimate.method === "LIVE_HEURISTIC") heuristicCostSegments.add(traversalKey);
                if (trafficSnapshot && currentState.incomingSegment) {
                    const incoming = segmentsById.get(currentState.incomingSegment.segmentId);
                    // Measured approach speeds and detected queues already represent
                    // intersection delay, so don't add a second signal penalty.
                    const delayAlreadyObserved = incoming && (() => {
                        const stats = trafficStats?.get(
                            `${incoming.id}:${currentState.incomingSegment!.isReverse}`,
                        );
                        return (stats?.vehicleCount ?? 0) >= 3 ||
                            (stats?.queueVehicleCount ?? 0) > 0 ||
                            (stats?.signalWaitingVehicleCount ?? 0) > 0;
                    })();
                    if (incoming && !delayAlreadyObserved) {
                        const signalDelay = signalDelaySeconds(
                            trafficSnapshot,
                            currentState.intersectionId,
                            incoming.roadId,
                            edge.segment.roadId,
                        );
                        if (signalDelay !== null && signalDelay > 0) signalCostInfluencedRouteSearch = true;
                        edgeCost += signalDelay ?? 0;
                    }
                }
            }

            const newCost = currentCost + edgeCost;
            const nextKey = useTraversalStates
                ? `edge:${edge.segment.id}:${edge.isReverse ? 1 : 0}`
                : `node:${edge.to}`;
            if (!states.has(nextKey)) {
                states.set(nextKey, {
                    key: nextKey,
                    intersectionId: edge.to,
                    incomingSegment: { segmentId: edge.segment.id, isReverse: edge.isReverse },
                });
                distances.set(nextKey, Infinity);
                unvisited.add(nextKey);
            }
            if (!unvisited.has(nextKey)) continue;
            const oldCost = distances.get(nextKey) ?? Infinity;
            if (newCost < oldCost) {
                distances.set(nextKey, newCost);
                previous.set(nextKey, {
                    stateKey: current,
                    segment: { segmentId: edge.segment.id, isReverse: edge.isReverse },
                });
            }
        }
    }

    const goalStateKey = Array.from(states.values())
        .filter((state) => state.intersectionId === destinationIntersectionId)
        .sort((a, b) => (distances.get(a.key) ?? Infinity) - (distances.get(b.key) ?? Infinity))[0]?.key;
    const routeCost = goalStateKey ? distances.get(goalStateKey) : undefined;
    if (!goalStateKey || routeCost === undefined || !Number.isFinite(routeCost)) return null;

    const segments: RouteSegment[] = [];
    let cursor: string | undefined = goalStateKey;
    while (cursor && cursor !== startKey) {
        const previousNode = previous.get(cursor);
        if (!previousNode) return null;
        segments.push(previousNode.segment);
        cursor = previousNode.stateKey;
    }
    segments.reverse();
    const intersections = [startIntersectionId];
    for (const routeSegment of segments) {
        const segment = segmentsById.get(routeSegment.segmentId);
        if (!segment) return null;
        intersections.push(routeSegment.isReverse ? segment.startIntersectionId : segment.endIntersectionId);
    }

    let totalDistanceMeters = 0;
    let estimatedTravelTimeSeconds = 0;
    let estimatedTravelTimeUsesDefaultSpeedLimit = false;
    let observedSpeedSegments = 0;
    let heuristicSegments = 0;
    let signalDelayTotal = 0;
    for (let routeIndex = 0; routeIndex < segments.length; routeIndex++) {
        const routeSegment = segments[routeIndex];
        const segment = segmentsById.get(routeSegment.segmentId);
        if (!segment) return null;
        const length = Number(segment.lengthMeters);
        if (!Number.isFinite(length) || length < 0) return null;
        totalDistanceMeters += length;

        const storedSpeed = segment.speedLimitKmh;
        const hasValidStoredSpeed = storedSpeed !== null && Number.isFinite(storedSpeed) && storedSpeed > 0;
        if (!hasValidStoredSpeed) estimatedTravelTimeUsesDefaultSpeedLimit = true;
        const estimate = routeSegmentTravelTime(segment, routeSegment.isReverse, trafficSnapshot, trafficStats);
        estimatedTravelTimeSeconds += estimate.seconds;
        if (
            trafficSnapshot &&
            estimate.stats &&
            estimate.method !== "LIVE_OBSERVED" &&
            estimate.stats.queueVehicleCount === 0 &&
            estimate.stats.signalWaitingVehicleCount === 0
        ) {
            // Occupancy-only penalties do not represent waiting at the next signal.
            const nextSegment = segments[routeIndex + 1];
            if (nextSegment) {
                const next = segmentsById.get(nextSegment.segmentId);
                const currentIntersection = intersections[routeIndex + 1];
                if (next) {
                    signalDelayTotal += signalDelaySeconds(
                        trafficSnapshot,
                        currentIntersection,
                        segment.roadId,
                        next.roadId,
                    ) ?? 0;
                }
            }
        }
    }
    estimatedTravelTimeSeconds += signalDelayTotal;

    observedSpeedSegments = observedCostSegments.size;
    heuristicSegments = heuristicCostSegments.size;
    const usedSignalData = signalCostInfluencedRouteSearch || signalDelayTotal > 0;
    const liveSource = observedSpeedSegments > 0 && (heuristicSegments > 0 || usedSignalData)
        ? "LIVE_MIXED"
        : observedSpeedSegments > 0
          ? "LIVE_OBSERVED"
          : heuristicSegments > 0 && usedSignalData
            ? "LIVE_MIXED"
            : heuristicSegments > 0
            ? "LIVE_HEURISTIC"
            : usedSignalData
              ? "LIVE_SIGNAL"
              : "STATIC";

    return {
        intersections,
        segments,
        totalDistanceMeters,
        estimatedTravelTimeSeconds: Number.isFinite(estimatedTravelTimeSeconds)
            ? estimatedTravelTimeSeconds
            : null,
        estimatedTravelTimeUsesDefaultSpeedLimit,
        ...(strategy === "FASTEST_TIME" ? {
            trafficEstimate: {
                source: liveSource as "STATIC" | "LIVE_OBSERVED" | "LIVE_HEURISTIC" | "LIVE_SIGNAL" | "LIVE_MIXED",
                simulationRunId: trafficSnapshot?.simulationRunId ?? null,
                simulationTime: trafficSnapshot?.simulationTime ?? null,
                observedSpeedSegments,
                heuristicSegments,
                signalDelaySeconds: signalDelayTotal,
            },
        } : {}),
    };
}

export async function findRoute(
    cityId: number,
    startIntersectionId: number,
    destinationIntersectionId: number,
    strategy: RoutingStrategy,
    trafficSnapshot?: SimulationTrafficSnapshot,
): Promise<RouteResult | null> {
    const { segments } = await getVehicleRoadNetwork(cityId);
    return findRouteOnNetwork(
        segments,
        startIntersectionId,
        destinationIntersectionId,
        strategy,
        trafficSnapshot,
    );
}

/** Find the shortest-distance route. Existing shortest-path behavior is preserved. */
export function findShortestRoute(
    cityId: number,
    startIntersectionId: number,
    destinationIntersectionId: number,
): Promise<RouteResult | null> {
    return findRoute(
        cityId,
        startIntersectionId,
        destinationIntersectionId,
        "SHORTEST_DISTANCE",
    );
}

/** Find the route with the lowest estimated driving time. */
export function findFastestRoute(
    cityId: number,
    startIntersectionId: number,
    destinationIntersectionId: number,
): Promise<RouteResult | null> {
    return findRoute(
        cityId,
        startIntersectionId,
        destinationIntersectionId,
        "FASTEST_TIME",
    );
}

/** Validate a preview selection against this city's live directed segment graph. */
export async function validateSelectedRoute(
    cityId: number,
    startIntersectionId: number,
    destinationIntersectionId: number,
    selectedRoute: RouteResult,
    strategy: RoutingStrategy,
    trafficSnapshot?: SimulationTrafficSnapshot,
): Promise<RouteResult> {
    let selectedTrafficSnapshot = trafficSnapshot;
    const trafficEstimate = selectedRoute && typeof selectedRoute === "object" &&
        selectedRoute.trafficEstimate && typeof selectedRoute.trafficEstimate === "object"
        ? selectedRoute.trafficEstimate
        : undefined;
    if (typeof trafficEstimate?.source === "string" && trafficEstimate.source.startsWith("LIVE_")) {
        const selectedRunId = trafficEstimate.simulationRunId;
        if (!Number.isInteger(selectedRunId) || selectedRunId === null) {
            throw new Error("Live traffic preview has no simulation ID. Preview the route again.");
        }
        selectedTrafficSnapshot ??= await loadSimulationTrafficSnapshot(selectedRunId, cityId) ?? undefined;
        if (
            !selectedTrafficSnapshot ||
            selectedTrafficSnapshot.simulationRunId !== selectedRunId ||
            !simulationStatusUsesLiveTraffic(selectedTrafficSnapshot.status)
        ) {
            throw new Error("The simulation traffic preview is no longer current. Refresh the route preview.");
        }
    }
    const { segments: networkSegments } = await getVehicleRoadNetwork(cityId);
    const segmentsById = new Map(networkSegments.map((segment) => [segment.id, segment]));
    const fail = (): never => {
        throw new Error("Selected route is invalid or no longer matches the city road network. Preview it again.");
    };

    if (
        !selectedRoute ||
        !Array.isArray(selectedRoute.intersections) ||
        !Array.isArray(selectedRoute.segments) ||
        selectedRoute.intersections.length !== selectedRoute.segments.length + 1 ||
        selectedRoute.intersections[0] !== startIntersectionId ||
        selectedRoute.intersections.at(-1) !== destinationIntersectionId ||
        selectedRoute.segments.length === 0
    ) {
        return fail();
    }

    let totalDistanceMeters = 0;
    let estimatedTravelTimeSeconds = 0;
    let estimatedTravelTimeUsesDefaultSpeedLimit = false;
    for (let index = 0; index < selectedRoute.segments.length; index++) {
        const routeSegment = selectedRoute.segments[index];
        if (
            !routeSegment ||
            !Number.isInteger(routeSegment.segmentId) ||
            typeof routeSegment.isReverse !== "boolean"
        ) {
            return fail();
        }
        const segment = segmentsById.get(routeSegment.segmentId);
        if (!segment) return fail();

        const from = routeSegment.isReverse
            ? segment.endIntersectionId
            : segment.startIntersectionId;
        const to = routeSegment.isReverse
            ? segment.startIntersectionId
            : segment.endIntersectionId;
        if (
            from !== selectedRoute.intersections[index] ||
            to !== selectedRoute.intersections[index + 1]
        ) {
            return fail();
        }

        const length = Number(segment.lengthMeters);
        if (!Number.isFinite(length) || length < 0) return fail();
        totalDistanceMeters += length;

        const storedSpeed = segment.speedLimitKmh;
        const hasValidStoredSpeed = storedSpeed !== null && Number.isFinite(storedSpeed) && storedSpeed > 0;
        const speed = hasValidStoredSpeed ? storedSpeed : DEFAULT_ROUTE_SPEED_LIMIT_KMH;
        if (!hasValidStoredSpeed) estimatedTravelTimeUsesDefaultSpeedLimit = true;
        estimatedTravelTimeSeconds += (length * 3.6) / speed;
    }

    const currentStrategyRoute = findRouteOnNetwork(
        networkSegments,
        startIntersectionId,
        destinationIntersectionId,
        strategy,
        selectedTrafficSnapshot,
    );
    if (
        !currentStrategyRoute ||
        currentStrategyRoute.segments.length !== selectedRoute.segments.length ||
        currentStrategyRoute.segments.some((segment, index) =>
            segment.segmentId !== selectedRoute.segments[index]?.segmentId ||
            segment.isReverse !== selectedRoute.segments[index]?.isReverse
        )
    ) {
        throw new Error("Selected route is stale or does not match its routing strategy. Preview it again.");
    }

    return {
        intersections: [...selectedRoute.intersections],
        segments: selectedRoute.segments.map((segment) => ({ ...segment })),
        totalDistanceMeters,
        estimatedTravelTimeSeconds: Number.isFinite(estimatedTravelTimeSeconds)
            ? estimatedTravelTimeSeconds
            : null,
        estimatedTravelTimeUsesDefaultSpeedLimit,
        ...(selectedRoute.trafficEstimate ? { trafficEstimate: { ...selectedRoute.trafficEstimate } } : {}),
    };
}

export type { NetworkSegment };
