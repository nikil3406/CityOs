import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { simulationRuns } from "@/db/schema";
import { clearTrafficLightCache } from "@/modules/traffic/traffic_light_cache.service";

/**
 * Test-only cache control endpoint.
 *
 * Configure CITYOS_TEST_CONTROL_TOKEN in the Next.js server environment and
 * send the same token from the standalone test script. This endpoint is locked
 * to City 1 and refuses to clear the cache while a simulation is RUNNING.
 */
export async function POST(request: Request) {
    if (process.env.NODE_ENV === "production") {
        return NextResponse.json(
            { error: "This test-only endpoint is disabled in production." },
            { status: 404 },
        );
    }

    const expectedToken = process.env.CITYOS_TEST_CONTROL_TOKEN;
    const suppliedToken = request.headers
        .get("authorization")
        ?.replace(/^Bearer\s+/i, "");

    if (!expectedToken || !suppliedToken || suppliedToken !== expectedToken) {
        return NextResponse.json(
            { error: "Unauthorized." },
            { status: 401 },
        );
    }

    let body: { cityId?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Expected JSON body { cityId: 1 }." },
            { status: 400 },
        );
    }

    if (body.cityId !== 1) {
        return NextResponse.json(
            { error: "This test endpoint is locked to City 1." },
            { status: 400 },
        );
    }

    const running = await db
        .select({ id: simulationRuns.id })
        .from(simulationRuns)
        .where(
            and(
                eq(simulationRuns.cityId, 1),
                eq(simulationRuns.status, "RUNNING"),
            ),
        )
        .limit(1);

    if (running.length > 0) {
        return NextResponse.json(
            {
                error: `Refusing to clear City 1 traffic-light cache while simulation ${running[0].id} is RUNNING.`,
            },
            { status: 409 },
        );
    }

    clearTrafficLightCache(1);

    return NextResponse.json({
        ok: true,
        cityId: 1,
        cache: "cleared",
    });
}
