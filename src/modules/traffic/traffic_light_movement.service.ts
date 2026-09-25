import {
    getCachedTrafficLightsAtIntersection,
    getCachedMovement,
    getCachedTrafficLightPhase,
    getCachedTrafficLightPhases,
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
     * Check if this movement is configured in ANY phase
     * for this traffic light.
     */
    const phases =
        getCachedTrafficLightPhases(
            activeLight.cityId,
            activeLight.id,
        );

    let hasMovementInAnyPhase = false;

    for (const phaseNum of phases.keys()) {
        const m = getCachedMovement(
            activeLight.cityId,
            activeLight.id,
            phaseNum,
            fromRoadId,
            toRoadId,
        );

        if (m) {
            hasMovementInAnyPhase = true;
            break;
        }
    }

    if (hasMovementInAnyPhase) {
        /*
         * Movement is registered but not active during this phase.
         */
        return {
            hasTrafficLight: true,
            state: "RED",
            phase: activeLight.currentPhase,
            trafficLightId: activeLight.id,
        };
    }

    /*
     * Fallback if the movement was not explicitly mapped:
     * Follow the general phase state so vehicles don't get permanently stuck.
     */
    const phase =
        getCachedTrafficLightPhase(
            activeLight.cityId,
            activeLight.id,
            activeLight.currentPhase,
        );

    const fallbackState: "GREEN" | "YELLOW" | "RED" =
        phase?.state === "GREEN" ||
        phase?.state === "YELLOW" ||
        phase?.state === "RED"
            ? (phase.state as "GREEN" | "YELLOW" | "RED")
            : activeLight.currentPhase % 2 === 1
                ? "GREEN"
                : "RED";

    return {
        hasTrafficLight: true,
        state: fallbackState,
        phase: activeLight.currentPhase,
        trafficLightId: activeLight.id,
    };
}