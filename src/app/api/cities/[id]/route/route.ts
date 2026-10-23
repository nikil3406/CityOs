import { NextResponse } from "next/server";

import {
    findShortestRoute,
} from "@/modules/road/routing.service";
import { db } from "@/db";
import { sql } from "drizzle-orm";

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

        const routeGeometry: [number, number][] = [];
        for (const segment of route.segments) {
            const rows = await db.execute(sql`
                SELECT ST_AsGeoJSON(geometry)::json AS geometry
                FROM road_segments WHERE id = ${segment.segmentId} LIMIT 1;
            `);
            const row = rows[0] as { geometry?: { coordinates?: [number, number][] } | string } | undefined;
            let coordinates = row?.geometry;
            if (typeof coordinates === "string") {
                try { coordinates = JSON.parse(coordinates) as { coordinates?: [number, number][] }; }
                catch { coordinates = undefined; }
            }
            const points = coordinates && typeof coordinates === "object" && "coordinates" in coordinates ? coordinates.coordinates : undefined;
            if (!points) continue;
            const ordered = segment.isReverse ? [...points].reverse() : points;
            routeGeometry.push(...(routeGeometry.length ? ordered.slice(1) : ordered));
        }

        return NextResponse.json({
            cityId,
            startIntersectionId: start,
            destinationIntersectionId:
                destination,
            routeGeometry,
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
