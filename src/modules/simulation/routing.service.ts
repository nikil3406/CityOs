import {
    getVehicleRoadNetwork,
    type NetworkSegment,
} from "./road_network.service";

type GraphEdge = {
    segment: NetworkSegment;
    to: number;
    isReverse: boolean;
};

type Graph = Map<number, GraphEdge[]>;

export type RouteSegment = {
    segmentId: number;
    isReverse: boolean;
};

export type RouteResult = {
    intersections: number[];
    segments: RouteSegment[];
    totalDistanceMeters: number;
};

/*
 * Build an undirected graph from the physical
 * road segments.
 *
 * Each physical segment creates TWO graph edges:
 *
 *     start → end     isReverse = false
 *     end   → start   isReverse = true
 *
 * This is important because the current road
 * dataset does not contain reliable one-way data.
 */
function buildGraph(
    segments: NetworkSegment[],
): Graph {
    const graph: Graph = new Map();

    for (const segment of segments) {
        const from =
            Number(segment.startIntersectionId);

        const to =
            Number(segment.endIntersectionId);

        /*
         * --------------------------------------------
         * Forward traversal
         *
         * Geometry:
         *
         * START → END
         * --------------------------------------------
         */
        if (!graph.has(from)) {
            graph.set(from, []);
        }

        graph.get(from)!.push({
            segment,
            to,
            isReverse: false,
        });

        /*
         * --------------------------------------------
         * Reverse traversal
         *
         * Geometry:
         *
         * END → START
         * --------------------------------------------
         */
        if (!graph.has(to)) {
            graph.set(to, []);
        }

        graph.get(to)!.push({
            segment,
            to: from,
            isReverse: true,
        });
    }

    return graph;
}

/*
 * Return every intersection reachable from
 * the supplied starting intersection.
 */
export async function getReachableIntersections(
    cityId: number,
    startIntersectionId: number,
): Promise<number[]> {
    const { segments } =
        await getVehicleRoadNetwork(cityId);

    const graph =
        buildGraph(segments);

    const visited =
        new Set<number>();

    const queue: number[] = [
        startIntersectionId,
    ];

    visited.add(
        startIntersectionId,
    );

    while (queue.length > 0) {
        const current =
            queue.shift()!;

        const edges =
            graph.get(current) ?? [];

        for (const edge of edges) {
            const next =
                Number(edge.to);

            if (!visited.has(next)) {
                visited.add(next);
                queue.push(next);
            }
        }
    }

    return Array.from(visited);
}

/*
 * Find the shortest route using Dijkstra's algorithm.
 *
 * The returned route contains:
 *
 *     segmentId
 *     isReverse
 *
 * for every segment.
 */
export async function findShortestRoute(
    cityId: number,
    startIntersectionId: number,
    destinationIntersectionId: number,
): Promise<RouteResult | null> {
    /*
     * Start and destination are identical.
     */
    if (
        startIntersectionId ===
        destinationIntersectionId
    ) {
        return {
            intersections: [
                startIntersectionId,
            ],

            segments: [],

            totalDistanceMeters: 0,
        };
    }

    /*
     * Load the city's road network.
     */
    const network =
        await getVehicleRoadNetwork(cityId);

    const graph =
        buildGraph(network.segments);

    /*
     * Both intersections must exist in the graph.
     */
    if (!graph.has(startIntersectionId)) {
        return null;
    }

    if (!graph.has(destinationIntersectionId)) {
        return null;
    }

    /*
     * Distance from start to every node.
     */
    const distances =
        new Map<number, number>();

    /*
     * Stores how we reached each intersection.
     *
     * Example:
     *
     * intersection 1163 was reached from 1160
     * using segment 396 in reverse direction.
     */
    const previous =
        new Map<
            number,
            {
                intersectionId: number;
                segmentId: number;
                isReverse: boolean;
            }
        >();

    /*
     * Nodes that have not yet been processed.
     */
    const unvisited =
        new Set<number>();

    /*
     * Initialize all graph nodes.
     */
    for (
        const intersectionId of graph.keys()
    ) {
        distances.set(
            intersectionId,
            Infinity,
        );

        unvisited.add(
            intersectionId,
        );
    }

    /*
     * Starting intersection has distance 0.
     */
    distances.set(
        startIntersectionId,
        0,
    );

    /*
     * --------------------------------------------
     * Dijkstra
     * --------------------------------------------
     */
    while (unvisited.size > 0) {
        let current:
            number | null = null;

        let currentDistance =
            Infinity;

        /*
         * Find the unvisited node with the
         * smallest known distance.
         */
        for (
            const intersectionId of unvisited
        ) {
            const distance =
                distances.get(
                    intersectionId,
                ) ?? Infinity;

            if (
                distance <
                currentDistance
            ) {
                currentDistance =
                    distance;

                current =
                    intersectionId;
            }
        }

        /*
         * No reachable nodes remain.
         */
        if (current === null) {
            break;
        }

        /*
         * Destination reached.
         */
        if (
            current ===
            destinationIntersectionId
        ) {
            break;
        }

        /*
         * Mark current node as processed.
         */
        unvisited.delete(
            current,
        );

        const edges =
            graph.get(current) ?? [];

        /*
         * Relax every outgoing edge.
         */
        for (const edge of edges) {
            const neighbor =
                edge.to;

            if (
                !unvisited.has(
                    neighbor,
                )
            ) {
                continue;
            }

            const newDistance =
                currentDistance +
                Number(
                    edge.segment.lengthMeters,
                );

            const oldDistance =
                distances.get(
                    neighbor,
                ) ?? Infinity;

            /*
             * Found a shorter route.
             */
            if (
                newDistance <
                oldDistance
            ) {
                distances.set(
                    neighbor,
                    newDistance,
                );

                previous.set(
                    neighbor,
                    {
                        intersectionId:
                            current,

                        segmentId:
                            edge.segment.id,

                        isReverse:
                            edge.isReverse,
                    },
                );
            }
        }
    }

    /*
     * Get destination distance.
     */
    const destinationDistance =
        distances.get(
            destinationIntersectionId,
        );

    /*
     * Destination is unreachable.
     */
    if (
        destinationDistance ===
            undefined ||
        destinationDistance ===
            Infinity
    ) {
        return null;
    }

    /*
     * --------------------------------------------
     * Reconstruct route
     * --------------------------------------------
     */
    const intersectionPath:
        number[] = [];

    const segmentPath:
        RouteSegment[] = [];

    let current =
        destinationIntersectionId;

    intersectionPath.push(
        current,
    );

    /*
     * Walk backwards from destination
     * to starting intersection.
     */
    while (
        current !==
        startIntersectionId
    ) {
        const previousNode =
            previous.get(current);

        if (!previousNode) {
            return null;
        }

        segmentPath.push({
            segmentId:
                previousNode.segmentId,

            isReverse:
                previousNode.isReverse,
        });

        current =
            previousNode.intersectionId;

        intersectionPath.push(
            current,
        );
    }

    /*
     * We reconstructed the path backwards,
     * so reverse both arrays.
     */
    intersectionPath.reverse();

    segmentPath.reverse();

    /*
     * Return the complete route.
     */
    return {
        intersections:
            intersectionPath,

        segments:
            segmentPath,

        totalDistanceMeters:
            destinationDistance,
    };
}