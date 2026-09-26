const previousQueueState =
    new Map<number, boolean>();

export function getPreviousQueueState(
    simulationRunId: number,
): boolean {
    return (
        previousQueueState.get(
            simulationRunId,
        ) ?? false
    );
}

export function setPreviousQueueState(
    simulationRunId: number,
    hasQueues: boolean,
): void {
    previousQueueState.set(
        simulationRunId,
        hasQueues,
    );
}

export function clearQueueEventState(
    simulationRunId: number,
): void {
    previousQueueState.delete(
        simulationRunId,
    );
}