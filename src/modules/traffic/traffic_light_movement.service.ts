import {
    getCachedTrafficLightsAtIntersection,
    getCachedMovement,
    getCachedTrafficLightPhases,
} from "./traffic_light_cache.service";

export type TrafficLightDecision = {
    hasTrafficLight: boolean;
    state: "GREEN" | "YELLOW" | "RED";
    phase: number | null;
    trafficLightId: number | null;
};

export function getMovementSignal(
    cityId: number,
    intersectionId: number,
    fromRoadId: number,
    toRoadId: number,
): TrafficLightDecision {
    const lights =
        getCachedTrafficLightsAtIntersection(
            cityId,
            intersectionId,
        );

    // No traffic light is configured at this intersection.
    if (lights.length === 0) {
        return {
            hasTrafficLight: false,
            state: "GREEN",
            phase: null,
            trafficLightId: null,
        };
    }

    const activeLight =
        lights.find(
            (light) => light.status === "ACTIVE",
        );

    // Preserve existing behavior when no light is active.
    if (!activeLight) {
        return {
            hasTrafficLight: false,
            state: "GREEN",
            phase: null,
            trafficLightId: null,
        };
    }

    const movement =
        getCachedMovement(
            activeLight.cityId,
            activeLight.id,
            activeLight.currentPhase,
            fromRoadId,
            toRoadId,
        );

    if (movement) {
        return {
            hasTrafficLight: true,
            state: movement.state,
            phase: activeLight.currentPhase,
            trafficLightId: activeLight.id,
        };
    }

    // Determine whether this movement is configured in another phase.
    const phases =
        getCachedTrafficLightPhases(
            activeLight.cityId,
            activeLight.id,
        );

    for (const phaseNumber of phases.keys()) {
        const configuredMovement =
            getCachedMovement(
                activeLight.cityId,
                activeLight.id,
                phaseNumber,
                fromRoadId,
                toRoadId,
            );

        if (configuredMovement) {
            // A configured movement that is not green/yellow in the
            // current phase must wait for its assigned phase.
            return {
                hasTrafficLight: true,
                state: "RED",
                phase: activeLight.currentPhase,
                trafficLightId: activeLight.id,
            };
        }
    }

    // Fail safely: an active signal exists, but this movement has no
    // explicit configuration in any phase. Do not infer permission from
    // the intersection's general phase state.
    return {
        hasTrafficLight: true,
        state: "RED",
        phase: activeLight.currentPhase,
        trafficLightId: activeLight.id,
    };
}
