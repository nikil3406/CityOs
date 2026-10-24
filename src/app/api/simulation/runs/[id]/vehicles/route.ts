import { NextResponse } from "next/server";
import { eq, and, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import {
    simulationRuns,
    vehicles,
} from "@/db/schema";

import { generateVehicles } from "@/modules/vehicle/vehicle.service";
import { initializeSimulationVehicleStates } from "@/modules/vehicle/vehicle_state.service";
import { clearSimulationVehicleCache } from "@/modules/vehicle/vehicle_simulation_cache.service";
import { simulationEngine } from "@/modules/simulation/simulation.engine";
import {
    validateSelectedRoute,
    type RouteResult,
    type RoutingStrategy,
} from "@/modules/road/routing.service";
import type { VehicleRouteEndpoints } from "@/modules/vehicle/vehicle.service";
import { loadSimulationTrafficSnapshot } from "@/modules/road/simulation_traffic_snapshot.service";

type RouteContext = {
    params: Promise<{ id: string }>;
};

export async function POST(
    request: Request,
    context: RouteContext,
) {
    try {
        const { id } = await context.params;
        const simulationId = Number(id);

        if (
            !Number.isInteger(simulationId) ||
            simulationId <= 0
        ) {
            return NextResponse.json(
                { error: "Invalid simulation ID" },
                { status: 400 },
            );
        }

        const parsedBody: unknown = await request.json();
        if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
            return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
        }
        const body = parsedBody as {
            count?: number;
            sourceIntersectionId?: number;
            destinationIntersectionId?: number;
            routes?: {
                sourceIntersectionId: number;
                destinationIntersectionId: number;
                strategy: RoutingStrategy;
                route: RouteResult;
            }[];
        };

        const count = body.count ?? 10;

        if (
            !Number.isInteger(count) ||
            count <= 0 ||
            count > 1000
        ) {
            return NextResponse.json(
                {
                    error:
                        "count must be an integer between 1 and 1000",
                },
                { status: 400 },
            );
        }

        const simulation = await db
            .select({
                id: simulationRuns.id,
                cityId: simulationRuns.cityId,
                status: simulationRuns.status,
            })
            .from(simulationRuns)
            .where(eq(simulationRuns.id, simulationId))
            .limit(1);

        if (simulation.length === 0) {
            return NextResponse.json(
                {
                    error:
                        "Simulation run not found",
                },
                { status: 404 },
            );
        }

        const hasSource = body.sourceIntersectionId !== undefined;
        const hasDestination = body.destinationIntersectionId !== undefined;
        if (body.routes !== undefined && !Array.isArray(body.routes)) {
            return NextResponse.json({ error: "routes must be an array of selected route previews" }, { status: 400 });
        }
        if ((hasSource !== hasDestination) || (body.routes && (hasSource || hasDestination))) {
            return NextResponse.json({ error: "Provide either a routes array or one source and destination pair" }, { status: 400 });
        }
        if (hasSource && hasDestination) {
            return NextResponse.json({ error: "Preview and select a route before generating manual vehicles." }, { status: 400 });
        }
        const manualRoutes = body.routes;
        if (manualRoutes && (manualRoutes.length === 0 || manualRoutes.length > 25 || manualRoutes.some((route) =>
            !route || typeof route !== "object" ||
            !Number.isInteger(route.sourceIntersectionId) || route.sourceIntersectionId <= 0 ||
            !Number.isInteger(route.destinationIntersectionId) || route.destinationIntersectionId <= 0 ||
            route.sourceIntersectionId === route.destinationIntersectionId
        ))) {
            return NextResponse.json({ error: "routes must contain 1-25 pairs of different valid intersection IDs" }, { status: 400 });
        }
        const validatedManualRoutes: VehicleRouteEndpoints[] = [];
        const liveSelections = manualRoutes?.filter((selection) =>
            typeof selection?.route?.trafficEstimate?.source === "string" &&
                selection.route.trafficEstimate.source.startsWith("LIVE_"),
        ) ?? [];
        let liveTrafficSnapshot;
        if (liveSelections.length > 0) {
            if (liveSelections.some((selection) => selection.route.trafficEstimate?.simulationRunId !== simulationId)) {
                return NextResponse.json({ error: "The live traffic preview belongs to a different simulation. Refresh the route preview for this run." }, { status: 422 });
            }
            liveTrafficSnapshot = await loadSimulationTrafficSnapshot(simulationId, simulation[0].cityId);
            if (!liveTrafficSnapshot) {
                return NextResponse.json({ error: `Simulation run ${simulationId} was not found.` }, { status: 404 });
            }
            if (liveTrafficSnapshot.status !== "RUNNING" && liveTrafficSnapshot.status !== "PAUSED") {
                return NextResponse.json({ error: "This simulation is no longer running or paused. Refresh the route preview to use a static estimate." }, { status: 422 });
            }
        }
        if (manualRoutes) {
            for (const selection of manualRoutes) {
                if (
                    !selection.route ||
                    (selection.strategy !== "SHORTEST_DISTANCE" && selection.strategy !== "FASTEST_TIME")
                ) {
                    return NextResponse.json({ error: "Each manual route must include a valid preview result and strategy. Preview and select a route before generating vehicles." }, { status: 400 });
                }
                try {
                    const route = await validateSelectedRoute(
                        simulation[0].cityId,
                        selection.sourceIntersectionId,
                        selection.destinationIntersectionId,
                        selection.route,
                        selection.strategy,
                        selection.route.trafficEstimate?.source.startsWith("LIVE_") ? liveTrafficSnapshot : undefined,
                    );
                    validatedManualRoutes.push({ ...selection, route });
                } catch (error) {
                    return NextResponse.json(
                        { error: error instanceof Error ? error.message : "Selected route is invalid. Preview it again." },
                        { status: 422 },
                    );
                }
            }
        }

        const generated =
            await generateVehicles(
                simulationId,
                count,
                validatedManualRoutes.length > 0 ? validatedManualRoutes : undefined,
            );

        if (simulationEngine.isRunning(simulationId)) {
            clearSimulationVehicleCache(simulationId);
            await initializeSimulationVehicleStates(simulationId);
        }

        return NextResponse.json(
            {
                simulationRunId: simulationId,
                count: generated.length,
                vehicles: generated,
            },
            { status: 201 },
        );
    } catch (error) {
        console.error(
            "POST /api/simulation/runs/[id]/vehicles error:",
            error,
        );

        return NextResponse.json(
            {
                error: error instanceof Error
                    ? error.message
                    : "Failed to generate vehicles",
            },
            {
                status: error instanceof Error && /selected route|traffic preview/i.test(error.message)
                    ? 422
                    : 500,
            },
        );
    }
}

export async function GET(
    _request: Request,
    context: RouteContext,
) {
    try {
        const { id } = await context.params;
        const simulationId = Number(id);

        if (
            !Number.isInteger(simulationId) ||
            simulationId <= 0
        ) {
            return NextResponse.json(
                { error: "Invalid simulation ID" },
                { status: 400 },
            );
        }

        const result = await db
            .select({
                id: vehicles.id,
                simulationRunId:
                    vehicles.simulationRunId,
                currentRoadId:
                    vehicles.currentRoadId,
                destinationIntersectionId:
                    vehicles.destinationIntersectionId,
                routeSequence:
                    vehicles.routeSequence,
                speedKmh: vehicles.speedKmh,
                status: vehicles.status,
                progress: vehicles.progress,
                longitude: sql<number>`ST_X(${vehicles.position})`,
                latitude: sql<number>`ST_Y(${vehicles.position})`,
            })
            .from(vehicles)
            .where(
                and(
                    eq(
                        vehicles.simulationRunId,
                        simulationId,
                    ),
                    ne(
                        vehicles.status,
                        "COMPLETED",
                    ),
                ),
            );

        return NextResponse.json(result.map(({ longitude, latitude, ...vehicle }) => ({
            ...vehicle,
            position: [Number(longitude), Number(latitude)],
        })));
    } catch (error) {
        console.error(
            "GET /api/simulation/runs/[id]/vehicles error:",
            error,
        );

        return NextResponse.json(
            {
                error:
                    "Failed to fetch vehicles",
            },
            { status: 500 },
        );
    }
}
