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
import { findShortestRoute } from "@/modules/road/routing.service";

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

        const body = (await request.json()) as {
            count?: number;
            sourceIntersectionId?: number;
            destinationIntersectionId?: number;
            routes?: { sourceIntersectionId: number; destinationIntersectionId: number }[];
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
            return NextResponse.json({ error: "routes must be an array of source/destination pairs" }, { status: 400 });
        }
        if ((hasSource !== hasDestination) || (body.routes && (hasSource || hasDestination))) {
            return NextResponse.json({ error: "Provide either a routes array or one source and destination pair" }, { status: 400 });
        }
        const manualRoutes = body.routes ?? (hasSource && hasDestination ? [{
            sourceIntersectionId: body.sourceIntersectionId!,
            destinationIntersectionId: body.destinationIntersectionId!,
        }] : undefined);
        if (manualRoutes && (manualRoutes.length === 0 || manualRoutes.length > 25 || manualRoutes.some((route) =>
            !Number.isInteger(route.sourceIntersectionId) || route.sourceIntersectionId <= 0 ||
            !Number.isInteger(route.destinationIntersectionId) || route.destinationIntersectionId <= 0 ||
            route.sourceIntersectionId === route.destinationIntersectionId
        ))) {
            return NextResponse.json({ error: "routes must contain 1–25 pairs of different valid intersection IDs" }, { status: 400 });
        }
        if (manualRoutes) {
            for (const endpoints of manualRoutes) {
                const route = await findShortestRoute(simulation[0].cityId, endpoints.sourceIntersectionId, endpoints.destinationIntersectionId);
            if (!route || route.segments.length === 0) {
                    return NextResponse.json({ error: `No drivable route exists from intersection ${endpoints.sourceIntersectionId} to ${endpoints.destinationIntersectionId}` }, { status: 422 });
                }
            }
        }

        const generated =
            await generateVehicles(
                simulationId,
                count,
                manualRoutes,
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
            { status: 500 },
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
