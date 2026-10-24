import {
    buildTraversalGraph,
    getVehicleRoadNetwork,
    type NetworkSegment,
} from "../road/road_network.service";

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

function findRouteOnNetwork(
    networkSegments: NetworkSegment[],
    startIntersectionId: number,
    destinationIntersectionId: number,
    strategy: RoutingStrategy,
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

    const distances = new Map<number, number>();
    const previous = new Map<
        number,
        { intersectionId: number; segmentId: number; isReverse: boolean }
    >();
    const unvisited = new Set<number>(graph.keys());

    for (const intersectionId of graph.keys()) {
        distances.set(intersectionId, Infinity);
    }
    distances.set(startIntersectionId, 0);

    while (unvisited.size > 0) {
        let current: number | null = null;
        let currentCost = Infinity;

        for (const intersectionId of unvisited) {
            const cost = distances.get(intersectionId) ?? Infinity;
            if (cost < currentCost) {
                currentCost = cost;
                current = intersectionId;
            }
        }

        if (current === null || currentCost === Infinity) break;
        if (current === destinationIntersectionId) break;
        unvisited.delete(current);

        for (const edge of graph.get(current) ?? []) {
            if (!unvisited.has(edge.to)) continue;

            const edgeLength = Number(edge.segment.lengthMeters);
            if (!Number.isFinite(edgeLength) || edgeLength < 0) continue;

            let edgeCost = edgeLength;
            if (strategy === "FASTEST_TIME") {
                const storedSpeedLimit = edge.segment.speedLimitKmh;
                const speedLimit = storedSpeedLimit !== null && Number.isFinite(storedSpeedLimit) && storedSpeedLimit > 0
                    ? storedSpeedLimit
                    : DEFAULT_ROUTE_SPEED_LIMIT_KMH;
                edgeCost = (edgeLength * 3.6) / speedLimit;
            }

            const newCost = currentCost + edgeCost;
            const oldCost = distances.get(edge.to) ?? Infinity;
            if (newCost < oldCost) {
                distances.set(edge.to, newCost);
                previous.set(edge.to, {
                    intersectionId: current,
                    segmentId: edge.segment.id,
                    isReverse: edge.isReverse,
                });
            }
        }
    }

    const routeCost = distances.get(destinationIntersectionId);
    if (routeCost === undefined || !Number.isFinite(routeCost)) return null;

    const intersections = [destinationIntersectionId];
    const segments: RouteSegment[] = [];
    let current = destinationIntersectionId;
    while (current !== startIntersectionId) {
        const previousNode = previous.get(current);
        if (!previousNode) return null;
        segments.push({
            segmentId: previousNode.segmentId,
            isReverse: previousNode.isReverse,
        });
        current = previousNode.intersectionId;
        intersections.push(current);
    }
    intersections.reverse();
    segments.reverse();

    const segmentsById = new Map(networkSegments.map((segment) => [segment.id, segment]));
    let totalDistanceMeters = 0;
    let estimatedTravelTimeSeconds = 0;
    let estimatedTravelTimeUsesDefaultSpeedLimit = false;
    for (const routeSegment of segments) {
        const segment = segmentsById.get(routeSegment.segmentId);
        if (!segment) return null;
        const length = Number(segment.lengthMeters);
        if (!Number.isFinite(length) || length < 0) return null;
        totalDistanceMeters += length;

        const storedSpeed = segment.speedLimitKmh;
        const hasValidStoredSpeed = storedSpeed !== null && Number.isFinite(storedSpeed) && storedSpeed > 0;
        const speed = hasValidStoredSpeed ? storedSpeed : DEFAULT_ROUTE_SPEED_LIMIT_KMH;
        if (!hasValidStoredSpeed) estimatedTravelTimeUsesDefaultSpeedLimit = true;
        estimatedTravelTimeSeconds += (length * 3.6) / speed;
    }

    return {
        intersections,
        segments,
        totalDistanceMeters,
        estimatedTravelTimeSeconds: Number.isFinite(estimatedTravelTimeSeconds)
            ? estimatedTravelTimeSeconds
            : null,
        estimatedTravelTimeUsesDefaultSpeedLimit,
    };
}

export async function findRoute(
    cityId: number,
    startIntersectionId: number,
    destinationIntersectionId: number,
    strategy: RoutingStrategy,
): Promise<RouteResult | null> {
    const { segments } = await getVehicleRoadNetwork(cityId);
    return findRouteOnNetwork(
        segments,
        startIntersectionId,
        destinationIntersectionId,
        strategy,
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
): Promise<RouteResult> {
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
    };
}

export type { NetworkSegment };
