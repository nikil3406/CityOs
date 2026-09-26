const previousSevereState =
    new Map<number, Map<number, boolean>>();

export function getPreviousSevereState(
    simulationRunId: number,
    segmentId: number,
): boolean {
    const simulationState =
        previousSevereState.get(
            simulationRunId,
        );

    return (
        simulationState?.get(segmentId) ??
        false
    );
}

export function setPreviousSevereState(
    simulationRunId: number,
    segmentId: number,
    isSevere: boolean,
): void {
    let simulationState =
        previousSevereState.get(
            simulationRunId,
        );

    if (!simulationState) {
        simulationState = new Map<
            number,
            boolean
        >();

        previousSevereState.set(
            simulationRunId,
            simulationState,
        );
    }

    simulationState.set(
        segmentId,
        isSevere,
    );
}

export function clearCongestionEventState(
    simulationRunId: number,
): void {
    previousSevereState.delete(
        simulationRunId,
    );
}