import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
    simulationEvents,
    simulationRuns,
} from "@/db/schema";

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
            .where(
                eq(
                    simulationRuns.id,
                    simulationId,
                ),
            )
            .limit(1);

        if (simulation.length === 0) {
            return NextResponse.json(
                { error: "Simulation run not found" },
                { status: 404 },
            );
        }

        const events = await db
            .select({
                id: simulationEvents.id,
                simulationRunId:
                    simulationEvents.simulationRunId,
                type: simulationEvents.type,
                roadId: simulationEvents.roadId,
                intersectionId:
                    simulationEvents.intersectionId,
                location:
                    simulationEvents.location,
                data: simulationEvents.data,
                simulationTime:
                    simulationEvents.simulationTime,
                createdAt:
                    simulationEvents.createdAt,
            })
            .from(simulationEvents)
            .where(
                eq(
                    simulationEvents.simulationRunId,
                    simulationId,
                ),
            )
            .orderBy(
                asc(
                    simulationEvents.simulationTime,
                ),
            );

        return NextResponse.json({
            simulation: simulation[0],
            events,
        });
    } catch (error) {
        console.error(
            "GET /api/simulation/runs/[id]/events error:",
            error,
        );

        return NextResponse.json(
            { error: "Failed to fetch simulation events" },
            { status: 500 },
        );
    }
}