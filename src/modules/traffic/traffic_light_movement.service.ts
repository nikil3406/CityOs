import {
    getCachedTrafficLightsAtIntersection,
    getCachedMovement,
} from "./traffic_light_cache.service";

export type TrafficLightDecision = {
    hasTrafficLight: boolean;
    state: "GREEN" | "YELLOW" | "RED";
    phase: number | null;
    trafficLightId: number | null;
};

export function getMovementSignal(
    intersectionId: number,
    fromRoadId: number,
    toRoadId: number,
): TrafficLightDecision {
    const lights =
        getCachedTrafficLightsAtIntersection(
            intersectionId,
        );

    /*
     * No traffic light at this intersection.
     */
    if (lights.length === 0) {
        return {
            hasTrafficLight: false,
            state: "GREEN",
            phase: null,
            trafficLightId: null,
        };
    }

    /*
     * Find the active traffic light
     * controlling this intersection.
     */
    const activeLight =
        lights.find(
            (light) =>
                light.status === "ACTIVE",
        );

    if (!activeLight) {
        return {
            hasTrafficLight: false,
            state: "GREEN",
            phase: null,
            trafficLightId: null,
        };
    }

    /*
     * Look up the exact movement for
     * the current phase.
     */
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

    /*
     * Traffic light exists but this movement
     * is not permitted during the current phase.
     */
    return {
        hasTrafficLight: true,
        state: "RED",
        phase: activeLight.currentPhase,
        trafficLightId: activeLight.id,
    };
}