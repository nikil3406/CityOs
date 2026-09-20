import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { simulationRuns } from "@/db/schema";

export async function getSimulationRun(
    simulationId: number,
) {
    const result = await db
        .select({
            id: simulationRuns.id,
            cityId: simulationRuns.cityId,
            status: simulationRuns.status,
            simulationTime: simulationRuns.simulationTime,
        })
        .from(simulationRuns)
        .where(eq(simulationRuns.id, simulationId))
        .limit(1);

    return result[0] ?? null;
}

export async function advanceSimulationTime(
    simulationId: number,
) {
    const result = await db
        .update(simulationRuns)
        .set({
            simulationTime: sql`${simulationRuns.simulationTime} + 1`,
            updatedAt: new Date(),
        })
        .where(eq(simulationRuns.id, simulationId))
        .returning({
            id: simulationRuns.id,
            cityId: simulationRuns.cityId,
            simulationTime:
                simulationRuns.simulationTime,
            status: simulationRuns.status,
        });

    return result[0] ?? null;
}