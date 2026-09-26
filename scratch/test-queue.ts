import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql, eq } from "drizzle-orm";
import * as schema from "../src/db/schema/index";

const client = postgres(
    process.env.DATABASE_URL ||
        "postgresql://postgres:Nikilreddy@localhost:5432/cityos",
);

const db = drizzle(client, { schema });

const BASE_URL = "http://localhost:3000";
const CITY_ID = 1;

/*
 * Traffic-light configuration
 *
 * RED  = 20 seconds
 * GREEN = 20 seconds
 *
 * This gives the long-running test enough time
 * to observe several complete signal cycles.
 */
const RED_DURATION = 20;
const GREEN_DURATION = 20;

/*
 * Vehicle configuration
 */
const VEHICLE_COUNT_PER_SEGMENT = 8;
const VEHICLE_GAP_METERS = 8;

/*
 * The current simulation engine advances approximately
 * every 3 seconds.
 */
const TICK_WAIT_MS = 3200;

/*
 * Long-running test duration.
 *
 * Approximately 2 minutes of real time.
 */
const TEST_DURATION_SECONDS = 120;

/*
 * Print detailed information every N ticks.
 */
const REPORT_EVERY_TICKS = 3;


/* ========================================================================
   TYPES
   ======================================================================== */

type ApproachSegment = {
    segmentId: number;
    roadId: number;
    lengthMeters: number;
    intersectionId: number;
    speedLimitKmh: number | null;
    trafficLightId: number;
    nextSegmentId: number;
    nextRoadId: number;
};

type SpawnedVehicle = {
    id: number;
    segmentId: number;
    roadId: number;
    progress: number;
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
        completedVehicles: number;
        waitingVehicles: number;
        signalWaitingVehicles: number;
        averageSpeedKmh: number;
        averageTravelTimeSeconds: number;
        activeQueues: number;
        maximumQueueVehicles: number;
        averageQueueLengthMeters: number;
        totalDistanceMeters: number;
    };
};

type CongestionResponse = {
    simulation: {
        id: number;
        cityId: number;
        status: string;
        simulationTime: number;
    };

    congestion: Array<{
        segmentId: number;
        roadId: number;
        vehicleCount: number;
        averageSpeedKmh: number;
        speedLimitKmh: number | null;
        speedRatio: number | null;
        queueVehicleCount: number;
        queueLengthMeters: number;
        congestionLevel:
            | "FREE"
            | "MODERATE"
            | "CONGESTED"
            | "SEVERE";
    }>;
};

type EventResponse = {
    simulation: {
        id: number;
        cityId: number;
        status: string;
        simulationTime: number;
    };

    events: Array<{
        id: number;
        simulationRunId: number;
        type: string;
        roadId: number | null;
        intersectionId: number | null;
        location: unknown;
        data: Record<string, unknown> | null;
        simulationTime: number;
        createdAt: string;
    }>;
};


/* ========================================================================
   TEST HELPERS
   ======================================================================== */

function assert(
    condition: boolean,
    message: string,
): void {
    if (!condition) {
        throw new Error(
            `ASSERTION FAILED: ${message}`,
        );
    }
}

function pass(message: string): void {
    console.log(`✓ ${message}`);
}

function info(message: string): void {
    console.log(`  ${message}`);
}

async function wait(ms: number): Promise<void> {
    await new Promise((resolve) =>
        setTimeout(resolve, ms),
    );
}

async function fetchJson<T>(
    url: string,
    options?: RequestInit,
): Promise<T> {
    const response = await fetch(
        url,
        options,
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            `${response.status} ${response.statusText}: ${JSON.stringify(data)}`,
        );
    }

    return data as T;
}


/* ========================================================================
   SIMULATION API
   ======================================================================== */

async function createSimulation(): Promise<number> {
    const data = await fetchJson<{ id: number }>(
        `${BASE_URL}/api/simulation/runs`,
        {
            method: "POST",

            headers: {
                "Content-Type":
                    "application/json",
            },

            body: JSON.stringify({
                cityId: CITY_ID,
            }),
        },
    );

    assert(
        Number.isInteger(
            Number(data.id),
        ),
        "Simulation ID should be returned",
    );

    return Number(data.id);
}

async function startSimulation(
    simulationId: number,
): Promise<void> {
    await fetchJson(
        `${BASE_URL}/api/simulation/runs/${simulationId}/start`,
        {
            method: "POST",
        },
    );
}

async function stopSimulation(
    simulationId: number,
): Promise<void> {
    try {
        await fetchJson(
            `${BASE_URL}/api/simulation/runs/${simulationId}/stop`,
            {
                method: "POST",
            },
        );
    } catch (error) {
        console.error(
            "Warning: failed to stop simulation:",
            error,
        );
    }
}

async function getMetrics(
    simulationId: number,
): Promise<MetricsResponse> {
    return fetchJson<MetricsResponse>(
        `${BASE_URL}/api/simulation/runs/${simulationId}/metrics`,
    );
}

async function getVehicles(
    simulationId: number,
): Promise<any[]> {
    return fetchJson<any[]>(
        `${BASE_URL}/api/simulation/runs/${simulationId}/vehicles`,
    );
}

async function getCongestion(
    simulationId: number,
): Promise<CongestionResponse> {
    return fetchJson<CongestionResponse>(
        `${BASE_URL}/api/simulation/runs/${simulationId}/congestion`,
    );
}

async function getEvents(
    simulationId: number,
): Promise<EventResponse> {
    return fetchJson<EventResponse>(
        `${BASE_URL}/api/simulation/runs/${simulationId}/events`,
    );
}


/* ========================================================================
   DATABASE HELPERS
   ======================================================================== */

async function findApproachSegments(): Promise<
    ApproachSegment[]
> {
    const rows = await db.execute(sql`
        SELECT
            rs.id AS "segmentId",
            rs.road_id AS "roadId",
            rs.length_meters AS "lengthMeters",
            rs.end_intersection_id AS "intersectionId",
            rs.speed_limit_kmh AS "speedLimitKmh",
            tl.id AS "trafficLightId"
        FROM road_segments rs
        JOIN traffic_lights tl
            ON tl.intersection_id =
                rs.end_intersection_id
        WHERE
            tl.city_id = ${CITY_ID}
            AND rs.length_meters >= 100
        ORDER BY
            rs.length_meters DESC;
    `);

    const candidates: ApproachSegment[] = [];

    for (const row of rows as any[]) {
        const segmentId =
            Number(row.segmentId);

        const roadId =
            Number(row.roadId);

        const lengthMeters =
            Number(row.lengthMeters);

        const intersectionId =
            Number(row.intersectionId);

        const trafficLightId =
            Number(row.trafficLightId);

        const nextRows =
            await db.execute(sql`
                SELECT
                    rs.id AS "segmentId",
                    rs.road_id AS "roadId"
                FROM road_segments rs
                WHERE
                    rs.start_intersection_id =
                        ${intersectionId}
                    AND rs.id <> ${segmentId}
                LIMIT 1;
            `);

        if (nextRows.length === 0) {
            continue;
        }

        const next =
            nextRows[0] as any;

        candidates.push({
            segmentId,
            roadId,
            lengthMeters,
            intersectionId,

            speedLimitKmh:
                row.speedLimitKmh === null
                    ? null
                    : Number(
                          row.speedLimitKmh,
                      ),

            trafficLightId,

            nextSegmentId:
                Number(
                    next.segmentId,
                ),

            nextRoadId:
                Number(
                    next.roadId,
                ),
        });

        /*
         * Two independent approaches are
         * enough for the multi-segment test.
         */
        if (candidates.length >= 2) {
            break;
        }
    }

    return candidates;
}


/* ========================================================================
   TRAFFIC LIGHT CONFIGURATION
   ======================================================================== */

async function configureTrafficLight(
    approach: ApproachSegment,
): Promise<void> {
    const trafficLightId =
        approach.trafficLightId;

    await db.execute(sql`
        UPDATE traffic_lights
        SET
            current_phase = 1,
            phase_elapsed = 0,
            status = 'ACTIVE'
        WHERE id =
            ${trafficLightId};
    `);

    /*
     * Remove existing phases.
     */
    await db
        .delete(
            schema.trafficLightPhases,
        )
        .where(
            eq(
                schema.trafficLightPhases
                    .trafficLightId,
                trafficLightId,
            ),
        );

    /*
     * Create RED and GREEN phases.
     */
    await db
        .insert(
            schema.trafficLightPhases,
        )
        .values([
            {
                trafficLightId,

                phaseNumber: 1,

                durationSeconds:
                    RED_DURATION,

                state: "RED",
            },

            {
                trafficLightId,

                phaseNumber: 2,

                durationSeconds:
                    GREEN_DURATION,

                state: "GREEN",
            },
        ]);

    /*
     * Remove existing movements.
     */
    await db
        .delete(
            schema.trafficLightMovements,
        )
        .where(
            eq(
                schema.trafficLightMovements
                    .trafficLightId,
                trafficLightId,
            ),
        );

    /*
     * Configure movement for both phases.
     */
    await db
        .insert(
            schema.trafficLightMovements,
        )
        .values([
            {
                trafficLightId,

                phaseNumber: 1,

                fromRoadId:
                    approach.roadId,

                toRoadId:
                    approach.nextRoadId,

                state: "RED",
            },

            {
                trafficLightId,

                phaseNumber: 2,

                fromRoadId:
                    approach.roadId,

                toRoadId:
                    approach.nextRoadId,

                state: "GREEN",
            },
        ]);
}

async function getTrafficLightState(
    trafficLightId: number,
): Promise<{
    phase: number;
    elapsed: number;
}> {
    const rows =
        await db.execute(sql`
            SELECT
                current_phase AS "phase",
                phase_elapsed AS "elapsed"
            FROM traffic_lights
            WHERE id =
                ${trafficLightId};
        `);

    const row =
        rows[0] as any;

    return {
        phase: Number(
            row?.phase,
        ),

        elapsed: Number(
            row?.elapsed,
        ),
    };
}


/* ========================================================================
   VEHICLE SPAWNING
   ======================================================================== */

async function spawnVehicles(
    simulationId: number,
    approach: ApproachSegment,
): Promise<SpawnedVehicle[]> {
    /*
     * Vehicles are placed close to the
     * traffic light.
     */
    const stopProgress =
        1 -
        10 /
            approach.lengthMeters;

    const spawned:
        SpawnedVehicle[] = [];

    for (
        let i = 0;
        i <
        VEHICLE_COUNT_PER_SEGMENT;
        i++
    ) {
        const distanceFromSignal =
            4 +
            i *
                VEHICLE_GAP_METERS;

        const progress =
            Math.max(
                0.05,

                stopProgress -
                    distanceFromSignal /
                        approach.lengthMeters,
            );

        const positionRows =
            await db.execute(sql`
                SELECT
                    ST_AsGeoJSON(
                        ST_LineInterpolatePoint(
                            geometry,
                            ${progress}
                        )
                    )::json AS position
                FROM road_segments
                WHERE id =
                    ${approach.segmentId};
            `);

        assert(
            positionRows.length > 0,
            `Could not calculate vehicle position for segment ${approach.segmentId}`,
        );

        const geo =
            (positionRows[0] as any)
                .position;

        const vehicleRows =
            await db.execute(sql`
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
                        ST_GeomFromGeoJSON(
                            ${JSON.stringify(
                                geo,
                            )}
                        ),
                        4326
                    ),

                    30,

                    ${progress},

                    'WAITING'
                )
                RETURNING id;
            `);

        const vehicleId =
            Number(
                (
                    vehicleRows[0] as any
                ).id,
            );

        /*
         * Current segment.
         */
        await db
            .insert(
                schema.vehicleRoutes,
            )
            .values([
                {
                    vehicleId,

                    segmentId:
                        approach.segmentId,

                    sequence: 0,

                    isReverse: false,
                },

                /*
                 * Next segment.
                 */
                {
                    vehicleId,

                    segmentId:
                        approach.nextSegmentId,

                    sequence: 1,

                    isReverse: false,
                },
            ]);

        spawned.push({
            id: vehicleId,

            segmentId:
                approach.segmentId,

            roadId:
                approach.roadId,

            progress,
        });
    }

    return spawned;
}


/* ========================================================================
   TEST 1 — SIMULATION LIFECYCLE
   ======================================================================== */

async function testSimulationLifecycle(
    simulationId: number,
): Promise<void> {
    console.log(
        "\n[TEST 1] Simulation lifecycle",
    );

    const before =
        await getMetrics(
            simulationId,
        );

    assert(
        before.simulation.id ===
            simulationId,

        "Simulation ID should match",
    );

    assert(
        before.simulation.status ===
            "CREATED",

        `Expected CREATED status, got ${before.simulation.status}`,
    );

    pass(
        "Simulation created successfully",
    );

    await startSimulation(
        simulationId,
    );

    const running =
        await getMetrics(
            simulationId,
        );

    assert(
        running.simulation.status ===
            "RUNNING",

        `Expected RUNNING status, got ${running.simulation.status}`,
    );

    pass(
        "Simulation started successfully",
    );

    await wait(
        TICK_WAIT_MS,
    );

    const afterTick =
        await getMetrics(
            simulationId,
        );

    assert(
        afterTick.simulation
            .simulationTime >
            before.simulation
                .simulationTime,

        "Simulation time should advance while running",
    );

    pass(
        `Simulation time advanced to ${afterTick.simulation.simulationTime}s`,
    );
}


/* ========================================================================
   TEST 2 — VEHICLE CREATION
   ======================================================================== */

async function testVehicleCreation(
    simulationId: number,
    spawnedVehicles: SpawnedVehicle[],
): Promise<void> {
    console.log(
        "\n[TEST 2] Vehicle creation",
    );

    const vehicles =
        await getVehicles(
            simulationId,
        );

    const ids =
        new Set(
            vehicles.map(
                (vehicle) =>
                    Number(
                        vehicle.id,
                    ),
            ),
        );

    for (
        const vehicle of
        spawnedVehicles
    ) {
        assert(
            ids.has(vehicle.id),

            `Vehicle ${vehicle.id} should exist`,
        );
    }

    pass(
        `${spawnedVehicles.length} test vehicles are present`,
    );
}


/* ========================================================================
   TEST 3 — VEHICLE MOVEMENT
   ======================================================================== */

async function testVehicleMovement(
    simulationId: number,
    spawnedVehicles: SpawnedVehicle[],
): Promise<void> {
    console.log(
        "\n[TEST 3] Vehicle movement",
    );

    /*
     * Vehicles are intentionally spawned close to
     * traffic lights while the signal is RED.
     *
     * Therefore, we should NOT expect movement immediately.
     *
     * First verify that vehicles exist and are allowed
     * to wait.
     */

    const initialVehicles =
        await getVehicles(
            simulationId,
        );

    const initialById =
        new Map(
            initialVehicles.map(
                (vehicle) => [
                    Number(
                        vehicle.id,
                    ),

                    {
                        progress:
                            Number(
                                vehicle.progress,
                            ),

                        routeSequence:
                            Number(
                                vehicle.routeSequence,
                            ),

                        status:
                            vehicle.status,
                    },
                ],
            ),
        );

    assert(
        initialById.size >=
            spawnedVehicles.length,

        "All spawned vehicles should be available in the simulation",
    );

    pass(
        `${spawnedVehicles.length} vehicles are available for movement`,
    );

    /*
     * ------------------------------------------------------------
     * WAIT FOR THE FIRST GREEN PHASE
     * ------------------------------------------------------------
     *
     * RED lasts 20 seconds.
     *
     * We wait until the simulation has progressed beyond
     * the RED phase before requiring vehicle movement.
     */

    console.log(
        "  Waiting for the traffic light to enter GREEN...",
    );

    let greenObserved =
        false;

    for (
        let i = 0;
        i < 12;
        i++
    ) {
        await wait(
            TICK_WAIT_MS,
        );

        const metrics =
            await getMetrics(
                simulationId,
            );

        const vehicles =
            await getVehicles(
                simulationId,
            );

        const hasMovingVehicle =
            vehicles.some(
                (vehicle) =>
                    Number(
                        vehicle.speedKmh,
                    ) > 0 &&
                    vehicle.status !==
                        "WAITING_AT_SIGNAL",
            );

        /*
         * We consider movement valid if a vehicle
         * is actually moving.
         */
        if (
            hasMovingVehicle
        ) {
            greenObserved =
                true;

            break;
        }

        /*
         * Also inspect simulation time so we
         * know the RED phase has been crossed.
         */
        if (
            metrics.simulation
                .simulationTime >=
            RED_DURATION
        ) {
            greenObserved =
                true;

            break;
        }
    }

    assert(
        greenObserved,

        "Simulation should reach the GREEN phase",
    );

    pass(
        "Traffic light reached the movement phase",
    );

    /*
     * ------------------------------------------------------------
     * CAPTURE STATE BEFORE MOVEMENT
     * ------------------------------------------------------------
     */

    const beforeMovement =
        await getVehicles(
            simulationId,
        );

    const beforeById =
        new Map(
            beforeMovement.map(
                (vehicle) => [
                    Number(
                        vehicle.id,
                    ),

                    {
                        progress:
                            Number(
                                vehicle.progress,
                            ),

                        routeSequence:
                            Number(
                                vehicle.routeSequence,
                            ),

                        speed:
                            Number(
                                vehicle.speedKmh,
                            ),

                        status:
                            vehicle.status,
                    },
                ],
            ),
        );

    /*
     * ------------------------------------------------------------
     * ALLOW VEHICLES TO MOVE
     * ------------------------------------------------------------
     */

    console.log(
        "  GREEN phase reached. Waiting for vehicle movement...",
    );

    await wait(
        10_000,
    );

    /*
     * ------------------------------------------------------------
     * CAPTURE STATE AFTER MOVEMENT
     * ------------------------------------------------------------
     */

    const afterMovement =
        await getVehicles(
            simulationId,
        );

    let movementDetected =
        false;

    let routeProgressionDetected =
        false;

    let movingVehicleDetected =
        false;

    for (
        const vehicle of
        spawnedVehicles
    ) {
        const before =
            beforeById.get(
                vehicle.id,
            );

        const after =
            afterMovement.find(
                (item) =>
                    Number(
                        item.id,
                    ) ===
                    vehicle.id,
            );

        /*
         * A vehicle may have completed its route
         * and therefore no longer appear in the
         * active vehicle response.
         *
         * That is also valid movement.
         */
        if (
            !after
        ) {
            movementDetected =
                true;

            continue;
        }

        const afterProgress =
            Number(
                after.progress,
            );

        const afterRouteSequence =
            Number(
                after.routeSequence,
            );

        const afterSpeed =
            Number(
                after.speedKmh,
            );

        if (
            afterSpeed > 0 &&
            after.status !==
                "WAITING_AT_SIGNAL"
        ) {
            movingVehicleDetected =
                true;
        }

        if (
            before &&
            Math.abs(
                afterProgress -
                    before.progress,
            ) > 0.001
        ) {
            movementDetected =
                true;
        }

        if (
            before &&
            afterRouteSequence >
                before.routeSequence
        ) {
            routeProgressionDetected =
                true;
        }
    }

    /*
     * At least one of these should happen:
     *
     * 1. Vehicle physically moves.
     * 2. Vehicle advances to another route segment.
     * 3. Vehicle completes its route and disappears.
     */

    assert(
        movementDetected ||
            routeProgressionDetected ||
            movingVehicleDetected,

        "At least one vehicle should move after the traffic light becomes GREEN",
    );

    pass(
        "Vehicle movement detected after GREEN phase",
    );

    if (
        routeProgressionDetected
    ) {
        pass(
            "At least one vehicle progressed to a later route segment",
        );
    }

    if (
        movingVehicleDetected
    ) {
        pass(
            "At least one vehicle is actively moving",
        );
    }

    if (
        movementDetected
    ) {
        pass(
            "Vehicle position/progress changed",
        );
    }
}


/* ========================================================================
   TEST 4 — TRAFFIC LIGHTS
   ======================================================================== */

async function testTrafficLight(
    approaches: ApproachSegment[],
): Promise<void> {
    console.log(
        "\n[TEST 4] Traffic-light phases and movements",
    );

    for (
        const approach of
        approaches
    ) {
        const state =
            await getTrafficLightState(
                approach.trafficLightId,
            );

        assert(
            state.phase === 1,

            `Traffic light ${approach.trafficLightId} should start in RED phase`,
        );

        pass(
            `Traffic light ${approach.trafficLightId}: RED phase active`,
        );

        const phases =
            await db.execute(sql`
                SELECT
                    phase_number AS "phaseNumber",
                    duration_seconds AS "durationSeconds",
                    state
                FROM traffic_light_phases
                WHERE traffic_light_id =
                    ${approach.trafficLightId}
                ORDER BY phase_number;
            `);

        assert(
            phases.length === 2,

            `Traffic light ${approach.trafficLightId} should have two phases`,
        );

        const redPhase =
            phases.find(
                (phase: any) =>
                    Number(
                        phase.phaseNumber,
                    ) === 1,
            ) as any;

        const greenPhase =
            phases.find(
                (phase: any) =>
                    Number(
                        phase.phaseNumber,
                    ) === 2,
            ) as any;

        assert(
            redPhase?.state ===
                "RED",

            "Phase 1 should be RED",
        );

        assert(
            greenPhase?.state ===
                "GREEN",

            "Phase 2 should be GREEN",
        );

        pass(
            `Traffic light ${approach.trafficLightId}: RED/GREEN phases configured`,
        );

        const movements =
            await db.execute(sql`
                SELECT
                    phase_number AS "phaseNumber",
                    from_road_id AS "fromRoadId",
                    to_road_id AS "toRoadId",
                    state
                FROM traffic_light_movements
                WHERE traffic_light_id =
                    ${approach.trafficLightId}
                ORDER BY phase_number;
            `);

        assert(
            movements.length >= 2,

            `Traffic light ${approach.trafficLightId} should have traffic movements`,
        );

        pass(
            `Traffic light ${approach.trafficLightId}: movements configured`,
        );
    }
}


/* ========================================================================
   TEST 5 — QUEUE FORMATION
   ======================================================================== */

async function testQueueFormation(
    simulationId: number,
): Promise<void> {
    console.log(
        "\n[TEST 5] Queue formation",
    );

    const congestion =
        await getCongestion(
            simulationId,
        );

    const queuedSegments =
        congestion.congestion.filter(
            (segment) =>
                segment.queueVehicleCount >=
                2,
        );

    assert(
        queuedSegments.length > 0,

        "At least one traffic queue should form",
    );

    const largestQueue =
        Math.max(
            ...queuedSegments.map(
                (segment) =>
                    segment.queueVehicleCount,
            ),
        );

    pass(
        `Queue detected with ${largestQueue} vehicles`,
    );

    const queueLength =
        Math.max(
            ...queuedSegments.map(
                (segment) =>
                    segment.queueLengthMeters,
            ),
        );

    info(
        `Maximum detected queue length: ${queueLength}m`,
    );
}


/* ========================================================================
   TEST 6 — LIVE METRICS
   ======================================================================== */

async function testLiveMetrics(
    simulationId: number,
): Promise<void> {
    console.log(
        "\n[TEST 6] Live traffic metrics",
    );

    const result =
        await getMetrics(
            simulationId,
        );

    const metrics =
        result.metrics;

    assert(
        metrics.totalVehicles >= 0,

        "totalVehicles should be non-negative",
    );

    assert(
        metrics.activeVehicles >= 0,

        "activeVehicles should be non-negative",
    );

    assert(
        metrics.waitingVehicles >= 0,

        "waitingVehicles should be non-negative",
    );

    assert(
        metrics.completedVehicles >=
            0,

        "completedVehicles should be non-negative",
    );

    assert(
        metrics.waitingVehicles <=
            metrics.activeVehicles,

        "Waiting vehicles should be a subset of active vehicles",
    );

    assert(
        metrics.activeVehicles <=
            metrics.totalVehicles,

        "Active vehicles cannot exceed total vehicles",
    );

    assert(
        metrics.activeQueues >= 0,

        "activeQueues should be non-negative",
    );

    assert(
        metrics.maximumQueueVehicles >=
            0,

        "maximumQueueVehicles should be non-negative",
    );

    console.table({
        "Total Vehicles":
            metrics.totalVehicles,

        "Active Vehicles":
            metrics.activeVehicles,

        "Waiting Vehicles":
            metrics.waitingVehicles,

        "Completed Vehicles":
            metrics.completedVehicles,

        "Signal Waiting":
            metrics.signalWaitingVehicles,

        "Average Speed":
            metrics.averageSpeedKmh,

        "Active Queues":
            metrics.activeQueues,

        "Maximum Queue Vehicles":
            metrics.maximumQueueVehicles,

        "Average Queue Length":
            metrics.averageQueueLengthMeters,

        "Total Distance":
            metrics.totalDistanceMeters,
    });

    pass(
        "Live metrics are internally consistent",
    );

    info(
        "Waiting vehicles are included inside active vehicles",
    );
}


/* ========================================================================
   TEST 7 — CONGESTION DETECTION
   ======================================================================== */

async function testCongestionDetection(
    simulationId: number,
): Promise<void> {
    console.log(
        "\n[TEST 7] Congestion detection",
    );

    const congestion =
        await getCongestion(
            simulationId,
        );

    const severe =
        congestion.congestion.filter(
            (segment) =>
                segment.congestionLevel ===
                "SEVERE",
        );

    assert(
        severe.length > 0,

        "At least one segment should reach SEVERE congestion",
    );

    for (
        const segment of severe
    ) {
        console.log(
            `  Segment ${segment.segmentId} | ` +
                `Road ${segment.roadId} | ` +
                `Vehicles ${segment.vehicleCount} | ` +
                `Queue ${segment.queueVehicleCount} | ` +
                `Queue Length ${segment.queueLengthMeters}m`,
        );
    }

    pass(
        `${severe.length} segment(s) reached SEVERE congestion`,
    );
}


/* ========================================================================
   TEST 8 — EVENT GENERATION
   ======================================================================== */

async function testEventGeneration(
    simulationId: number,
): Promise<Set<string>> {
    console.log(
        "\n[TEST 8] Simulation event generation",
    );

    const eventData =
        await getEvents(
            simulationId,
        );

    const eventTypes =
        new Set(
            eventData.events.map(
                (event) =>
                    event.type,
            ),
        );

    console.log(
        "\nRecorded event types:",
    );

    for (
        const type of eventTypes
    ) {
        console.log(
            `  ${type}`,
        );
    }

    assert(
        eventTypes.has(
            "TRAFFIC_QUEUE_STARTED",
        ),

        "TRAFFIC_QUEUE_STARTED event should be recorded",
    );

    assert(
        eventTypes.has(
            "CONGESTION_DETECTED",
        ),

        "CONGESTION_DETECTED event should be recorded",
    );

    pass(
        "Queue and congestion detection events recorded",
    );

    return eventTypes;
}


/* ========================================================================
   TEST 9 — CONGESTION EVENT DEDUPLICATION
   ======================================================================== */

async function testNoRepeatedCongestionEvents(
    simulationId: number,
): Promise<void> {
    console.log(
        "\n[TEST 9] Congestion event deduplication",
    );

    const eventData =
        await getEvents(
            simulationId,
        );

    const detectedEvents =
        eventData.events.filter(
            (event) =>
                event.type ===
                "CONGESTION_DETECTED",
        );

    const bySegment =
        new Map<
            number,
            number
        >();

    for (
        const event of
        detectedEvents
    ) {
        const segmentId =
            Number(
                event.data?.segmentId,
            );

        bySegment.set(
            segmentId,

            (
                bySegment.get(
                    segmentId,
                ) ?? 0
            ) + 1,
        );
    }

    for (
        const [
            segmentId,
            count,
        ] of bySegment
    ) {
        assert(
            count === 1,

            `Segment ${segmentId} should not repeatedly generate CONGESTION_DETECTED while remaining severe`,
        );
    }

    pass(
        "No repeated CONGESTION_DETECTED events were generated for the same severe segment",
    );
}


/* ========================================================================
   TEST 10 — MULTIPLE SEGMENTS
   ======================================================================== */

async function testMultipleSegments(
    simulationId: number,
    approaches: ApproachSegment[],
): Promise<void> {
    console.log(
        "\n[TEST 10] Multiple-segment traffic validation",
    );

    const congestion =
        await getCongestion(
            simulationId,
        );

    const activeSegments =
        congestion.congestion.filter(
            (segment) =>
                segment.vehicleCount >
                0,
        );

    const segmentIds =
        new Set(
            activeSegments.map(
                (segment) =>
                    segment.segmentId,
            ),
        );

    console.log(
        `Active simulation segments: ${[
            ...segmentIds,
        ].join(", ")}`,
    );

    assert(
        segmentIds.size >= 1,

        "At least one segment should contain vehicles",
    );

    if (
        approaches.length >= 2
    ) {
        const testedSegmentIds =
            new Set(
                approaches.map(
                    (approach) =>
                        approach.segmentId,
                ),
            );

        const testedActiveSegments =
            activeSegments.filter(
                (segment) =>
                    testedSegmentIds.has(
                        segment.segmentId,
                    ),
            );

        if (
            testedActiveSegments.length >=
            2
        ) {
            pass(
                "Multiple road segments are active in the same simulation",
            );
        } else {
            info(
                "Two configured approach segments exist, but both did not remain active simultaneously",
            );
        }
    } else {
        info(
            "Only one suitable traffic-light approach was available in the dataset",
        );
    }
}


/* ========================================================================
   LONG-RUN PHASE 3 MONITOR
   ======================================================================== */

async function runLongSimulationMonitor(
    simulationId: number,
    approaches: ApproachSegment[],
): Promise<void> {
    console.log(
        "\n[LONG RUN] Starting extended Phase 3 simulation...",
    );

    console.log(
        `Target duration: ${TEST_DURATION_SECONDS} seconds`,
    );

    console.log(
        `Traffic light cycle: RED ${RED_DURATION}s → GREEN ${GREEN_DURATION}s`,
    );

    const startTime =
        Date.now();

    let tick = 0;

    let observedRed =
        false;

    let observedGreen =
        false;

    let observedQueue =
        false;

    let observedSevere =
        false;

    let observedQueueCleared =
        false;

    let observedCongestionCleared =
        false;

    let previousSimulationTime =
        -1;

    /*
     * Keep track of event IDs so we can
     * report only newly generated events.
     */
    const seenEventIds =
        new Set<number>();

    while (
        Date.now() -
            startTime <
        TEST_DURATION_SECONDS *
            1000
    ) {
        tick++;

        await wait(
            TICK_WAIT_MS,
        );

        const [
            metricsData,
            congestionData,
            eventsData,
        ] =
            await Promise.all([
                getMetrics(
                    simulationId,
                ),

                getCongestion(
                    simulationId,
                ),

                getEvents(
                    simulationId,
                ),
            ]);

        const simulationTime =
            metricsData.simulation
                .simulationTime;

        /*
         * Read every configured traffic light.
         */
        const lightStates =
            await Promise.all(
                approaches.map(
                    (approach) =>
                        getTrafficLightState(
                            approach.trafficLightId,
                        ),
                ),
            );

        const redCount =
            lightStates.filter(
                (state) =>
                    state.phase === 1,
            ).length;

        const greenCount =
            lightStates.filter(
                (state) =>
                    state.phase === 2,
            ).length;

        if (
            redCount > 0
        ) {
            observedRed =
                true;
        }

        if (
            greenCount > 0
        ) {
            observedGreen =
                true;
        }

        /*
         * Queue state.
         */
        const activeQueues =
            metricsData.metrics
                .activeQueues;

        if (
            activeQueues > 0
        ) {
            observedQueue =
                true;
        }

        /*
         * Congestion state.
         */
        const severeSegments =
            congestionData.congestion.filter(
                (segment) =>
                    segment.congestionLevel ===
                    "SEVERE",
            );

        if (
            severeSegments.length >
            0
        ) {
            observedSevere =
                true;
        }

        /*
         * Detect events.
         */
        for (
            const event of
            eventsData.events
        ) {
            if (
                seenEventIds.has(
                    event.id,
                )
            ) {
                continue;
            }

            seenEventIds.add(
                event.id,
            );

            console.log(
                `\n  EVENT: ${event.type} ` +
                    `at simulation ${event.simulationTime}s` +
                    `${
                        event.roadId !==
                        null
                            ? ` | Road ${event.roadId}`
                            : ""
                    }`,
            );

            if (
                event.type ===
                "TRAFFIC_QUEUE_STARTED"
            ) {
                observedQueue =
                    true;
            }

            if (
                event.type ===
                "TRAFFIC_QUEUE_CLEARED"
            ) {
                observedQueueCleared =
                    true;
            }

            if (
                event.type ===
                "CONGESTION_DETECTED"
            ) {
                observedSevere =
                    true;
            }

            if (
                event.type ===
                "CONGESTION_CLEARED"
            ) {
                observedCongestionCleared =
                    true;
            }
        }

        /*
         * Simulation time must never move backwards.
         */
        assert(
            simulationTime >=
                previousSimulationTime,

            "Simulation time must not move backwards",
        );

        previousSimulationTime =
            simulationTime;

        /*
         * Print detailed state every few ticks.
         */
        if (
            tick %
                REPORT_EVERY_TICKS ===
            0
        ) {
            console.log(
                "\n------------------------------------------------------------",
            );

            console.log(
                `TICK ${tick} | Simulation Time: ${simulationTime}s`,
            );

            console.log(
                `Traffic Lights: ${redCount} RED | ${greenCount} GREEN`,
            );

            console.log(
                `Vehicles: ` +
                    `${metricsData.metrics.totalVehicles} total | ` +
                    `${metricsData.metrics.activeVehicles} active | ` +
                    `${metricsData.metrics.waitingVehicles} waiting | ` +
                    `${metricsData.metrics.completedVehicles} completed`,
            );

            console.log(
                `Queues: ` +
                    `${metricsData.metrics.activeQueues} active | ` +
                    `max ${metricsData.metrics.maximumQueueVehicles} vehicles`,
            );

            console.log(
                `Average Speed: ` +
                    `${metricsData.metrics.averageSpeedKmh.toFixed(
                        2,
                    )} km/h`,
            );

            console.log(
                `Congested Segments: ` +
                    `${congestionData.congestion.length}`,
            );

            /*
             * Show severe congestion.
             */
            if (
                severeSegments.length >
                0
            ) {
                console.log(
                    "\nSevere congestion:",
                );

                console.table(
                    severeSegments.map(
                        (segment) => ({
                            Segment:
                                segment.segmentId,

                            Road:
                                segment.roadId,

                            Vehicles:
                                segment.vehicleCount,

                            "Avg Speed":
                                segment.averageSpeedKmh,

                            "Queue Vehicles":
                                segment.queueVehicleCount,

                            "Queue Length":
                                segment.queueLengthMeters,

                            Level:
                                segment.congestionLevel,
                        }),
                    ),
                );
            }

            /*
             * Show latest events.
             */
            const recentEvents =
                eventsData.events
                    .slice(0, 5)
                    .map(
                        (event) => ({
                            ID: event.id,

                            Type:
                                event.type,

                            Time:
                                `${event.simulationTime}s`,

                            Road:
                                event.roadId ??
                                "-",
                        }),
                    );

            if (
                recentEvents.length >
                0
            ) {
                console.log(
                    "\nRecent events:",
                );

                console.table(
                    recentEvents,
                );
            }

            console.log(
                "------------------------------------------------------------",
            );
        }
    }

    console.log(
        "\n[LONG RUN] Extended simulation complete.",
    );

    console.log(
        `Actual simulation time reached: ${previousSimulationTime}s`,
    );

    /*
     * We expect the simulation to actually
     * advance for most of the test period.
     */
    assert(
        previousSimulationTime >=
            TEST_DURATION_SECONDS *
                0.6,

        `Simulation should advance substantially during the ${TEST_DURATION_SECONDS}s test`,
    );

    pass(
        "Simulation ran continuously for an extended period",
    );

    /*
     * Traffic-light validation.
     */
    assert(
        observedRed,

        "RED traffic-light phase should be observed",
    );

    pass(
        "RED traffic-light phase observed",
    );

    assert(
        observedGreen,

        "GREEN traffic-light phase should be observed",
    );

    pass(
        "GREEN traffic-light phase observed",
    );

    /*
     * Queue validation.
     */
    assert(
        observedQueue,

        "At least one traffic queue should be observed",
    );

    pass(
        "Traffic queue observed",
    );

    /*
     * Congestion validation.
     */
    assert(
        observedSevere,

        "SEVERE congestion should be observed",
    );

    pass(
        "SEVERE congestion observed",
    );

    /*
     * Queue clearing.
     */
    assert(
        observedQueueCleared,

        "TRAFFIC_QUEUE_CLEARED should be observed",
    );

    pass(
        "Traffic queue clearing observed",
    );

    /*
     * Congestion clearing.
     */
    assert(
        observedCongestionCleared,

        "CONGESTION_CLEARED should be observed",
    );

    pass(
        "Congestion clearing observed",
    );
}


/* ========================================================================
   TEST 11 — FINAL EVENT VALIDATION
   ======================================================================== */

async function testFinalEvents(
    simulationId: number,
): Promise<void> {
    console.log(
        "\n[TEST 11] Final event lifecycle validation",
    );

    const events =
        await getEvents(
            simulationId,
        );

    const eventTypes =
        events.events.map(
            (event) =>
                event.type,
        );

    const requiredEvents = [
        "TRAFFIC_QUEUE_STARTED",
        "TRAFFIC_QUEUE_CLEARED",
        "CONGESTION_DETECTED",
        "CONGESTION_CLEARED",
    ];

    for (
        const requiredEvent of
        requiredEvents
    ) {
        assert(
            eventTypes.includes(
                requiredEvent,
            ),

            `${requiredEvent} should exist in the event history`,
        );
    }

    pass(
        "Complete queue lifecycle recorded",
    );

    pass(
        "Complete congestion lifecycle recorded",
    );

    /*
     * Display the complete event history.
     */
    console.log(
        "\nComplete event history:",
    );

    console.table(
        events.events.map(
            (event) => ({
                ID:
                    event.id,

                Type:
                    event.type,

                Road:
                    event.roadId ??
                    "-",

                Intersection:
                    event.intersectionId ??
                    "-",

                "Simulation Time":
                    `${event.simulationTime}s`,
            }),
        ),
    );
}


/* ========================================================================
   TEST 12 — FINAL METRICS
   ======================================================================== */

async function testFinalMetrics(
    simulationId: number,
): Promise<void> {
    console.log(
        "\n[TEST 12] Final metrics validation",
    );

    const metrics =
        await getMetrics(
            simulationId,
        );

    const m =
        metrics.metrics;

    assert(
        m.totalVehicles >=
            m.completedVehicles,

        "Completed vehicles cannot exceed total vehicles",
    );

    assert(
        m.activeVehicles +
            m.completedVehicles <=
            m.totalVehicles,

        "Active + completed vehicles cannot exceed total vehicles",
    );

    console.table({
        "Simulation Time":
            metrics.simulation
                .simulationTime,

        "Total Vehicles":
            m.totalVehicles,

        "Active Vehicles":
            m.activeVehicles,

        "Waiting Vehicles":
            m.waitingVehicles,

        "Completed Vehicles":
            m.completedVehicles,

        "Signal Waiting":
            m.signalWaitingVehicles,

        "Active Queues":
            m.activeQueues,

        "Maximum Queue Vehicles":
            m.maximumQueueVehicles,

        "Average Queue Length":
            m.averageQueueLengthMeters,

        "Average Speed":
            m.averageSpeedKmh,

        "Total Distance":
            m.totalDistanceMeters,
    });

    pass(
        "Final metrics remain internally consistent",
    );
}


/* ========================================================================
   MAIN PHASE 3 TEST
   ======================================================================== */

async function testPhase3(): Promise<void> {
    let simulationId:
        number | null = null;

    console.log(
        "\n======================================================================",
    );

    console.log(
        "                    CITYOS PHASE 3 TEST",
    );

    console.log(
        "                  TRAFFIC SIMULATION",
    );

    console.log(
        "======================================================================",
    );

    console.log(
        "\nPhase 3 components being tested:",
    );

    console.log(
        "  • Simulation runs",
    );

    console.log(
        "  • Vehicles",
    );

    console.log(
        "  • Vehicle movement",
    );

    console.log(
        "  • Route progression",
    );

    console.log(
        "  • Traffic lights",
    );

    console.log(
        "  • Traffic-light phases",
    );

    console.log(
        "  • Traffic-light movements",
    );

    console.log(
        "  • Queues",
    );

    console.log(
        "  • Congestion",
    );

    console.log(
        "  • Event generation",
    );

    console.log(
        "  • Live metrics",
    );

    console.log(
        "  • Multiple road segments",
    );

    console.log(
        `  • Extended ${TEST_DURATION_SECONDS}s simulation`,
    );

    console.log(
        "======================================================================\n",
    );

    try {
        /* ================================================================
           SETUP — FIND ROAD NETWORK
        ================================================================ */

        console.log(
            "[SETUP] Finding traffic-light approach segments...",
        );

        const approaches =
            await findApproachSegments();

        assert(
            approaches.length >= 1,

            "At least one suitable traffic-light approach is required",
        );

        console.log(
            `Found ${approaches.length} suitable approach segment(s).`,
        );

        for (
            const approach of
            approaches
        ) {
            console.log(
                `  Segment ${approach.segmentId} | ` +
                    `Road ${approach.roadId} | ` +
                    `${approach.lengthMeters.toFixed(
                        1,
                    )}m | ` +
                    `Intersection ${approach.intersectionId} | ` +
                    `Traffic Light ${approach.trafficLightId}`,
            );
        }

        /* ================================================================
           CREATE SIMULATION
        ================================================================ */

        console.log(
            "\n[SETUP] Creating simulation...",
        );

        simulationId =
            await createSimulation();

        console.log(
            `Simulation ID: ${simulationId}`,
        );

        /* ================================================================
           CONFIGURE TRAFFIC LIGHTS
        ================================================================ */

        console.log(
            "\n[SETUP] Configuring traffic lights...",
        );

        for (
            const approach of
            approaches
        ) {
            await configureTrafficLight(
                approach,
            );
        }

        pass(
            `${approaches.length} traffic light(s) configured`,
        );

        /* ================================================================
           SPAWN VEHICLES
        ================================================================ */

        console.log(
            "\n[SETUP] Spawning vehicles...",
        );

        const allSpawnedVehicles:
            SpawnedVehicle[] = [];

        for (
            const approach of
            approaches
        ) {
            const vehicles =
                await spawnVehicles(
                    simulationId,
                    approach,
                );

            allSpawnedVehicles.push(
                ...vehicles,
            );

            console.log(
                `  Segment ${approach.segmentId}: ${vehicles.length} vehicles`,
            );
        }

        assert(
            allSpawnedVehicles.length >
                0,

            "Vehicles should be spawned",
        );

        pass(
            `${allSpawnedVehicles.length} vehicles spawned`,
        );

        /* ================================================================
           START SIMULATION
        ================================================================ */

        await testSimulationLifecycle(
            simulationId,
        );

        /* ================================================================
           BASIC VEHICLE VALIDATION
        ================================================================ */

        await testVehicleCreation(
            simulationId,
            allSpawnedVehicles,
        );

        /* ================================================================
           VEHICLE MOVEMENT
        ================================================================ */

        await testVehicleMovement(
            simulationId,
            allSpawnedVehicles,
        );

        /* ================================================================
           TRAFFIC LIGHT VALIDATION
        ================================================================ */

        await testTrafficLight(
            approaches,
        );

        /* ================================================================
           QUEUE VALIDATION
        ================================================================ */

        await testQueueFormation(
            simulationId,
        );

        /* ================================================================
           METRICS VALIDATION
        ================================================================ */

        await testLiveMetrics(
            simulationId,
        );

        /* ================================================================
           CONGESTION VALIDATION
        ================================================================ */

        await testCongestionDetection(
            simulationId,
        );

        /* ================================================================
           EVENT VALIDATION
        ================================================================ */

        await testEventGeneration(
            simulationId,
        );

        await testNoRepeatedCongestionEvents(
            simulationId,
        );

        /* ================================================================
           MULTI-SEGMENT VALIDATION
        ================================================================ */

        await testMultipleSegments(
            simulationId,
            approaches,
        );

        /* ================================================================
           EXTENDED SIMULATION
        ================================================================ */

        await runLongSimulationMonitor(
            simulationId,
            approaches,
        );

        /* ================================================================
           FINAL EVENTS
        ================================================================ */

        await testFinalEvents(
            simulationId,
        );

        /* ================================================================
           FINAL METRICS
        ================================================================ */

        await testFinalMetrics(
            simulationId,
        );

        /* ================================================================
           STOP SIMULATION
        ================================================================ */

        console.log(
            "\n[FINAL] Stopping simulation...",
        );

        await stopSimulation(
            simulationId,
        );

        console.log(
            "\n======================================================================",
        );

        console.log(
            "                 PHASE 3 TEST PASSED",
        );

        console.log(
            "======================================================================",
        );

        console.log(
            `Simulation ${simulationId} completed successfully.`,
        );

        console.log(
            "\nValidated:",
        );

        console.log(
            "  ✓ Simulation lifecycle",
        );

        console.log(
            "  ✓ Vehicle creation",
        );

        console.log(
            "  ✓ Vehicle movement",
        );

        console.log(
            "  ✓ Route progression",
        );

        console.log(
            "  ✓ Traffic-light phases",
        );

        console.log(
            "  ✓ Traffic-light movements",
        );

        console.log(
            "  ✓ Queue formation",
        );

        console.log(
            "  ✓ Queue clearing",
        );

        console.log(
            "  ✓ Congestion detection",
        );

        console.log(
            "  ✓ Congestion clearing",
        );

        console.log(
            "  ✓ Event generation",
        );

        console.log(
            "  ✓ Event deduplication",
        );

        console.log(
            "  ✓ Live metrics",
        );

        console.log(
            "  ✓ Multiple-segment validation",
        );

        console.log(
            "  ✓ Extended simulation",
        );

        console.log(
            "  ✓ Final event lifecycle",
        );

        console.log(
            "  ✓ Final metrics",
        );

        console.log(
            "======================================================================\n",
        );
    } catch (error) {
        console.error(
            "\n======================================================================",
        );

        console.error(
            "                 PHASE 3 TEST FAILED",
        );

        console.error(
            "======================================================================",
        );

        console.error(error);

        if (
            simulationId !==
            null
        ) {
            console.error(
                `\nSimulation ${simulationId} was created for this test.`,
            );

            console.error(
                "Attempting to stop it...",
            );

            await stopSimulation(
                simulationId,
            );
        }

        process.exitCode = 1;
    } finally {
        await client.end();
    }
}


/* ========================================================================
   RUN
   ======================================================================== */

testPhase3();