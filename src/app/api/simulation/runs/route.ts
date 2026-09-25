import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";

import { db } from "@/db";
import { cities, simulationRuns } from "@/db/schema";

export async function POST(request: Request) {
    try {
        let body: { cityId?: number } = {};
        try {
            body = (await request.json()) as { cityId?: number };
        } catch {
            body = {};
        }

        const cityId = body.cityId ?? 1;

        if (
            typeof cityId !== "number" ||
            !Number.isInteger(cityId) ||
            cityId <= 0
        ) {
            return NextResponse.json(
                { error: "cityId must be a positive integer" },
                { status: 400 },
            );
        }

        const city = await db
            .select({
                id: cities.id,
                name: cities.name,
            })
            .from(cities)
            .where(eq(cities.id, cityId))
            .limit(1);

        if (city.length === 0) {
            return NextResponse.json(
                { error: "City not found" },
                { status: 404 },
            );
        }

        const result = await db
            .insert(simulationRuns)
            .values({
                cityId,
                status: "CREATED",
                simulationTime: 0,
            })
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

        return NextResponse.json(
            {
                ...result[0],
                city: city[0],
            },
            { status: 201 },
        );
    } catch (error) {
        console.error("POST /api/simulation/runs error:", error);

        return NextResponse.json(
            { error: "Failed to create simulation run" },
            { status: 500 },
        );
    }
}

export async function GET() {
    try {
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
            .orderBy(desc(simulationRuns.createdAt));

        return NextResponse.json(result);
    } catch (error) {
        console.error("GET /api/simulation/runs error:", error);

        return NextResponse.json(
            { error: "Failed to fetch simulation runs" },
            { status: 500 },
        );
    }
}