const previousSevereState =
    new Map<number, Map<number, boolean>>();

export function getPreviousSevereState(
    simulationRunId: number,
    segmentId: number,
): boolean {
    const simulationState =
        previousSevereState.get(simulationRunId);

    return simulationState?.get(segmentId) ?? false;
}

/**
 * Return the segment IDs that were marked severe on the previous
 * congestion evaluation. This lets the engine detect when a segment
 * disappears from the current results, such as when its last vehicle
 * leaves the segment.
 */
export function getPreviousSevereSegmentIds(
    simulationRunId: number,
): number[] {
    const simulationState =
        previousSevereState.get(simulationRunId);

    if (!simulationState) {
        return [];
    }

    return Array.from(simulationState.entries())
        .filter(([, isSevere]) => isSevere)
        .map(([segmentId]) => segmentId);
}

export function setPreviousSevereState(
    simulationRunId: number,
    segmentId: number,
    isSevere: boolean,
): void {
    let simulationState =
        previousSevereState.get(simulationRunId);

    if (!simulationState) {
        simulationState = new Map<number, boolean>();
        previousSevereState.set(simulationRunId, simulationState);
    }

    simulationState.set(segmentId, isSevere);
}

export function clearCongestionEventState(
    simulationRunId: number,
): void {
    previousSevereState.delete(simulationRunId);
}
