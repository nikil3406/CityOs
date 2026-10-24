import assert from "node:assert/strict";

import {
    findRouteOnNetwork,
    type NetworkSegment,
} from "../src/modules/road/routing.service";
import type { SimulationTrafficSnapshot } from "../src/modules/road/simulation_traffic_snapshot.service";
import {
    signalSnapshotBelongsToRun,
    simulationStatusUsesLiveTraffic,
} from "../src/modules/road/simulation_traffic_snapshot.service";
import { buildVehicleRouteRows } from "../src/modules/vehicle/vehicle.service";

function test(name: string, run: () => void) {
    run();
    console.log(`PASS ${name}`);
}

function segment(
    id: number,
    roadId: number,
    startIntersectionId: number,
    endIntersectionId: number,
    lengthMeters: number,
    speedLimitKmh: number | null = 36,
): NetworkSegment {
    return { id, roadId, startIntersectionId, endIntersectionId, lengthMeters, speedLimitKmh, sequence: 0 };
}

function snapshot(
    vehicles: SimulationTrafficSnapshot["vehicles"] = [],
    signals: SimulationTrafficSnapshot["signals"] = [],
): SimulationTrafficSnapshot {
    return { simulationRunId: 77, cityId: 1, status: "RUNNING", simulationTime: 120, vehicles, signals };
}

test("shortest-distance routing keeps distance as its cost even with traffic data", () => {
    const network = [
        segment(1, 1, 1, 2, 40), segment(2, 2, 2, 4, 40),
        segment(3, 3, 1, 3, 80), segment(4, 4, 3, 4, 80),
    ];
    const traffic = snapshot(Array.from({ length: 8 }, (_, index) => ({
        segmentId: 1, isReverse: false, speedKmh: 1, progress: index / 10, status: "MOVING",
    })));

    const route = findRouteOnNetwork(network, 1, 4, "SHORTEST_DISTANCE", traffic);

    assert.deepEqual(route?.segments.map((item) => item.segmentId), [1, 2]);
    assert.equal(route?.totalDistanceMeters, 80);
});

test("static fastest-time routing can select a longer route with faster speed limits", () => {
    const network = [
        segment(1, 1, 1, 2, 100, 10), segment(2, 2, 2, 4, 100, 10),
        segment(3, 3, 1, 3, 140, 60), segment(4, 4, 3, 4, 140, 60),
    ];

    const route = findRouteOnNetwork(network, 1, 4, "FASTEST_TIME");

    assert.deepEqual(route?.segments.map((item) => item.segmentId), [3, 4]);
    assert.equal(route?.totalDistanceMeters, 280);
});

test("observed congestion can make the fastest route use an alternative", () => {
    const network = [
        segment(1, 1, 1, 2, 100, 36), segment(2, 2, 2, 4, 100, 36),
        segment(3, 3, 1, 3, 130, 36), segment(4, 4, 3, 4, 130, 36),
    ];
    const traffic = snapshot(Array.from({ length: 3 }, (_, index) => ({
        segmentId: 1, isReverse: false, speedKmh: 3, progress: index / 10, status: "MOVING",
    })));

    const route = findRouteOnNetwork(network, 1, 4, "FASTEST_TIME", traffic);

    assert.deepEqual(route?.segments.map((item) => item.segmentId), [3, 4]);
    assert.equal(route?.trafficEstimate?.source, "LIVE_OBSERVED");
});

test("movement-specific red signal delay can make the route choose another junction", () => {
    const network = [
        segment(1, 11, 1, 2, 100, 36), segment(2, 12, 2, 4, 100, 36),
        segment(3, 13, 1, 3, 130, 36), segment(4, 14, 3, 4, 130, 36),
    ];
    const traffic = snapshot([], [{
        id: 9,
        intersectionId: 2,
        currentPhase: 1,
        phaseElapsed: 0,
        status: "ACTIVE",
        phases: [{ phaseNumber: 1, durationSeconds: 12 }, { phaseNumber: 2, durationSeconds: 18 }],
        movements: [
            { phaseNumber: 1, fromRoadId: 11, toRoadId: 12, state: "RED" },
            { phaseNumber: 2, fromRoadId: 11, toRoadId: 12, state: "GREEN" },
        ],
    }]);

    const route = findRouteOnNetwork(network, 1, 4, "FASTEST_TIME", traffic);

    assert.deepEqual(route?.segments.map((item) => item.segmentId), [3, 4]);
    assert.equal(route?.trafficEstimate?.source, "LIVE_SIGNAL");
    assert.equal(route?.trafficEstimate?.signalDelaySeconds, 0);
});

test("a supported red movement reports its waiting-time estimate", () => {
    const network = [segment(1, 11, 1, 2, 100), segment(2, 12, 2, 3, 100)];
    const traffic = snapshot([], [{
        id: 9,
        intersectionId: 2,
        currentPhase: 1,
        phaseElapsed: 0,
        status: "ACTIVE",
        phases: [{ phaseNumber: 1, durationSeconds: 12 }, { phaseNumber: 2, durationSeconds: 18 }],
        movements: [
            { phaseNumber: 1, fromRoadId: 11, toRoadId: 12, state: "RED" },
            { phaseNumber: 2, fromRoadId: 11, toRoadId: 12, state: "GREEN" },
        ],
    }]);

    const route = findRouteOnNetwork(network, 1, 3, "FASTEST_TIME", traffic);

    assert.equal(route?.trafficEstimate?.signalDelaySeconds, 12);
    assert.equal(route?.estimatedTravelTimeSeconds, 32);
});

test("a measured approach speed suppresses a duplicate signal delay", () => {
    const network = [segment(1, 11, 1, 2, 100), segment(2, 12, 2, 3, 100)];
    const traffic = snapshot(Array.from({ length: 3 }, (_, index) => ({
        segmentId: 1, isReverse: false, speedKmh: 18, progress: index / 10, status: "MOVING",
    })), [{
        id: 9,
        intersectionId: 2,
        currentPhase: 1,
        phaseElapsed: 0,
        status: "ACTIVE",
        phases: [{ phaseNumber: 1, durationSeconds: 12 }, { phaseNumber: 2, durationSeconds: 18 }],
        movements: [
            { phaseNumber: 1, fromRoadId: 11, toRoadId: 12, state: "RED" },
            { phaseNumber: 2, fromRoadId: 11, toRoadId: 12, state: "GREEN" },
        ],
    }]);

    const route = findRouteOnNetwork(network, 1, 3, "FASTEST_TIME", traffic);

    assert.equal(route?.trafficEstimate?.observedSpeedSegments, 1);
    assert.equal(route?.trafficEstimate?.signalDelaySeconds, 0);
});

test("a detected queue adds a measured-extent heuristic and suppresses duplicate signal delay", () => {
    const network = [segment(1, 11, 1, 2, 100), segment(2, 12, 2, 3, 100)];
    const traffic = snapshot([
        { segmentId: 1, isReverse: false, speedKmh: 0, progress: 0.70, status: "WAITING_AT_SIGNAL" },
        { segmentId: 1, isReverse: false, speedKmh: 0, progress: 0.80, status: "WAITING_AT_SIGNAL" },
    ], [{
        id: 9,
        intersectionId: 2,
        currentPhase: 1,
        phaseElapsed: 0,
        status: "ACTIVE",
        phases: [{ phaseNumber: 1, durationSeconds: 12 }, { phaseNumber: 2, durationSeconds: 18 }],
        movements: [
            { phaseNumber: 1, fromRoadId: 11, toRoadId: 12, state: "RED" },
            { phaseNumber: 2, fromRoadId: 11, toRoadId: 12, state: "GREEN" },
        ],
    }]);

    const route = findRouteOnNetwork(network, 1, 3, "FASTEST_TIME", traffic);

    assert.equal(route?.trafficEstimate?.heuristicSegments, 1);
    assert.equal(route?.trafficEstimate?.signalDelaySeconds, 0);
    assert.ok((route?.estimatedTravelTimeSeconds ?? 0) > (200 * 3.6 / 36));
});

test("reverse traversal uses reverse-direction observations and missing limits use 30 km/h", () => {
    const network = [segment(1, 1, 1, 2, 300, null)];
    const traffic = snapshot(Array.from({ length: 3 }, (_, index) => ({
        segmentId: 1, isReverse: false, speedKmh: 1, progress: index / 10, status: "MOVING",
    })));

    const route = findRouteOnNetwork(network, 2, 1, "FASTEST_TIME", traffic);

    assert.deepEqual(route?.segments, [{ segmentId: 1, isReverse: true }]);
    assert.equal(route?.estimatedTravelTimeUsesDefaultSpeedLimit, true);
    assert.equal(route?.trafficEstimate?.source, "STATIC");
    assert.equal(route?.estimatedTravelTimeSeconds, 36);
    const invalidLimitRoute = findRouteOnNetwork([segment(2, 2, 1, 2, 300, 0)], 1, 2, "FASTEST_TIME");
    assert.equal(invalidLimitRoute?.estimatedTravelTimeSeconds, 36);
    assert.equal(invalidLimitRoute?.estimatedTravelTimeUsesDefaultSpeedLimit, true);
});

test("paused runs use their last traffic snapshot, while stopped/completed runs use static routing", () => {
    assert.equal(simulationStatusUsesLiveTraffic("PAUSED"), true);
    assert.equal(simulationStatusUsesLiveTraffic("RUNNING"), true);
    assert.equal(simulationStatusUsesLiveTraffic("STOPPED"), false);
    assert.equal(simulationStatusUsesLiveTraffic("COMPLETED"), false);
    const pausedAt = new Date("2026-10-24T10:00:00.000Z");
    assert.equal(signalSnapshotBelongsToRun("PAUSED", pausedAt, new Date("2026-10-24T09:59:00.000Z")), true);
    assert.equal(signalSnapshotBelongsToRun("PAUSED", pausedAt, new Date("2026-10-24T10:01:00.000Z")), false);
    assert.equal(signalSnapshotBelongsToRun("RUNNING", pausedAt, new Date("2026-10-24T10:01:00.000Z")), true);
});

test("traffic snapshots from separate runs stay isolated and paused speed samples remain usable", () => {
    const network = [
        segment(1, 1, 1, 2, 100, 36), segment(2, 2, 2, 4, 100, 36),
        segment(3, 3, 1, 3, 130, 36), segment(4, 4, 3, 4, 130, 36),
    ];
    const slowPaused = {
        ...snapshot(Array.from({ length: 3 }, (_, index) => ({
            segmentId: 1, isReverse: false, speedKmh: 2, progress: index / 10, status: "MOVING",
        }))),
        simulationRunId: 78,
        status: "PAUSED",
    } satisfies SimulationTrafficSnapshot;
    const emptyRun = { ...snapshot(), simulationRunId: 79 };

    const pausedRoute = findRouteOnNetwork(network, 1, 4, "FASTEST_TIME", slowPaused);
    const otherRunRoute = findRouteOnNetwork(network, 1, 4, "FASTEST_TIME", emptyRun);

    assert.deepEqual(pausedRoute?.segments.map((item) => item.segmentId), [3, 4]);
    assert.equal(pausedRoute?.trafficEstimate?.simulationRunId, 78);
    assert.deepEqual(otherRunRoute?.segments.map((item) => item.segmentId), [1, 2]);
    assert.equal(otherRunRoute?.trafficEstimate?.simulationRunId, 79);
});

test("unreachable destinations and unsupported signal movements add no inferred path or delay", () => {
    const network = [segment(1, 11, 1, 2, 100)];
    const unreachable = findRouteOnNetwork(network, 1, 99, "FASTEST_TIME");
    const noSignalPlan = snapshot([], [{
        id: 9,
        intersectionId: 2,
        currentPhase: 1,
        phaseElapsed: 0,
        status: "ACTIVE",
        phases: [{ phaseNumber: 1, durationSeconds: 15 }],
        movements: [],
    }]);
    const route = findRouteOnNetwork(
        [segment(1, 11, 1, 2, 100), segment(2, 12, 2, 3, 100)],
        1,
        3,
        "FASTEST_TIME",
        noSignalPlan,
    );

    assert.equal(unreachable, null);
    assert.equal(route?.trafficEstimate?.signalDelaySeconds, 0);
    assert.equal(route?.estimatedTravelTimeSeconds, 20);
});

test("vehicle route persistence preserves the selected segment order and reverse flags", () => {
    const selected = [
        { segmentId: 31, isReverse: true },
        { segmentId: 18, isReverse: false },
        { segmentId: 44, isReverse: true },
    ];

    assert.deepEqual(buildVehicleRouteRows(501, selected), [
        { vehicleId: 501, segmentId: 31, sequence: 0, isReverse: true },
        { vehicleId: 501, segmentId: 18, sequence: 1, isReverse: false },
        { vehicleId: 501, segmentId: 44, sequence: 2, isReverse: true },
    ]);
});
