import { NextResponse } from "next/server";
import { eq, and, ne } from "drizzle-orm";

import { db } from "@/db";
import {
    simulationRuns,
    vehicles,
} from "@/db/schema";

import { generateVehicles } from "@/modules/vehicle/vehicle.service";
import { initializeSimulationVehicleStates } from "@/modules/vehicle/vehicle_state.service";
import { clearSimulationVehicleCache } from "@/modules/vehicle/vehicle_simulation_cache.service";
import { simulationEngine } from "@/modules/simulation/simulation.engine";

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

        const generated =
            await generateVehicles(
                simulationId,
                count,
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
                error:
                    "Failed to generate vehicles",
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
                position: vehicles.position,
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

        return NextResponse.json(result);
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