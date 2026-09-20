import { NextResponse } from "next/server";

import {
    getVehicleRoadNetwork,
} from "@/modules/simulation/road_network.service";

type RouteContext = {
    params: Promise<{ id: string }>;
};

export async function GET(
    _request: Request,
    context: RouteContext,
) {
    try {
        const { id } = await context.params;

        const cityId = Number(id);

        if (
            !Number.isInteger(cityId) ||
            cityId <= 0
        ) {
            return NextResponse.json(
                {
                    error: "Invalid city ID",
                },
                { status: 400 },
            );
        }

        const network =
            await getVehicleRoadNetwork(cityId);

        const nodes = Array.from(
            network.nodes.values(),
        ).map((node) => ({
            intersectionId:
                node.intersectionId,

            outgoingSegments:
                node.outgoingSegments.map(
                    (segment) => ({
                        id: segment.id,
                        roadId: segment.roadId,
                        startIntersectionId:
                            segment.startIntersectionId,
                        endIntersectionId:
                            segment.endIntersectionId,
                        sequence:
                            segment.sequence,
                        lengthMeters:
                            segment.lengthMeters,
                        speedLimitKmh:
                            segment.speedLimitKmh,
                    }),
                ),
        }));

        return NextResponse.json({
            cityId,

            segmentCount:
                network.segments.length,

            intersectionCount:
                nodes.length,

            nodes,
        });
    } catch (error) {
        console.error(
            "GET /api/cities/[id]/network error:",
            error,
        );

        return NextResponse.json(
            {
                error:
                    "Failed to build vehicle road network",
            },
            { status: 500 },
        );
    }
}