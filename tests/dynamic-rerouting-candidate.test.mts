import assert from "node:assert/strict";
import {
    evaluateCandidate,
    isEligibleVehicleState,
    trafficSnapshotMatchesRun,
    withRerouteAttempt,
    isRerouteAttemptActive,
    buildRouteSuffixEntries,
    persistThenSyncRoute,
    candidateMatchesVehicleState,
    getDirectedSegmentEndpoints,
} from "../src/modules/vehicle/dynamic_rerouting_candidate.ts";
import type { NetworkSegment } from "../src/modules/road/road_network.service";

const network: NetworkSegment[] = [
    { id: 1, roadId: 1, startIntersectionId: 10, endIntersectionId: 11, sequence: 0, lengthMeters: 100, speedLimitKmh: 30 },
    { id: 2, roadId: 2, startIntersectionId: 11, endIntersectionId: 12, sequence: 0, lengthMeters: 100, speedLimitKmh: 30 },
    { id: 3, roadId: 3, startIntersectionId: 10, endIntersectionId: 12, sequence: 0, lengthMeters: 50, speedLimitKmh: 30 },
    { id: 4, roadId: 4, startIntersectionId: 11, endIntersectionId: 12, sequence: 0, lengthMeters: 50, speedLimitKmh: 30 },
];
const log = (name: string) => console.log(`PASS ${name}`);

assert.deepEqual(getDirectedSegmentEndpoints(network[0], false), { entryIntersectionId: 10, exitIntersectionId: 11 });
assert.deepEqual(getDirectedSegmentEndpoints(network[0], true), { entryIntersectionId: 11, exitIntersectionId: 10 });
log("continuation points respect forward and reverse segment direction");

const eligible = {
    simulationRunId: 5, status: "MOVING", destinationIntersectionId: 12,
    currentSegmentId: 1, routeSequence: 0, progress: 0,
};
assert.equal(isEligibleVehicleState(eligible, 5), true);
assert.equal(isEligibleVehicleState({ ...eligible, status: "COMPLETED" }, 5), false);
assert.equal(isEligibleVehicleState(eligible, 6), false);
const midSegmentVehicle = { ...eligible, id: 9, progress: 0.42, isReverse: false };
const staleCandidate = { vehicleId: 9, routeSequence: 0, currentSegmentId: 1, destinationIntersectionId: 12, progress: 0.42, isReverse: false };
assert.equal(candidateMatchesVehicleState(staleCandidate, midSegmentVehicle, 5), true);
assert.equal(candidateMatchesVehicleState(staleCandidate, { ...midSegmentVehicle, progress: 0.43 }, 5), false);
assert.equal(candidateMatchesVehicleState(staleCandidate, { ...midSegmentVehicle, routeSequence: 1 }, 5), false);
assert.equal(candidateMatchesVehicleState(staleCandidate, { ...midSegmentVehicle, destinationIntersectionId: 11 }, 5), false);
assert.equal(candidateMatchesVehicleState({ ...staleCandidate, isReverse: true }, midSegmentVehicle, 5), false);
log("mid-segment candidates match exact segment, direction, progress, and destination");
log("completed and unrelated vehicles are skipped");

assert.equal(trafficSnapshotMatchesRun({ simulationRunId: 5, cityId: 2, status: "RUNNING" }, 5, 2), true);
assert.equal(trafficSnapshotMatchesRun({ simulationRunId: 6, cityId: 2, status: "RUNNING" }, 5, 2), false);
assert.equal(trafficSnapshotMatchesRun({ simulationRunId: 5, cityId: 2, status: "PAUSED" }, 5, 2), false);
log("traffic snapshots must match run, city, and running status");

const currentIntersections = [10, 11, 12];
const threshold = { minimumSeconds: 2, minimumPercent: 10 };
const preservedCurrent = [{ segmentId: 1, isReverse: false }, { segmentId: 2, isReverse: false }];
const preservedCandidate = { intersections: [10, 11, 12], segments: [{ segmentId: 1, isReverse: false }, { segmentId: 4, isReverse: false }], estimatedTravelTimeSeconds: 5 };
assert.equal(evaluateCandidate(10, 11, 12, preservedCurrent, currentIntersections, 20, preservedCandidate, network, threshold)?.improvementSeconds, 15);
assert.equal(evaluateCandidate(10, 11, 12, preservedCurrent, currentIntersections, 6, { ...preservedCandidate, estimatedTravelTimeSeconds: 5 }, network, threshold), null);
assert.equal(evaluateCandidate(10, 11, 12, preservedCurrent, currentIntersections, 20, { ...preservedCandidate, segments: preservedCurrent, intersections: currentIntersections }, network, threshold), null);
assert.equal(evaluateCandidate(10, 11, 12, preservedCurrent, currentIntersections, 20, { ...preservedCandidate, intersections: [10, 12, 12] }, network, threshold), null);
assert.equal(evaluateCandidate(10, 11, 12, preservedCurrent, currentIntersections, 20, null, network, threshold), null);
assert.equal(evaluateCandidate(10, 11, 12, preservedCurrent, currentIntersections, null, preservedCandidate, network, threshold), null);
assert.equal(evaluateCandidate(10, 12, 12, preservedCurrent, currentIntersections, 20, preservedCandidate, network, threshold), null);
log("threshold, identical, invalid, and unreachable candidates are rejected");

const originalVehicle = { ...eligible };
const originalCurrentRoute = structuredClone(preservedCurrent);
const originalCandidate = structuredClone(preservedCandidate);
evaluateCandidate(10, 11, 12, preservedCurrent, currentIntersections, 20, preservedCandidate, network, threshold);
assert.deepEqual(eligible, originalVehicle);
assert.deepEqual(preservedCurrent, originalCurrentRoute);
assert.deepEqual(preservedCandidate, originalCandidate);
log("candidate analysis does not mutate vehicle state or route data");

assert.deepEqual(buildRouteSuffixEntries(7, [{ segmentId: 3, isReverse: true }, { segmentId: 4, isReverse: false }]), [
    { segmentId: 3, sequence: 7, isReverse: true },
    { segmentId: 4, sequence: 8, isReverse: false },
]);
log("replacement entries begin exactly at the active route sequence");

let cacheChanged = false;
let eventWritten = false;
try {
    await persistThenSyncRoute(
        async () => { throw new Error("transaction rollback"); },
        () => { cacheChanged = true; return true; },
        async () => { eventWritten = true; },
    );
} catch {
    // Transaction rejection must skip both post-commit effects.
}
assert.equal(cacheChanged, false);
assert.equal(eventWritten, false);
log("transaction rollback leaves cache and events untouched");

const order: string[] = [];
assert.equal(await persistThenSyncRoute(
    async () => { order.push("transaction"); return { ok: true }; },
    () => { order.push("cache"); return true; },
    async () => { order.push("event"); },
), true);
assert.deepEqual(order, ["transaction", "cache", "event"]);
log("cache synchronization precedes successful reroute event creation");

try {
    await withRerouteAttempt("5:1", async () => {
        assert.equal(isRerouteAttemptActive("5:1"), true);
        throw new Error("expected test exception");
    });
} catch {
    // Expected: the guard's finally block must still clear the key.
}
assert.equal(isRerouteAttemptActive("5:1"), false);
log("in-progress guard releases after exceptions");

let releaseFirst!: () => void;
const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });
const firstAttempt = withRerouteAttempt("5:2", async () => { await gate; return "first"; });
const concurrentAttempt = await withRerouteAttempt("5:2", async () => "second");
assert.equal(concurrentAttempt, null);
releaseFirst();
assert.equal(await firstAttempt, "first");
log("concurrent application attempt for one vehicle is rejected");
