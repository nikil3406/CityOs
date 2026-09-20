import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { simulationRuns } from "@/db/schema";
import { simulationEngine } from "@/modules/simulation/simulation.engine";

type RouteContext = {
    params: Promise<{
        id: string;
    }>;
};

export async function POST(
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

        const existing = await db
            .select({
                id: simulationRuns.id,
                status: simulationRuns.status,
            })
            .from(simulationRuns)
            .where(eq(simulationRuns.id, simulationId))
            .limit(1);

        if (existing.length === 0) {
            return NextResponse.json(
                { error: "Simulation run not found" },
                { status: 404 },
            );
        }

        if (
            existing[0].status !== "CREATED" &&
            existing[0].status !== "PAUSED"
        ) {
            return NextResponse.json(
                {
                    error: `Simulation cannot be started from ${existing[0].status} state`,
                },
                { status: 400 },
            );
        }

        const result = await db
            .update(simulationRuns)
            .set({
                status: "RUNNING",
                startedAt: existing[0].status === "CREATED"
                    ? new Date()
                    : undefined,
                updatedAt: new Date(),
            })
            .where(eq(simulationRuns.id, simulationId))
            .returning({
                id: simulationRuns.id,
                cityId: simulationRuns.cityId,
                status: simulationRuns.status,
                simulationTime: simulationRuns.simulationTime,
                startedAt: simulationRuns.startedAt,
                endedAt: simulationRuns.endedAt,
                createdAt: simulationRuns.createdAt,
                updatedAt: simulationRuns.updatedAt,
            });

        await simulationEngine.start(simulationId);

        return NextResponse.json(result[0]);
    } catch (error) {
        console.error(
            "POST /api/simulation/runs/[id]/start error:",
            error,
        );

        return NextResponse.json(
            { error: "Failed to start simulation" },
            { status: 500 },
        );
    }
}