import type {
    ApproachDirection,
    TurnType,
} from "@/modules/road/road_geometry.service";

export type TrafficLightPhaseNumber =
    | 1
    | 2
    | 3
    | 4
    | 5
    | 6;

export function getMovementPhase(
    approach: ApproachDirection,
    turn: TurnType,
): TrafficLightPhaseNumber {
    if (
        approach === "NORTH_SOUTH"
    ) {
        if (
            turn === "STRAIGHT" ||
            turn === "RIGHT"
        ) {
            return 1;
        }

        return 5;
    }

    if (
        turn === "STRAIGHT" ||
        turn === "RIGHT"
    ) {
        return 3;
    }

    return 6;
}

export type TrafficLightMovementState =
    | "GREEN"
    | "YELLOW"
    | "RED";

export function getMovementState(
    approach: ApproachDirection,
    turn: TurnType,
    phase: TrafficLightPhaseNumber,
): TrafficLightMovementState {
    /*
     * Determine the phase in which this
     * movement has the right of way.
     */
    const movementPhase =
        getMovementPhase(
            approach,
            turn,
        );

    /*
     * Straight + right movements have
     * a yellow transition immediately
     * after their green phase.
     */
    if (
        movementPhase === 1 &&
        phase === 2
    ) {
        return "YELLOW";
    }

    if (
        movementPhase === 3 &&
        phase === 4
    ) {
        return "YELLOW";
    }

    /*
     * The movement is green during
     * its assigned movement phase.
     */
    if (
        phase === movementPhase
    ) {
        return "GREEN";
    }

    /*
     * All other phases are red for
     * this movement.
     */
    return "RED";
}