import { NextResponse } from "next/server";

import { db } from "@/db";

import { trafficLights } from "@/db/schema";

export async function GET() {
    try {
        const lights = await db
            .select({
                id: trafficLights.id,
            })
            .from(trafficLights);

        return NextResponse.json({
            trafficLights: lights,
        });
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