import { NextResponse } from "next/server";

import { db } from "@/db";
import { simulationRuns } from "@/db/schema";
import { eq } from "drizzle-orm";

import {
    calculateSegmentCongestion,
} from "@/modules/traffic/congestion.service";

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
                {
                    error: "Invalid simulation ID",
                },
                {
                    status: 400,
                },
            );
        }

        /*
         * ------------------------------------------------
         * VERIFY SIMULATION RUN
         * ------------------------------------------------
         */

        const runs =
            await db
                .select({
                    id: simulationRuns.id,
                    cityId:
                        simulationRuns.cityId,
                    status:
                        simulationRuns.status,
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

        if (runs.length === 0) {
            return NextResponse.json(
                {
                    error:
                        "Simulation run not found",
                },
                {
                    status: 404,
                },
            );
        }

        const simulation = runs[0];

        /*
         * ------------------------------------------------
         * CALCULATE LIVE CONGESTION
         * ------------------------------------------------
         */

        const congestion =
            calculateSegmentCongestion(
                simulationId,
            );

        return NextResponse.json({
            simulation: {
                id: simulation.id,
                cityId: simulation.cityId,
                status: simulation.status,
                simulationTime:
                    simulation.simulationTime,
            },
            congestion,
        });
    } catch (error) {
        console.error(
            "Failed to calculate congestion:",
            error,
        );

        return NextResponse.json(
            {
                error:
                    "Failed to calculate congestion",
            },
            {
                status: 500,
            },
        );
    }
}