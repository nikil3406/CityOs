import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { simulationRuns } from "@/db/schema";

import { calculateTrafficMetrics } from "@/modules/simulation/traffic_metrics.service";

type RouteContext = {
    params: Promise<{
        id: string;
    }>;
};

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

        const simulation = await db
            .select({
                id: simulationRuns.id,
                cityId: simulationRuns.cityId,
                status: simulationRuns.status,
                simulationTime:
                    simulationRuns.simulationTime,
            })
            .from(simulationRuns)
            .where(eq(simulationRuns.id, simulationId))
            .limit(1);

        if (simulation.length === 0) {
            return NextResponse.json(
                { error: "Simulation run not found" },
                { status: 404 },
            );
        }

        const metrics =
            calculateTrafficMetrics(simulationId);

        return NextResponse.json({
            simulation: simulation[0],
            metrics,
        });
    } catch (error) {
        console.error(
            "GET /api/simulation/runs/[id]/metrics error:",
            error,
        );

        return NextResponse.json(
            { error: "Failed to fetch simulation metrics" },
            { status: 500 },
        );
    }
}