import { NextResponse } from "next/server";

import {
    findShortestRoute,
} from "@/modules/simulation/routing.service";

type RouteContext = {
    params: Promise<{ id: string }>;
};

export async function GET(
    request: Request,
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

        const url = new URL(request.url);

        const start =
            Number(
                url.searchParams.get(
                    "start",
                ),
            );

        const destination =
            Number(
                url.searchParams.get(
                    "destination",
                ),
            );

        if (
            !Number.isInteger(start) ||
            !Number.isInteger(destination) ||
            start <= 0 ||
            destination <= 0
        ) {
            return NextResponse.json(
                {
                    error:
                        "start and destination must be positive integers",
                },
                { status: 400 },
            );
        }

        const route =
            await findShortestRoute(
                cityId,
                start,
                destination,
            );

        if (!route) {
            return NextResponse.json(
                {
                    error:
                        "No route found",
                },
                { status: 404 },
            );
        }

        return NextResponse.json({
            cityId,
            startIntersectionId: start,
            destinationIntersectionId:
                destination,
            ...route,
        });
    } catch (error) {
        console.error(
            "GET /api/cities/[id]/route error:",
            error,
        );

        return NextResponse.json(
            {
                error:
                    "Failed to calculate route",
            },
            { status: 500 },
        );
    }
}