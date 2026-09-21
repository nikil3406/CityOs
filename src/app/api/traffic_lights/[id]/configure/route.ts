import { NextResponse } from "next/server";

import { configureTrafficLight } from "@/modules/traffic/traffic_light_configuration.service";

type RouteContext = {
    params: Promise<{
        id: string;
    }>;
};

export async function POST(
    request: Request,
    context: RouteContext,
) {
    try {
        const { id } = await context.params;

        const trafficLightId =
            Number(id);

        if (
            !Number.isInteger(trafficLightId) ||
            trafficLightId <= 0
        ) {
            return NextResponse.json(
                {
                    error:
                        "Invalid traffic light ID",
                },
                {
                    status: 400,
                },
            );
        }

        const result =
            await configureTrafficLight(
                trafficLightId,
            );

        return NextResponse.json(result);
    } catch (error) {
        console.error(
            "Failed to configure traffic light:",
            error,
        );

        return NextResponse.json(
            {
                error:
                    "Failed to configure traffic light",
            },
            {
                status: 500,
            },
        );
    }
}