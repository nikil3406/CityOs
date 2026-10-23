import {
    buildTraversalGraph,
    getVehicleRoadNetwork,
    type NetworkSegment,
} from "../road/road_network.service";

export type RouteSegment = {
    segmentId: number;
    isReverse: boolean;
};

export type RouteResult = {
    intersections: number[];
    segments: RouteSegment[];
    totalDistanceMeters: number;
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

    // A head index avoids the repeated array shifting cost of queue.shift().
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

/** Find the shortest distance route with Dijkstra's algorithm. */
export async function findShortestRoute(
    cityId: number,
    startIntersectionId: number,
    destinationIntersectionId: number,
): Promise<RouteResult | null> {
    if (
        !Number.isInteger(startIntersectionId) ||
        !Number.isInteger(destinationIntersectionId) ||
        startIntersectionId <= 0 ||
        destinationIntersectionId <= 0
    ) {
        return null;
    }

    if (startIntersectionId === destinationIntersectionId) {
        return {
            intersections: [startIntersectionId],
            segments: [],
            totalDistanceMeters: 0,
        };
    }

    const network = await getVehicleRoadNetwork(cityId);
    const graph = buildTraversalGraph(network.segments);

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
        let currentDistance = Infinity;

        for (const intersectionId of unvisited) {
            const distance = distances.get(intersectionId) ?? Infinity;
            if (distance < currentDistance) {
                currentDistance = distance;
                current = intersectionId;
            }
        }

        if (current === null || currentDistance === Infinity) break;
        if (current === destinationIntersectionId) break;

        unvisited.delete(current);

        for (const edge of graph.get(current) ?? []) {
            const neighbor = edge.to;
            if (!unvisited.has(neighbor)) continue;

            const edgeLength = Number(edge.segment.lengthMeters);
            if (!Number.isFinite(edgeLength) || edgeLength < 0) continue;

            const newDistance = currentDistance + edgeLength;
            const oldDistance = distances.get(neighbor) ?? Infinity;

            if (newDistance < oldDistance) {
                distances.set(neighbor, newDistance);
                previous.set(neighbor, {
                    intersectionId: current,
                    segmentId: edge.segment.id,
                    isReverse: edge.isReverse,
                });
            }
        }
    }

    const destinationDistance = distances.get(destinationIntersectionId);
    if (destinationDistance === undefined || !Number.isFinite(destinationDistance)) {
        return null;
    }

    const intersections: number[] = [destinationIntersectionId];
    const routeSegments: RouteSegment[] = [];
    let current = destinationIntersectionId;

    while (current !== startIntersectionId) {
        const previousNode = previous.get(current);
        if (!previousNode) return null;

        routeSegments.push({
            segmentId: previousNode.segmentId,
            isReverse: previousNode.isReverse,
        });
        current = previousNode.intersectionId;
        intersections.push(current);
    }

    intersections.reverse();
    routeSegments.reverse();

    return {
        intersections,
        segments: routeSegments,
        totalDistanceMeters: destinationDistance,
    };
}

// Keep the type available to existing consumers importing it from this module.
export type { NetworkSegment };
