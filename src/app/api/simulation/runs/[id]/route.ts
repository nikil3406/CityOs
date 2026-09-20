import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { simulationRuns } from "@/db/schema";

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

        const result = await db
            .select({
                id: simulationRuns.id,
                cityId: simulationRuns.cityId,
                status: simulationRuns.status,
                simulationTime: simulationRuns.simulationTime,
                startedAt: simulationRuns.startedAt,
                endedAt: simulationRuns.endedAt,
                createdAt: simulationRuns.createdAt,
                updatedAt: simulationRuns.updatedAt,
            })
            .from(simulationRuns)
            .where(eq(simulationRuns.id, simulationId))
            .limit(1);

        if (result.length === 0) {
            return NextResponse.json(
                { error: "Simulation run not found" },
                { status: 404 },
            );
        }

        return NextResponse.json(result[0]);
    } catch (error) {
        console.error(
            "GET /api/simulation/runs/[id] error:",
            error,
        );

        return NextResponse.json(
            { error: "Failed to fetch simulation run" },
            { status: 500 },
        );
    }
}