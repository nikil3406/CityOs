import "dotenv/config";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    throw new Error("DATABASE_URL must be set in your .env file.");
}

const BASE_URL = process.env.CITYOS_BASE_URL ?? "http://localhost:3000";
const CITY_ID = 1; // Safety lock: this test only uses City 1.
const CACHE_CONTROL_TOKEN = process.env.CITYOS_TEST_CONTROL_TOKEN;
const VEHICLES_TO_SPAWN = 6;
// The vehicle-following service requires an 8 m center-to-center gap.
const VEHICLE_GAP_METERS = 12;
const MIN_APPROACH_LENGTH_METERS = 70;
const TEST_DURATION_SECONDS = 90;
const POLL_INTERVAL_MS = 3_200;

const client = postgres(DATABASE_URL, { max: 1 });

type Approach = {
    segmentId: number;
    roadId: number;
    lengthMeters: number;
    intersectionId: number;
    trafficLightId: number;
    nextSegmentId: number;
    nextRoadId: number;
    redPhase: number;
    greenPhase: number;
};

type MetricsResponse = {
    simulation: {
        id: number;
        cityId: number;
        status: string;
        simulationTime: number;
    };
    metrics: {
        totalVehicles: number;
        activeVehicles: number;
        waitingVehicles: number;
        signalWaitingVehicles: number;
        activeQueues: number;
        maximumQueueVehicles: number;
        averageQueueLengthMeters: number;
    };
};

type CongestionResponse = {
    congestion: Array<{
        segmentId: number;
        roadId: number;
        vehicleCount: number;
        queueVehicleCount: number;
        queueLengthMeters: number;
        congestionLevel: string;
    }>;
};

type EventsResponse = {
    events: Array<{
        id: number;
        type: string;
        simulationTime: number;
        roadId: number | null;
        intersectionId: number | null;
        data: Record<string, unknown> | null;
    }>;
};

function log(message: string) {
    console.log(message);
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, init);
    const body = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(
            `HTTP ${response.status} ${response.statusText} for ${path}: ${JSON.stringify(body)}`,
        );
    }
    return body as T;
}

async function clearServerTrafficLightCache(): Promise<void> {
    assert(
        Boolean(CACHE_CONTROL_TOKEN),
        "Set CITYOS_TEST_CONTROL_TOKEN in .env and in the Next.js server environment before running this test.",
    );

    await fetchJson("/api/test/traffic-light-cache/clear", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${CACHE_CONTROL_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ cityId: CITY_ID }),
    });
    log(`Cleared the Next.js server's in-memory traffic-light cache for City ${CITY_ID}.`);
}

async function findApproach(): Promise<Approach> {
    // Fixed target: traffic light 3, road 104 -> road 71, segment 241 -> segment 231.
    const rows = await client`
        SELECT
            rs.id AS "segmentId",
            rs.road_id AS "roadId",
            rs.length_meters AS "lengthMeters",
            rs.end_intersection_id AS "intersectionId",
            tl.id AS "trafficLightId",
            next_rs.id AS "nextSegmentId",
            next_rs.road_id AS "nextRoadId"
        FROM road_segments rs
        JOIN traffic_lights tl
          ON tl.intersection_id = rs.end_intersection_id
        JOIN road_segments next_rs
          ON next_rs.start_intersection_id = rs.end_intersection_id
        WHERE tl.city_id = ${CITY_ID}
          AND tl.id = 3
          AND rs.id = 241
          AND rs.road_id = 104
          AND next_rs.id = 231
          AND next_rs.road_id = 71
        LIMIT 1
    `;

    assert(
        rows.length === 1,
        "Expected traffic light 3 and route segment 241 (road 104) -> segment 231 (road 71) were not found. No simulation was created.",
    );

    const row = rows[0];
    const movementRows = await client`
        SELECT
            p.phase_number AS "phaseNumber",
            p.duration_seconds AS "durationSeconds",
            m.state
        FROM traffic_light_phases p
        JOIN traffic_light_movements m
          ON m.traffic_light_id = p.traffic_light_id
         AND m.phase_number = p.phase_number
        WHERE p.traffic_light_id = 3
          AND m.from_road_id = 104
          AND m.to_road_id = 71
        ORDER BY p.phase_number
    `;
    const configuredPhases = movementRows.map((row: any) => ({
        phase: Number(row.phaseNumber),
        duration: Number(row.durationSeconds),
        state: String(row.state).toUpperCase(),
    }));
    assert(
        configuredPhases.length >= 2,
        "The selected movement needs configured traffic-light phases. No phase or movement configuration was changed.",
    );

    // Start in a long RED phase that leads directly to GREEN for this exact
    // road-to-road movement. Avoid a phase sequence that would begin at green.
    const redGreenWindows = configuredPhases.flatMap((phase, index) => {
        if (phase.state !== "RED" || phase.duration < 10) return [];
        for (let offset = 1; offset < configuredPhases.length; offset++) {
            const next = configuredPhases[(index + offset) % configuredPhases.length];
            if (next.state === "GREEN") {
                return [{ redPhase: phase.phase, greenPhase: next.phase, redDuration: phase.duration }];
            }
            if (next.state !== "RED") break;
        }
        return [];
    }).sort((a, b) => b.redDuration - a.redDuration);
    assert(
        redGreenWindows.length > 0,
        "No configured RED-then-GREEN phase sequence exists for movement 104 -> 71. No signal configuration was changed.",
    );
    const { redPhase, greenPhase } = redGreenWindows[0];

    return {
        segmentId: Number(row.segmentId),
        roadId: Number(row.roadId),
        lengthMeters: Number(row.lengthMeters),
        intersectionId: Number(row.intersectionId),
        trafficLightId: Number(row.trafficLightId),
        nextSegmentId: Number(row.nextSegmentId),
        nextRoadId: Number(row.nextRoadId),
        redPhase,
        greenPhase,
    };
}

async function snapshotTrafficLights() {
    // Snapshot dynamic state only; the test never updates phase/movement configuration.
    return await client`
        SELECT id, current_phase, phase_elapsed, status
        FROM traffic_lights
        WHERE city_id = ${CITY_ID}
        ORDER BY id
    `;
}

async function restoreTrafficLights(snapshot: any[]) {
    for (const light of snapshot) {
        await client`
            UPDATE traffic_lights
            SET current_phase = ${light.current_phase},
                phase_elapsed = ${light.phase_elapsed},
                status = ${light.status}
            WHERE id = ${light.id}
              AND city_id = ${CITY_ID}
        `;
    }
}

/**
 * Set the selected traffic light's runtime phase to the selected red phase.
 * This only updates traffic_lights.current_phase/phase_elapsed; it does not
 * insert, update, or delete any traffic_light_phases or traffic_light_movements rows.
 */
async function setApproachToRedPhase(approach: Approach): Promise<number> {
    const rows = await client`
        SELECT phase_number AS "phaseNumber"
        FROM traffic_light_phases
        WHERE traffic_light_id = ${approach.trafficLightId}
          AND phase_number = ${approach.redPhase}
        LIMIT 1
    `;

    assert(
        rows.length > 0,
        `Traffic light ${approach.trafficLightId} has no existing phase ${approach.redPhase}. No phase configuration was changed.`,
    );

    const phaseNumber = Number(rows[0].phaseNumber);

    // The runtime intentionally treats an intersection without an ACTIVE
    // light as uncontrolled (GREEN). Make this test's light the sole active
    // controller at the selected intersection for the duration of the run.
    await client`
        UPDATE traffic_lights
        SET status = 'INACTIVE'
        WHERE city_id = ${CITY_ID}
          AND intersection_id = ${approach.intersectionId}
          AND id <> ${approach.trafficLightId}
          AND status = 'ACTIVE'
    `;

    const updated = await client`
        UPDATE traffic_lights
        SET current_phase = ${phaseNumber},
            phase_elapsed = 0,
            status = 'ACTIVE'
        WHERE id = ${approach.trafficLightId}
          AND city_id = ${CITY_ID}
        RETURNING id
    `;

    assert(
        updated.length === 1,
        `Could not activate traffic light ${approach.trafficLightId} in red phase ${phaseNumber}.`,
    );

    return phaseNumber;
}

async function ensureNoRunningSimulation() {
    const rows = await client`
        SELECT id, status
        FROM simulation_runs
        WHERE city_id = ${CITY_ID}
          AND status = 'RUNNING'
        LIMIT 5
    `;

    assert(
        rows.length === 0,
        `City ${CITY_ID} already has a RUNNING simulation (${rows.map((r: any) => r.id).join(", ")}). Stop it first; this test will not run alongside another simulation.`,
    );
}

async function createSimulation(): Promise<number> {
    const data = await fetchJson<{ id: number }>("/api/simulation/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cityId: CITY_ID }),
    });

    const id = Number(data.id);
    assert(Number.isInteger(id) && id > 0, "Simulation API did not return a valid run ID.");
    return id;
}

async function spawnVehicles(simulationId: number, approach: Approach) {
    const spawnedIds: number[] = [];

    for (let i = 0; i < VEHICLES_TO_SPAWN; i++) {
        // The lead vehicle starts 2 m from the intersection; each follower
        // starts 12 m farther back to preserve the safe following gap.
        const distanceFromSignal = 2 + i * VEHICLE_GAP_METERS;
        const progress = Math.max(
            0.05,
            1 - distanceFromSignal / approach.lengthMeters,
        );

        const positionRows = await client`
            SELECT ST_AsGeoJSON(
                ST_LineInterpolatePoint(geometry, ${progress})
            )::json AS position
            FROM road_segments
            WHERE id = ${approach.segmentId}
        `;

        assert(positionRows.length === 1, `Could not calculate position for segment ${approach.segmentId}.`);
        const position = positionRows[0].position;

        const inserted = await client`
            INSERT INTO vehicles (
                simulation_run_id,
                current_road_id,
                current_segment_id,
                destination_intersection_id,
                route_sequence,
                position,
                speed_kmh,
                progress,
                status
            )
            VALUES (
                ${simulationId},
                ${approach.roadId},
                ${approach.segmentId},
                ${approach.intersectionId},
                0,
                ST_SetSRID(
                    ST_GeomFromGeoJSON(${JSON.stringify(position)}),
                    4326
                ),
                0,
                ${progress},
                'WAITING'
            )
            RETURNING id
        `;

        const vehicleId = Number(inserted[0].id);
        await client`
            INSERT INTO vehicle_routes (vehicle_id, segment_id, sequence, is_reverse)
            VALUES
                (${vehicleId}, ${approach.segmentId}, 0, false),
                (${vehicleId}, ${approach.nextSegmentId}, 1, false)
        `;
        spawnedIds.push(vehicleId);
    }

    return spawnedIds;
}

async function getMetrics(simulationId: number) {
    return fetchJson<MetricsResponse>(`/api/simulation/runs/${simulationId}/metrics`);
}

async function getCongestion(simulationId: number) {
    return fetchJson<CongestionResponse>(`/api/simulation/runs/${simulationId}/congestion`);
}

async function getEvents(simulationId: number) {
    return fetchJson<EventsResponse>(`/api/simulation/runs/${simulationId}/events`);
}

async function startSimulation(simulationId: number) {
    await fetchJson(`/api/simulation/runs/${simulationId}/start`, { method: "POST" });
}

async function stopSimulation(simulationId: number) {
    try {
        await fetchJson(`/api/simulation/runs/${simulationId}/stop`, { method: "POST" });
    } catch (error) {
        log(`WARNING: API stop failed: ${String(error)}`);
    }
}

async function getApproachSignalState(approach: Approach): Promise<string> {
    const rows = await client`
        SELECT m.state
        FROM traffic_lights tl
        JOIN traffic_light_movements m
          ON m.traffic_light_id = tl.id
         AND m.phase_number = tl.current_phase
        WHERE tl.id = ${approach.trafficLightId}
          AND m.from_road_id = ${approach.roadId}
          AND m.to_road_id = ${approach.nextRoadId}
        LIMIT 1
    `;
    assert(rows.length === 1, "Could not read the active signal for the tested movement.");
    return String(rows[0].state).toUpperCase();
}

async function main() {
    let simulationId: number | undefined;
    let trafficLightSnapshot: any[] = [];
    let snapshotTaken = false;
    let testPassed = false;

    try {
        log("=".repeat(72));
        log("CITYOS — QUEUE SYSTEM TEST NEAR A TRAFFIC LIGHT");
        log("=".repeat(72));
        log(`Safety scope: City ${CITY_ID} only`);
        log("No traffic_light_phases or traffic_light_movements rows will be inserted, updated, or deleted.");
        log("The test clears the server-side City 1 traffic-light cache before setting up the scenario.");
        log("The test temporarily activates traffic light 3 in a configured RED phase for movement 104 -> 71, then restores all saved City 1 light states.");
        log("This test adds a new simulation run, vehicles, and vehicle_routes rows.");

        await ensureNoRunningSimulation();
        trafficLightSnapshot = await snapshotTrafficLights();
        snapshotTaken = true;

        // Clear the cache in the Next.js server process BEFORE creating the test scenario.
        // The server-side endpoint is required because this script runs in a separate Node process.
        await clearServerTrafficLightCache();

        const approach = await findApproach();
        log(`\nSelected approach: segment ${approach.segmentId}, road ${approach.roadId}`);
        log(`Intersection ${approach.intersectionId}, traffic light ${approach.trafficLightId}`);
        log(`Test movement: RED phase ${approach.redPhase} -> GREEN phase ${approach.greenPhase}`);
        log(`Segment length: ${approach.lengthMeters.toFixed(1)}m`);
        assert(
            approach.lengthMeters >= MIN_APPROACH_LENGTH_METERS,
            `Selected approach is too short for ${VEHICLES_TO_SPAWN} vehicles with ${VEHICLE_GAP_METERS}m spacing (${approach.lengthMeters.toFixed(1)}m available). No vehicles were inserted.`,
        );
        log(`Saved dynamic state for ${trafficLightSnapshot.length} City ${CITY_ID} traffic light(s).`);

        simulationId = await createSimulation();
        log(`\nCreated new simulation run ${simulationId}.`);

        const vehicleIds = await spawnVehicles(simulationId, approach);
        log(`Spawned ${vehicleIds.length} test vehicles near the selected signal.`);
        log(`Vehicle IDs: ${vehicleIds.join(", ")}`);

        const phaseNumber = await setApproachToRedPhase(approach);
        log(`Activated traffic light ${approach.trafficLightId} in RED phase ${phaseNumber} for the test.`);

        await startSimulation(simulationId);
        log("Simulation started. Monitoring queue formation and clearing...");

        const startedAt = Date.now();
        const seenEventIds = new Set<number>();
        let observedQueue = false;
        let observedQueueStartedEvent = false;
        let observedQueueClearedEvent = false;
        let observedGreenMovement = false;
        let observedRedStop = false;
        let crossedOnRed = false;
        const vehiclesSeenCrossingOnGreen = new Set<number>();
        let previousSimulationTime = -1;
        let latestMetrics: MetricsResponse | undefined;
        let latestCongestion: CongestionResponse | undefined;

        while (Date.now() - startedAt < TEST_DURATION_SECONDS * 1000) {
            await wait(POLL_INTERVAL_MS);

            const [metrics, congestion, events] = await Promise.all([
                getMetrics(simulationId),
                getCongestion(simulationId),
                getEvents(simulationId),
            ]);

            latestMetrics = metrics;
            latestCongestion = congestion;

            assert(metrics.simulation.cityId === CITY_ID, "Simulation escaped the City 1 safety scope.");
            assert(
                metrics.simulation.simulationTime >= previousSimulationTime,
                "Simulation time moved backwards.",
            );
            previousSimulationTime = metrics.simulation.simulationTime;

            const queuedSegments = congestion.congestion.filter(
                (segment) => segment.queueVehicleCount >= 2,
            );
            if (queuedSegments.length > 0 || metrics.metrics.activeQueues > 0) {
                observedQueue = true;
            }

            for (const event of events.events) {
                if (seenEventIds.has(event.id)) continue;
                seenEventIds.add(event.id);

                if (event.type === "TRAFFIC_QUEUE_STARTED") {
                    observedQueueStartedEvent = true;
                }
                if (event.type === "TRAFFIC_QUEUE_CLEARED") {
                    observedQueueClearedEvent = true;
                }

                if (
                    event.type === "TRAFFIC_QUEUE_STARTED" ||
                    event.type === "TRAFFIC_QUEUE_CLEARED"
                ) {
                    log(
                        `EVENT ${event.type} at t=${event.simulationTime}s` +
                        `${event.roadId == null ? "" : `, road=${event.roadId}`}`,
                    );
                }
            }

            const moving = await fetchJson<Array<{
                id: number;
                routeSequence: number;
                speedKmh: number;
                status: string;
            }>>(
                `/api/simulation/runs/${simulationId}/vehicles`,
            );
            const testVehicles = moving.filter((vehicle) => vehicleIds.includes(Number(vehicle.id)));
            const signalState = await getApproachSignalState(approach);
            const vehiclesPastIntersection = testVehicles.filter((vehicle) => Number(vehicle.routeSequence) > 0);

            if (signalState === "RED") {
                if (testVehicles.some((vehicle) => vehicle.status === "WAITING_AT_SIGNAL")) {
                    observedRedStop = true;
                }
                if (vehiclesPastIntersection.some((vehicle) => !vehiclesSeenCrossingOnGreen.has(Number(vehicle.id)))) {
                    crossedOnRed = true;
                }
            }

            if (signalState === "GREEN" && vehiclesPastIntersection.length > 0) {
                observedGreenMovement = true;
                for (const vehicle of vehiclesPastIntersection) {
                    vehiclesSeenCrossingOnGreen.add(Number(vehicle.id));
                }
            }

            const largestQueue = queuedSegments.reduce(
                (largest, segment) => Math.max(largest, segment.queueVehicleCount),
                0,
            );
            const maxQueueLength = queuedSegments.reduce(
                (largest, segment) => Math.max(largest, segment.queueLengthMeters),
                0,
            );

            log(
                `t=${metrics.simulation.simulationTime}s | ` +
                `status=${metrics.simulation.status} | ` +
                `activeQueues=${metrics.metrics.activeQueues} | ` +
                `signalWaiting=${metrics.metrics.signalWaitingVehicles} | ` +
                `signal=${signalState} | ` +
                `crossed=${vehiclesPastIntersection.length} | ` +
                `largestQueue=${largestQueue} vehicle(s) | ` +
                `queueLength=${maxQueueLength.toFixed(1)}m`,
            );

            if (metrics.simulation.status !== "RUNNING") {
                log(`Simulation stopped unexpectedly with status ${metrics.simulation.status}.`);
                break;
            }
        }

        log("\n--- RESULT ---");
        log(`Simulation run: ${simulationId}`);
        log(`Queue observed: ${observedQueue ? "YES" : "NO"}`);
        log(`TRAFFIC_QUEUE_STARTED event: ${observedQueueStartedEvent ? "YES" : "NO"}`);
        log(`TRAFFIC_QUEUE_CLEARED event: ${observedQueueClearedEvent ? "YES" : "NO"}`);
        log(`Stopped at red: ${observedRedStop ? "YES" : "NO"}`);
        log(`Passed during green: ${observedGreenMovement ? "YES" : "NO"}`);
        log(`Passed during red: ${crossedOnRed ? "YES" : "NO"}`);

        if (latestMetrics) {
            log(`Total vehicles: ${latestMetrics.metrics.totalVehicles}`);
            log(`Active queues at last sample: ${latestMetrics.metrics.activeQueues}`);
            log(`Maximum queue vehicles: ${latestMetrics.metrics.maximumQueueVehicles}`);
            log(`Average queue length: ${latestMetrics.metrics.averageQueueLengthMeters}m`);
        }

        if (latestCongestion) {
            const rows = latestCongestion.congestion
                .filter((segment) => segment.queueVehicleCount > 0)
                .map((segment) => ({
                    segmentId: segment.segmentId,
                    roadId: segment.roadId,
                    queuedVehicles: segment.queueVehicleCount,
                    queueLengthMeters: segment.queueLengthMeters,
                    congestionLevel: segment.congestionLevel,
                }));
            log(`Segments with queues in final sample: ${JSON.stringify(rows)}`);
        }

        assert(observedQueue, "No queue was detected during the test window.");
        assert(
            observedQueueStartedEvent,
            "Queue metrics indicated a queue, but TRAFFIC_QUEUE_STARTED was not recorded.",
        );
        assert(observedRedStop, "No test vehicle was observed waiting at the selected red signal.");
        assert(!crossedOnRed, "A test vehicle crossed the selected intersection while its movement was RED.");
        assert(observedGreenMovement, "No test vehicle was observed crossing after its movement received GREEN.");

        if (!observedQueueClearedEvent) {
            log("NOTE: Queue-cleared event was not observed within this window; this is reported separately rather than treated as a hard failure.");
        }
        testPassed = true;
        log("\nPASS: vehicles queued during RED and crossed only after GREEN.");
    } finally {
        if (simulationId !== undefined) {
            await stopSimulation(simulationId);
        }

        // The engine may advance live signal state while running. Restore the exact
        // pre-test phase/elapsed/status snapshot after the test run has stopped.
        if (snapshotTaken) {
            try {
                await restoreTrafficLights(trafficLightSnapshot);
                log(`\nRestored dynamic state for City ${CITY_ID} traffic lights.`);
            } catch (error) {
                log(`\nWARNING: Could not restore all traffic-light dynamic state: ${String(error)}`);
            }
        }

        await client.end({ timeout: 5 }).catch(() => undefined);
        if (!testPassed) {
            log("\nTest did not pass. Review the error above before running it again.");
        }
    }
}

main().catch((error) => {
    console.error("\nQUEUE TEST FAILED:", error);
    process.exitCode = 1;
});
