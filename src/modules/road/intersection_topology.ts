import { eq, or } from "drizzle-orm";

import { db } from "@/db";
import { roadSegments } from "@/db/schema";

export type IntersectionSegment = {
    segmentId: number;
    roadId: number;
    startIntersectionId: number;
    endIntersectionId: number;
    lengthMeters: number;
};

export type IntersectionTopology = {
    intersectionId: number;
    incoming: IntersectionSegment[];
    outgoing: IntersectionSegment[];
};

export async function getIntersectionSegments(
    intersectionId: number,
): Promise<IntersectionSegment[]> {
    const result = await db
        .select({
            segmentId: roadSegments.id,
            roadId: roadSegments.roadId,
            startIntersectionId:
                roadSegments.startIntersectionId,
            endIntersectionId:
                roadSegments.endIntersectionId,
            lengthMeters:
                roadSegments.lengthMeters,
        })
        .from(roadSegments)
        .where(
            or(
                eq(
                    roadSegments.startIntersectionId,
                    intersectionId,
                ),
                eq(
                    roadSegments.endIntersectionId,
                    intersectionId,
                ),
            ),
        );

    return result.map((segment) => ({
        segmentId: Number(segment.segmentId),
        roadId: Number(segment.roadId),
        startIntersectionId:
            Number(segment.startIntersectionId),
        endIntersectionId:
            Number(segment.endIntersectionId),
        lengthMeters:
            Number(segment.lengthMeters),
    }));
}

export async function getIntersectionTopology(
    intersectionId: number,
): Promise<IntersectionTopology> {
    const segments =
        await getIntersectionSegments(
            intersectionId,
        );

    const incoming = segments.filter(
        (segment) =>
            segment.endIntersectionId ===
            intersectionId,
    );

    const outgoing = segments.filter(
        (segment) =>
            segment.startIntersectionId ===
            intersectionId,
    );

    return {
        intersectionId,
        incoming,
        outgoing,
    };
}