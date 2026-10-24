import { NextResponse } from "next/server";

import {
    findRoute,
    type RoutingStrategy,
} from "@/modules/road/routing.service";
import { db } from "@/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { intersections } from "@/db/schema";
import {
    loadSimulationTrafficSnapshot,
    simulationStatusUsesLiveTraffic,
} from "@/modules/road/simulation_traffic_snapshot.service";

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

        const requestedStrategy = url.searchParams.get("strategy") ?? "SHORTEST_DISTANCE";
        if (
            requestedStrategy !== "SHORTEST_DISTANCE" &&
            requestedStrategy !== "FASTEST_TIME"
        ) {
            return NextResponse.json(
                { error: "strategy must be SHORTEST_DISTANCE or FASTEST_TIME" },
                { status: 400 },
            );
        }
        const strategy = requestedStrategy as RoutingStrategy;
        const requestedSimulationId = url.searchParams.has("simulationId")
            ? Number(url.searchParams.get("simulationId"))
            : null;
        if (requestedSimulationId !== null && (!Number.isInteger(requestedSimulationId) || requestedSimulationId <= 0)) {
            return NextResponse.json({ error: "simulationId must be a positive integer" }, { status: 400 });
        }

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

        const endpointRows = await db
            .select({ id: intersections.id })
            .from(intersections)
            .where(and(eq(intersections.cityId, cityId), inArray(intersections.id, [start, destination])));
        const endpointIds = new Set(endpointRows.map((row) => row.id));
        if (!endpointIds.has(start) || !endpointIds.has(destination)) {
            return NextResponse.json(
                { error: "Start and destination must be intersections in the selected city." },
                { status: 404 },
            );
        }

        let selectedSimulationSnapshot;
        if (requestedSimulationId !== null) {
            try {
                selectedSimulationSnapshot = await loadSimulationTrafficSnapshot(requestedSimulationId, cityId);
            } catch (error) {
                const message = error instanceof Error ? error.message : "Invalid simulation";
                if (message.includes("belongs to city")) {
                    return NextResponse.json({ error: message }, { status: 400 });
                }
                throw error;
            }
            if (!selectedSimulationSnapshot) {
                return NextResponse.json({ error: `Simulation run ${requestedSimulationId} was not found.` }, { status: 404 });
            }
        }
        const trafficSnapshot = strategy === "FASTEST_TIME" &&
            selectedSimulationSnapshot &&
            simulationStatusUsesLiveTraffic(selectedSimulationSnapshot.status)
            ? selectedSimulationSnapshot
            : undefined;

        const route =
            await findRoute(
                cityId,
                start,
                destination,
                strategy,
                trafficSnapshot,
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

        const trafficEstimate = strategy === "FASTEST_TIME" && requestedSimulationId !== null
            ? trafficSnapshot && route.trafficEstimate
                ? { ...route.trafficEstimate, simulationStatus: selectedSimulationSnapshot?.status ?? null }
                : {
                source: "STATIC" as const,
                simulationRunId: requestedSimulationId,
                simulationTime: selectedSimulationSnapshot?.simulationTime ?? null,
                simulationStatus: selectedSimulationSnapshot?.status ?? null,
                observedSpeedSegments: 0,
                heuristicSegments: 0,
                signalDelaySeconds: 0,
            }
            : route.trafficEstimate;

        return NextResponse.json({
            cityId,
            startIntersectionId: start,
            destinationIntersectionId:
                destination,
            strategy,
            routeGeometry,
            ...route,
            ...(trafficEstimate ? { trafficEstimate } : {}),
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
