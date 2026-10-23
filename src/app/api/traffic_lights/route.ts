import { NextResponse } from "next/server";

import { db } from "@/db";
import { asc, eq } from "drizzle-orm";

import { intersections, trafficLightMovements, trafficLightPhases, trafficLights } from "@/db/schema";

export async function GET(request: Request) {
    try {
        const cityIdParam = new URL(request.url).searchParams.get("cityId");
        const cityId = cityIdParam === null ? null : Number(cityIdParam);
        if (cityIdParam !== null && (!Number.isInteger(cityId) || cityId! <= 0)) {
            return NextResponse.json({ error: "Invalid cityId" }, { status: 400 });
        }
        const baseQuery = db
            .select({
                id: trafficLights.id,
                cityId: trafficLights.cityId,
                intersectionId: trafficLights.intersectionId,
                intersectionName: intersections.name,
                cycleDuration: trafficLights.cycleDuration,
                currentPhase: trafficLights.currentPhase,
                phaseElapsed: trafficLights.phaseElapsed,
                status: trafficLights.status,
            })
            .from(trafficLights)
            .leftJoin(intersections, eq(trafficLights.intersectionId, intersections.id));
        const lights = cityId === null
            ? await baseQuery
            : await baseQuery.where(eq(trafficLights.cityId, cityId));

        if (cityId === null) return NextResponse.json({ trafficLights: lights.map(({ id }) => ({ id })) });
        const detailed = await Promise.all(lights.map(async (light) => {
            const phases = await db.select().from(trafficLightPhases)
                .where(eq(trafficLightPhases.trafficLightId, light.id)).orderBy(asc(trafficLightPhases.phaseNumber));
            const movements = await db.select().from(trafficLightMovements)
                .where(eq(trafficLightMovements.trafficLightId, light.id));
            return { ...light, phases, movements };
        }));

        return NextResponse.json({ trafficLights: detailed });
    } catch (error) {
        console.error(
            "Failed to fetch traffic lights:",
            error,
        );

        return NextResponse.json(
            {
                error:
                    "Failed to fetch traffic lights",
            },
            {
                status: 500,
            },
        );
    }
}
