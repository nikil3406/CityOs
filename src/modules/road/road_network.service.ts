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

export type NetworkNode = {
    intersectionId: number;
    outgoingSegments: NetworkSegment[];
};

export type IntersectionTopology = {
    intersectionId: number;
    incomingSegments: NetworkSegment[];
    outgoingSegments: NetworkSegment[];
};

async function getNetworkSegments(
    cityId: number,
    startIntersectionId?: number,
) {
    const startIntersectionFilter =
        startIntersectionId !== undefined
            ? sql`
                AND rs.start_intersection_id =
                    ${startIntersectionId}
            `
            : sql``;

    const result = await db.execute(sql`
        SELECT
            rs.id,
            rs.road_id AS "roadId",

            rs.start_intersection_id
                AS "startIntersectionId",

            rs.end_intersection_id
                AS "endIntersectionId",

            rs.sequence,

            rs.length_meters
                AS "lengthMeters",

            COALESCE(
                rs.speed_limit_kmh,
                30
            ) AS "speedLimitKmh"

        FROM road_segments rs

        JOIN roads r
            ON r.id = rs.road_id

        WHERE
            r.city_id = ${cityId}

            AND LOWER(
                COALESCE(r.type, '')
            ) <> 'footway'

            ${startIntersectionFilter}

        ORDER BY
            rs.road_id,
            rs.sequence;
    `);

    return result as unknown as NetworkSegment[];
}

export async function getVehicleRoadNetwork(
    cityId: number,
) {
    const segments =
        await getNetworkSegments(cityId);

    const nodes =
        new Map<number, NetworkNode>();

    for (const segment of segments) {
        const startId =
            Number(
                segment.startIntersectionId,
            );

        if (!nodes.has(startId)) {
            nodes.set(startId, {
                intersectionId: startId,
                outgoingSegments: [],
            });
        }

        nodes
            .get(startId)!
            .outgoingSegments
            .push(segment);
    }

    return {
        segments,
        nodes,
    };
}

export async function getIntersectionConnections(
    cityId: number,
    intersectionId: number,
) {
    return getNetworkSegments(
        cityId,
        intersectionId,
    );
}

export async function getIntersectionTopology(
    cityId: number,
    intersectionId: number,
): Promise<IntersectionTopology> {
    const segments =
        await getNetworkSegments(cityId);

    const connectedSegments =
        segments.filter(
            (segment) =>
                Number(
                    segment.startIntersectionId,
                ) === intersectionId ||
                Number(
                    segment.endIntersectionId,
                ) === intersectionId,
        );

    const incomingSegments =
        connectedSegments.filter(
            (segment) =>
                Number(
                    segment.endIntersectionId,
                ) === intersectionId,
        );

    const outgoingSegments =
        connectedSegments.filter(
            (segment) =>
                Number(
                    segment.startIntersectionId,
                ) === intersectionId,
        );

    return {
        intersectionId,
        incomingSegments,
        outgoingSegments,
    };
}