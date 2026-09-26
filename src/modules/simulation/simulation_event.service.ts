import { db } from "@/db";
import { simulationEvents } from "@/db/schema";

export type RecordSimulationEventInput = {
    simulationRunId: number;
    type: string;

    roadId?: number | null;
    intersectionId?: number | null;

    location?: {
        longitude: number;
        latitude: number;
    } | null;

    data?: Record<string, unknown> | null;

    simulationTime: number;
};

export async function recordSimulationEvent(
    input: RecordSimulationEventInput,
) {
    const result = await db
        .insert(simulationEvents)
        .values({
            simulationRunId:
                input.simulationRunId,

            type: input.type,

            roadId:
                input.roadId ?? null,

            intersectionId:
                input.intersectionId ?? null,

            data:
                input.data ?? null,

            simulationTime:
                input.simulationTime,
        })
        .returning({
            id: simulationEvents.id,
            simulationRunId:
                simulationEvents.simulationRunId,
            type: simulationEvents.type,
            roadId: simulationEvents.roadId,
            intersectionId:
                simulationEvents.intersectionId,
            data: simulationEvents.data,
            simulationTime:
                simulationEvents.simulationTime,
            createdAt:
                simulationEvents.createdAt,
        });

    return result[0];
}