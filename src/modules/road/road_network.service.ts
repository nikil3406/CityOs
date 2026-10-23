import { sql } from "drizzle-orm";

import { db } from "@/db";

export type NetworkSegment = {
    id: number;
    roadId: number;
    startIntersectionId: number;
    endIntersectionId: number;
    sequence: number;
    lengthMeters: number;
    speedLimitKmh: number;
};

/** A directed traversal over a physical road segment. */
export type NetworkTraversal = {
    segment: NetworkSegment;
    from: number;
    to: number;
    isReverse: boolean;
};

export type NetworkNode = {
    intersectionId: number;
    /** Physical segments whose stored geometry starts at this intersection. */
    outgoingSegments: NetworkSegment[];
    /** All currently permitted-by-model traversals; both directions until one-way data exists. */
    traversals: NetworkTraversal[];
};

export type IntersectionTopology = {
    intersectionId: number;
    incomingSegments: NetworkSegment[];
    outgoingSegments: NetworkSegment[];
};

async function getNetworkSegments(
    cityId: number,
    startIntersectionId?: number,
): Promise<NetworkSegment[]> {
    const startIntersectionFilter =
        startIntersectionId !== undefined
            ? sql`AND rs.start_intersection_id = ${startIntersectionId}`
            : sql``;

    const result = await db.execute(sql`
        SELECT
            rs.id,
            rs.road_id AS "roadId",
            rs.start_intersection_id AS "startIntersectionId",
            rs.end_intersection_id AS "endIntersectionId",
            rs.sequence,
            rs.length_meters AS "lengthMeters",
            COALESCE(rs.speed_limit_kmh, 30) AS "speedLimitKmh"
        FROM road_segments rs
        JOIN roads r ON r.id = rs.road_id
        WHERE
            r.city_id = ${cityId}
            AND LOWER(COALESCE(r.type, '')) <> 'footway'
            ${startIntersectionFilter}
        ORDER BY rs.road_id, rs.sequence;
    `);

    const rows = result as unknown as Array<Record<string, unknown>>;

    return rows.map((row) => ({
        id: Number(row.id),
        roadId: Number(row.roadId),
        startIntersectionId: Number(row.startIntersectionId),
        endIntersectionId: Number(row.endIntersectionId),
        sequence: Number(row.sequence),
        lengthMeters: Number(row.lengthMeters),
        speedLimitKmh: Number(row.speedLimitKmh),
    }));
}

/**
 * Build the shared directed traversal graph used by routing and network consumers.
 * The source dataset currently has no reliable one-way information, so each physical
 * segment is represented in both directions. `isReverse` identifies geometry reversal.
 */
export function buildTraversalGraph(
    segments: NetworkSegment[],
): Map<number, NetworkTraversal[]> {
    const graph = new Map<number, NetworkTraversal[]>();

    const addTraversal = (traversal: NetworkTraversal) => {
        const edges = graph.get(traversal.from) ?? [];
        edges.push(traversal);
        graph.set(traversal.from, edges);
    };

    for (const segment of segments) {
        const start = Number(segment.startIntersectionId);
        const end = Number(segment.endIntersectionId);

        addTraversal({
            segment,
            from: start,
            to: end,
            isReverse: false,
        });

        addTraversal({
            segment,
            from: end,
            to: start,
            isReverse: true,
        });

        // Ensure isolated/self-loop endpoints are represented in the graph.
        if (!graph.has(start)) graph.set(start, []);
        if (!graph.has(end)) graph.set(end, []);
    }

    return graph;
}

export async function getVehicleRoadNetwork(cityId: number) {
    const segments = await getNetworkSegments(cityId);
    const traversalsByIntersection = buildTraversalGraph(segments);
    const nodes = new Map<number, NetworkNode>();

    const ensureNode = (intersectionId: number) => {
        if (!nodes.has(intersectionId)) {
            nodes.set(intersectionId, {
                intersectionId,
                outgoingSegments: [],
                traversals: [],
            });
        }
        return nodes.get(intersectionId)!;
    };

    for (const segment of segments) {
        const startId = Number(segment.startIntersectionId);
        ensureNode(startId).outgoingSegments.push(segment);
        ensureNode(Number(segment.endIntersectionId));
    }

    for (const [intersectionId, traversals] of traversalsByIntersection) {
        ensureNode(intersectionId).traversals = traversals;
    }

    return {
        segments,
        nodes,
        traversalsByIntersection,
    };
}

export async function getIntersectionConnections(
    cityId: number,
    intersectionId: number,
) {
    return getNetworkSegments(cityId, intersectionId);
}

export async function getIntersectionTopology(
    cityId: number,
    intersectionId: number,
): Promise<IntersectionTopology> {
    const segments = await getNetworkSegments(cityId);
    const connectedSegments = segments.filter(
        (segment) =>
            segment.startIntersectionId === intersectionId ||
            segment.endIntersectionId === intersectionId,
    );

    return {
        intersectionId,
        incomingSegments: connectedSegments.filter(
            (segment) => segment.endIntersectionId === intersectionId,
        ),
        outgoingSegments: connectedSegments.filter(
            (segment) => segment.startIntersectionId === intersectionId,
        ),
    };
}
