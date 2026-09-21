import { NextResponse } from "next/server";

import {
    classifyIntersectionMovements,
} from "@/modules/road/road_geometry.service";

import {
    getIntersectionTopology,
} from "@/modules/road/road_network.service";

export async function GET() {
    try {
        const cityId = 1;
        const intersectionId = 1096;

        const topology =
            await getIntersectionTopology(
                cityId,
                intersectionId,
            );

        const movements =
            await classifyIntersectionMovements(
                topology.incomingSegments.map(
                    (segment) => ({
                        id: segment.id,
                        roadId: segment.roadId,
                    }),
                ),

                topology.outgoingSegments.map(
                    (segment) => ({
                        id: segment.id,
                        roadId: segment.roadId,
                    }),
                ),
            );

        return NextResponse.json({
            intersectionId,

            incomingSegments:
                topology.incomingSegments.map(
                    (segment) => ({
                        segmentId: segment.id,
                        roadId: segment.roadId,
                        startIntersectionId:
                            segment.startIntersectionId,
                        endIntersectionId:
                            segment.endIntersectionId,
                        lengthMeters:
                            segment.lengthMeters,
                    }),
                ),

            outgoingSegments:
                topology.outgoingSegments.map(
                    (segment) => ({
                        segmentId: segment.id,
                        roadId: segment.roadId,
                        startIntersectionId:
                            segment.startIntersectionId,
                        endIntersectionId:
                            segment.endIntersectionId,
                        lengthMeters:
                            segment.lengthMeters,
                    }),
                ),

            movements,
        });
    } catch (error) {
        console.error(
            "Geometry test failed:",
            error,
        );

        return NextResponse.json(
            {
                error:
                    "Failed to classify intersection geometry",
            },
            {
                status: 500,
            },
        );
    }
}