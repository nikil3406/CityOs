const BASE_URL = "http://localhost:3000";

async function main() {
    const response = await fetch(
        `${BASE_URL}/api/traffic_lights`,
    );

    if (!response.ok) {
        throw new Error(
            `Failed to fetch traffic lights: ${response.status} ${response.statusText}`,
        );
    }

    const data = await response.json();

    const lights = data.trafficLights;

    if (!Array.isArray(lights)) {
        throw new Error(
            "Expected trafficLights array",
        );
    }

    console.log(
        `Found ${lights.length} traffic lights.`,
    );

    for (const light of lights) {
        const trafficLightId = Number(light.id);

        try {
            const response = await fetch(
                `${BASE_URL}/api/traffic_lights/${trafficLightId}/configure`,
                {
                    method: "POST",
                },
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.error ??
                        `HTTP ${response.status}`,
                );
            }

            console.log(
                `✓ Traffic light #${trafficLightId} configured`,
                `| intersection=${result.intersectionId}`,
                `| movements=${result.movementCount}`,
                `| states=${result.stateCount}`,
            );
        } catch (error) {
            console.error(
                `✗ Failed to configure traffic light #${trafficLightId}:`,
                error,
            );
        }
    }

    console.log(
        "Finished configuring all traffic lights.",
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});