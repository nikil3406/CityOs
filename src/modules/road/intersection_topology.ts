import { eq, or } from "drizzle-orm";

import { db } from "@/db";
import { roadSegments } from "@/db/schema";
import {
    getIntersectionTopology as getCityScopedTopology,
} from "./road_network.service";

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

/**
 * Get segments connected to an intersection.
 *
 * Pass cityId when available to use the canonical city-scoped road-network
 * implementation (which applies the same footway filter as routing). The
 * optional parameter preserves compatibility with existing callers.
 */
export async function getIntersectionSegments(
    intersectionId: number,
    cityId?: number,
): Promise<IntersectionSegment[]> {
    if (cityId !== undefined) {
        const topology = await getCityScopedTopology(cityId, intersectionId);
        const unique = new Map<number, IntersectionSegment>();

        for (const segment of [
            ...topology.incomingSegments,
            ...topology.outgoingSegments,
        ]) {
            unique.set(segment.id, {
                segmentId: Number(segment.id),
                roadId: Number(segment.roadId),
                startIntersectionId: Number(segment.startIntersectionId),
                endIntersectionId: Number(segment.endIntersectionId),
                lengthMeters: Number(segment.lengthMeters),
            });
        }

        return Array.from(unique.values());
    }

    // Compatibility path for callers that do not yet supply a city ID.
    const result = await db
        .select({
            segmentId: roadSegments.id,
            roadId: roadSegments.roadId,
            startIntersectionId: roadSegments.startIntersectionId,
            endIntersectionId: roadSegments.endIntersectionId,
            lengthMeters: roadSegments.lengthMeters,
        })
        .from(roadSegments)
        .where(
            or(
                eq(roadSegments.startIntersectionId, intersectionId),
                eq(roadSegments.endIntersectionId, intersectionId),
            ),
        );

    return result.map((segment) => ({
        segmentId: Number(segment.segmentId),
        roadId: Number(segment.roadId),
        startIntersectionId: Number(segment.startIntersectionId),
        endIntersectionId: Number(segment.endIntersectionId),
        lengthMeters: Number(segment.lengthMeters),
    }));
}

export async function getIntersectionTopology(
    intersectionId: number,
    cityId?: number,
): Promise<IntersectionTopology> {
    if (cityId !== undefined) {
        const topology = await getCityScopedTopology(cityId, intersectionId);
        return {
            intersectionId,
            incoming: topology.incomingSegments.map((segment) => ({
                segmentId: Number(segment.id),
                roadId: Number(segment.roadId),
                startIntersectionId: Number(segment.startIntersectionId),
                endIntersectionId: Number(segment.endIntersectionId),
                lengthMeters: Number(segment.lengthMeters),
            })),
            outgoing: topology.outgoingSegments.map((segment) => ({
                segmentId: Number(segment.id),
                roadId: Number(segment.roadId),
                startIntersectionId: Number(segment.startIntersectionId),
                endIntersectionId: Number(segment.endIntersectionId),
                lengthMeters: Number(segment.lengthMeters),
            })),
        };
    }

    const segments = await getIntersectionSegments(intersectionId);
    return {
        intersectionId,
        incoming: segments.filter(
            (segment) => segment.endIntersectionId === intersectionId,
        ),
        outgoing: segments.filter(
            (segment) => segment.startIntersectionId === intersectionId,
        ),
    };
}
