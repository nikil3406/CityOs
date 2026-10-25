import type { RouteSegment } from "@/modules/road/routing.service";
import type { NetworkSegment } from "@/modules/road/road_network.service";

export type CandidateRoute = {
    intersections: number[];
    segments: RouteSegment[];
    estimatedTravelTimeSeconds: number | null;
};

export type RerouteCandidate = {
    /** Entry intersection of the preserved active segment. */
    currentIntersectionId: number;
    /** The point from which the replaceable suffix is planned. */
    continuationIntersectionId: number;
    destinationIntersectionId: number;
    currentRoute: RouteSegment[];
    currentTravelTimeSeconds: number;
    candidateTravelTimeSeconds: number;
    improvementSeconds: number;
    improvementPercent: number;
    candidate: CandidateRoute;
};

export type ImprovementThreshold = {
    minimumSeconds: number;
    minimumPercent: number;
};

export function isEligibleVehicleState(
    vehicle: {
        simulationRunId: number;
        status: string;
        destinationIntersectionId: number | null;
        currentSegmentId: number | null;
        routeSequence: number;
        progress: number;
    },
    simulationRunId: number,
): boolean {
    return vehicle.simulationRunId === simulationRunId &&
        ["MOVING", "WAITING", "WAITING_AT_SIGNAL", "WAITING_BEHIND_VEHICLE"].includes(vehicle.status) &&
        Number.isInteger(vehicle.destinationIntersectionId) && vehicle.destinationIntersectionId !== null &&
        Number.isInteger(vehicle.currentSegmentId) && vehicle.currentSegmentId !== null &&
        Number.isInteger(vehicle.routeSequence) && Number.isFinite(vehicle.progress) &&
        vehicle.progress >= 0 && vehicle.progress <= 1;
}

export function candidateMatchesVehicleState(
    candidate: { vehicleId: number; routeSequence: number; currentSegmentId: number; destinationIntersectionId: number; progress: number; isReverse: boolean },
    vehicle: { id: number; simulationRunId: number; status: string; destinationIntersectionId: number | null; currentSegmentId: number | null; routeSequence: number; progress: number; isReverse: boolean },
    simulationRunId: number,
): boolean {
    return isEligibleVehicleState(vehicle, simulationRunId) &&
        candidate.vehicleId === vehicle.id && candidate.routeSequence === vehicle.routeSequence &&
        candidate.currentSegmentId === vehicle.currentSegmentId &&
        candidate.destinationIntersectionId === vehicle.destinationIntersectionId &&
        candidate.progress === vehicle.progress && candidate.isReverse === vehicle.isReverse;
}

export function getDirectedSegmentEndpoints(
    segment: NetworkSegment | undefined,
    isReverse: boolean,
): { entryIntersectionId: number; exitIntersectionId: number } | null {
    if (!segment || !Number.isInteger(segment.startIntersectionId) || !Number.isInteger(segment.endIntersectionId)) return null;
    return isReverse
        ? { entryIntersectionId: segment.endIntersectionId, exitIntersectionId: segment.startIntersectionId }
        : { entryIntersectionId: segment.startIntersectionId, exitIntersectionId: segment.endIntersectionId };
}

export function trafficSnapshotMatchesRun(
    snapshot: { simulationRunId: number; cityId: number; status: string },
    simulationRunId: number,
    cityId: number,
): boolean {
    return snapshot.simulationRunId === simulationRunId && snapshot.cityId === cityId && snapshot.status === "RUNNING";
}

export function validateDirectedRoute(
    route: CandidateRoute,
    network: NetworkSegment[],
    startIntersectionId: number,
    destinationIntersectionId: number,
): boolean {
    if (
        !route || !Array.isArray(route.segments) || !Array.isArray(route.intersections) ||
        route.intersections.length !== route.segments.length + 1 ||
        route.intersections[0] !== startIntersectionId ||
        route.intersections.at(-1) !== destinationIntersectionId ||
        (startIntersectionId !== destinationIntersectionId && route.segments.length === 0)
    ) return false;

    const byId = new Map(network.map((segment) => [segment.id, segment]));
    for (let index = 0; index < route.segments.length; index++) {
        const traversal = route.segments[index];
        if (!traversal || !Number.isInteger(traversal.segmentId) || typeof traversal.isReverse !== "boolean") return false;
        const segment = byId.get(traversal.segmentId);
        if (!segment || !Number.isFinite(segment.lengthMeters) || segment.lengthMeters <= 0) return false;
        const from = traversal.isReverse ? segment.endIntersectionId : segment.startIntersectionId;
        const to = traversal.isReverse ? segment.startIntersectionId : segment.endIntersectionId;
        if (from !== route.intersections[index] || to !== route.intersections[index + 1]) return false;
    }
    return true;
}

export function sameRoute(a: RouteSegment[], b: RouteSegment[]): boolean {
    return a.length === b.length && a.every((entry, index) =>
        entry.segmentId === b[index]?.segmentId && entry.isReverse === b[index]?.isReverse,
    );
}

export function buildRouteSuffixEntries(routeSequence: number, route: RouteSegment[]) {
    return route.map((entry, index) => ({
        segmentId: entry.segmentId,
        sequence: routeSequence + index,
        isReverse: entry.isReverse,
    }));
}

export function evaluateCandidate(
    currentIntersectionId: number,
    continuationIntersectionId: number,
    destinationIntersectionId: number,
    currentRoute: RouteSegment[],
    currentIntersections: number[],
    currentCost: number | null,
    candidate: CandidateRoute | null,
    network: NetworkSegment[],
    threshold: ImprovementThreshold,
): RerouteCandidate | null {
    if (currentIntersectionId === destinationIntersectionId || !candidate || currentCost === null ||
        !Number.isFinite(currentCost) || currentCost <= 0 ||
        !validateDirectedRoute(candidate, network, currentIntersectionId, destinationIntersectionId) ||
        candidate.estimatedTravelTimeSeconds === null || !Number.isFinite(candidate.estimatedTravelTimeSeconds) ||
        sameRoute(currentRoute, candidate.segments)) return null;

    // Ensure the current suffix is itself connected and has the same endpoints.
    const currentAsRoute: CandidateRoute = {
        intersections: currentIntersections,
        segments: currentRoute,
        estimatedTravelTimeSeconds: currentCost,
    };
    if (!validateDirectedRoute(currentAsRoute, network, currentIntersectionId, destinationIntersectionId)) return null;
    const currentActive = currentRoute[0];
    const candidateActive = candidate.segments[0];
    if (!currentActive || !candidateActive ||
        currentActive.segmentId !== candidateActive.segmentId || currentActive.isReverse !== candidateActive.isReverse) return null;
    const activeSegment = network.find((segment) => segment.id === currentActive.segmentId);
    const activeEndpoints = getDirectedSegmentEndpoints(activeSegment, currentActive.isReverse);
    if (!activeEndpoints || activeEndpoints.entryIntersectionId !== currentIntersectionId ||
        activeEndpoints.exitIntersectionId !== continuationIntersectionId) return null;

    const improvementSeconds = currentCost - candidate.estimatedTravelTimeSeconds;
    const improvementPercent = improvementSeconds / currentCost * 100;
    if (improvementSeconds < threshold.minimumSeconds || improvementPercent < threshold.minimumPercent) return null;
    return {
        currentIntersectionId,
        continuationIntersectionId,
        destinationIntersectionId,
        currentRoute: currentRoute.map((entry) => ({ ...entry })),
        currentTravelTimeSeconds: currentCost,
        candidateTravelTimeSeconds: candidate.estimatedTravelTimeSeconds,
        improvementSeconds,
        improvementPercent,
        candidate,
    };
}

// Process-local only. This prevents duplicate work in this engine instance;
// it does not coordinate reroute attempts across multiple server processes.
const activeAttempts = new Set<string>();
export async function withRerouteAttempt<T>(key: string, operation: () => Promise<T>): Promise<T | null> {
    if (activeAttempts.has(key)) return null;
    activeAttempts.add(key);
    try {
        return await operation();
    } finally {
        activeAttempts.delete(key);
    }
}

export function isRerouteAttemptActive(key: string): boolean {
    return activeAttempts.has(key);
}

/** Keep post-commit side effects ordered and leave them untouched on transaction failure. */
export async function persistThenSyncRoute<T>(
    persist: () => Promise<T | null>,
    synchronizeCache: (value: T) => boolean,
    recordEvent: (value: T) => Promise<void>,
): Promise<boolean> {
    const committed = await persist();
    if (committed === null) return false;
    if (!synchronizeCache(committed)) return false;
    await recordEvent(committed);
    return true;
}
