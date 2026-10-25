import assert from "node:assert/strict";
import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { and, asc, eq, sql } from "drizzle-orm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDatabase = "cityos_dynamic_rerouting_it";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = new URL(process.env.DATABASE_URL ?? "");
if (!process.env.DATABASE_URL || !["localhost", "127.0.0.1", "::1"].includes(baseUrl.hostname)) {
    throw new Error("Integration test requires DATABASE_URL to point to a local PostgreSQL server.");
}
if (baseUrl.pathname.replace(/^\//, "") !== "cityos") {
    throw new Error("Integration test is configured to derive its isolated database from the local cityos connection only.");
}

const testUrl = new URL(baseUrl);
testUrl.pathname = `/${testDatabase}`;
const admin = postgres(baseUrl.toString(), { max: 1, connect_timeout: 5 });
let appConnection: postgres.Sql | undefined;
let engine: { start(id: number): Promise<void>; stop(id: number): void; waitForIdle(id: number): Promise<void> } | undefined;
let simulationId: number | undefined;
let cityId: number | undefined;
let createdDatabase = false;

function say(message: string) {
    console.log(`PASS ${message}`);
}

try {
    const existing = await admin`SELECT 1 FROM pg_database WHERE datname = ${testDatabase}`;
    assert.equal(existing.length, 0, `Refusing to overwrite existing database ${testDatabase}`);
    await admin.unsafe(`CREATE DATABASE ${testDatabase}`);
    createdDatabase = true;

    const migrationClient = postgres(testUrl.toString(), { max: 1, connect_timeout: 5 });
    await migrationClient`CREATE EXTENSION postgis`;
    await migrate(drizzle(migrationClient), { migrationsFolder: path.join(root, "drizzle") });
    // Current Drizzle model has geometry/road columns absent or stale in old migrations.
    // Align only this empty disposable database before seeding integration fixtures.
    await migrationClient.unsafe(`
        ALTER TABLE cities ADD COLUMN boundary geometry(Polygon, 4326);
        ALTER TABLE roads ADD COLUMN source_id text UNIQUE;
        ALTER TABLE roads ADD COLUMN type text;
        ALTER TABLE roads ADD COLUMN width real;
        ALTER TABLE roads ALTER COLUMN geometry TYPE geometry(LineString, 4326)
            USING ST_SetSRID(ST_MakeLine(geometry, geometry), 4326);
        ALTER TABLE road_segments ALTER COLUMN geometry TYPE geometry(LineString, 4326)
            USING ST_SetSRID(ST_MakeLine(geometry, geometry), 4326);
    `);
    await migrationClient.end({ timeout: 2 });
    say("created isolated PostGIS database and applied repository migrations");

    process.env.DATABASE_URL = testUrl.toString();
    const [{ db }, schema, stateService, cacheService, trafficCache, rerouting, movement, engineModule, config] = await Promise.all([
        import("../src/db/index.ts"),
        import("../src/db/schema/index.ts"),
        import("../src/modules/vehicle/vehicle_state.service.ts"),
        import("../src/modules/vehicle/vehicle_simulation_cache.service.ts"),
        import("../src/modules/traffic/traffic_light_cache.service.ts"),
        import("../src/modules/vehicle/dynamic_rerouting.service.ts"),
        import("../src/modules/vehicle/vehicle_movement.service.ts"),
        import("../src/modules/simulation/simulation.engine.ts"),
        import("../src/lib/constants.ts"),
    ]);
    appConnection = (globalThis as typeof globalThis & { conn?: postgres.Sql }).conn;
    engine = engineModule.simulationEngine;
    const { cities, intersections, roads, roadSegments, simulationRuns, vehicles, vehicleRoutes, trafficLights, trafficLightPhases, trafficLightMovements, simulationEvents } = schema;

    const [city] = await db.insert(cities).values({
        name: "Reroute Integration City", country: "Test",
        center: [0, 0],
    }).returning({ id: cities.id });
    cityId = city.id;
    const points = [[-0.001, 0], [0, 0], [0.001, 0], [0.002, 0], [0, 0.001]] as const;
    const nodes: number[] = [];
    for (let index = 0; index < points.length; index++) {
        const [node] = await db.insert(intersections).values({
            cityId,
            name: `Reroute node ${index}`,
            location: [...points[index]],
        }).returning({ id: intersections.id });
        nodes.push(node.id);
    }
    const [run] = await db.insert(simulationRuns).values({
        cityId,
        status: "RUNNING",
        simulationTime: 10,
        startedAt: new Date(),
    }).returning({ id: simulationRuns.id });
    simulationId = run.id;

    async function addRoad(name: string, startNode: number, endNode: number, start: readonly [number, number], end: readonly [number, number]) {
        const geometry = sql`ST_SetSRID(ST_MakeLine(ST_MakePoint(${start[0]}, ${start[1]}), ST_MakePoint(${end[0]}, ${end[1]})), 4326)`;
        const [road] = await db.insert(roads).values({
            cityId: cityId!, name,
            startIntersectionId: startNode,
            endIntersectionId: endNode,
            type: "primary", width: 6,
            geometry,
            lengthMeters: 100, speedLimitKmh: 36,
        }).returning({ id: roads.id });
        return road.id;
    }
    async function addSegment(roadId: number, startNode: number, endNode: number, sequence: number, lengthMeters: number, start: readonly [number, number], end: readonly [number, number], speedLimitKmh = 36) {
        const geometry = sql`ST_SetSRID(ST_MakeLine(ST_MakePoint(${start[0]}, ${start[1]}), ST_MakePoint(${end[0]}, ${end[1]})), 4326)`;
        const [segment] = await db.insert(roadSegments).values({
            roadId, startIntersectionId: startNode, endIntersectionId: endNode, sequence,
            geometry,
            lengthMeters, speedLimitKmh,
        }).returning({ id: roadSegments.id });
        return segment.id;
    }

    const [roadPast, roadHistory, roadSlowA, roadSlowB, roadFast, roadOtherHistory] = await Promise.all([
        addRoad("Completed approach", nodes[4], nodes[0], points[4], points[0]),
        addRoad("History approach", nodes[0], nodes[1], points[0], points[1]),
        addRoad("Congested approach", nodes[1], nodes[2], points[1], points[2]),
        addRoad("Congested continuation", nodes[2], nodes[3], points[2], points[3]),
        addRoad("Alternative fast route", nodes[1], nodes[3], points[1], points[3]),
        addRoad("Other history approach", nodes[4], nodes[1], points[4], points[1]),
    ]);
    const [pastSegment, historySegment, slowSegmentA, slowSegmentB, fastSegment, otherHistorySegment] = await Promise.all([
        addSegment(roadPast, nodes[4], nodes[0], 0, 100, points[4], points[0]),
        addSegment(roadHistory, nodes[0], nodes[1], 0, 100, points[0], points[1]),
        addSegment(roadSlowA, nodes[1], nodes[2], 0, 10, points[1], points[2], 1),
        addSegment(roadSlowB, nodes[2], nodes[3], 0, 50, points[2], points[3]),
        addSegment(roadFast, nodes[1], nodes[3], 0, 200, points[1], points[3]),
        addSegment(roadOtherHistory, nodes[4], nodes[1], 0, 100, points[4], points[1]),
    ]);

    const routing = await import("../src/modules/road/routing.service.ts");
    const roadNetwork = await import("../src/modules/road/road_network.service.ts");
    const { segments: testNetwork } = await roadNetwork.getVehicleRoadNetwork(cityId);
    const emptyTrafficSnapshot = {
        simulationRunId: simulationId!, cityId, status: "RUNNING", simulationTime: 0, vehicles: [], signals: [],
    };
    const fullActiveSegmentCost = routing.estimateRouteTravelTimeOnNetwork(
        testNetwork, [{ segmentId: historySegment, isReverse: false }], [nodes[0], nodes[1]], emptyTrafficSnapshot,
    );
    const partialActiveSegmentCost = routing.estimateRouteTravelTimeOnNetwork(
        testNetwork, [{ segmentId: historySegment, isReverse: false }], [nodes[0], nodes[1]], emptyTrafficSnapshot, 0.25,
    );
    assert.ok(fullActiveSegmentCost !== null && partialActiveSegmentCost !== null);
    assert.ok(Math.abs(partialActiveSegmentCost - fullActiveSegmentCost * 0.75) < 0.0001);
    say("same traffic cost model prices only the untraveled fraction of the preserved active segment");

    const [light] = await db.insert(trafficLights).values({
        cityId, intersectionId: nodes[2], cycleDuration: 100, currentPhase: 1, phaseElapsed: 0, status: "ACTIVE",
    }).returning({ id: trafficLights.id });
    await db.insert(trafficLightPhases).values({ trafficLightId: light.id, phaseNumber: 1, durationSeconds: 100, state: "RED" });
    await db.insert(trafficLightMovements).values({
        trafficLightId: light.id, phaseNumber: 1, fromRoadId: roadSlowA, toRoadId: roadSlowB, state: "RED",
    });

    async function addVehicle(input: { segment: number; road: number; sequence: number; history?: number; historyRoad?: number; progress: number; status: string; destination: number }) {
        const [vehicle] = await db.insert(vehicles).values({
            simulationRunId: simulationId!, currentRoadId: input.road, currentSegmentId: input.segment,
            destinationIntersectionId: input.destination, routeSequence: input.sequence,
            speedKmh: 0, progress: input.progress, status: input.status,
            position: input.progress === 0 ? [...points[1]] : [...points[2]],
        }).returning({ id: vehicles.id });
        const routeRows = input.history === undefined
            ? [{ vehicleId: vehicle.id, roadId: input.road, segmentId: input.segment, sequence: 0, isReverse: false },
               { vehicleId: vehicle.id, roadId: roadSlowB, segmentId: slowSegmentB, sequence: 1, isReverse: false }]
            : [{ vehicleId: vehicle.id, roadId: input.historyRoad!, segmentId: input.history, sequence: 0, isReverse: false },
               { vehicleId: vehicle.id, roadId: input.road, segmentId: input.segment, sequence: 1, isReverse: false },
               { vehicleId: vehicle.id, roadId: roadSlowB, segmentId: slowSegmentB, sequence: 2, isReverse: false }];
        await db.insert(vehicleRoutes).values(routeRows);
        return vehicle.id;
    }
    const targetVehicle = await addVehicle({
        segment: slowSegmentA, road: roadSlowA, sequence: 1,
        history: historySegment, historyRoad: roadHistory, progress: 0, status: "MOVING", destination: nodes[3],
    });
    await db.delete(vehicleRoutes).where(eq(vehicleRoutes.vehicleId, targetVehicle));
    await db.insert(vehicleRoutes).values([
        { vehicleId: targetVehicle, roadId: roadPast, segmentId: pastSegment, sequence: 0, isReverse: false },
        { vehicleId: targetVehicle, roadId: roadHistory, segmentId: historySegment, sequence: 1, isReverse: false },
        { vehicleId: targetVehicle, roadId: roadSlowA, segmentId: slowSegmentA, sequence: 2, isReverse: false },
        { vehicleId: targetVehicle, roadId: roadSlowB, segmentId: slowSegmentB, sequence: 3, isReverse: false },
    ]);
    // Keep the vehicle partway along its active approach at the evaluation tick.
    // Its eligible alternative begins at that segment's directed exit.
    await db.update(vehicles).set({
        currentSegmentId: historySegment,
        currentRoadId: roadHistory,
        routeSequence: 1,
        progress: 0.25,
        position: sql`ST_LineInterpolatePoint((SELECT geometry FROM road_segments WHERE id = ${historySegment}), 0.25)`,
    }).where(eq(vehicles.id, targetVehicle));
    const followerVehicle = await addVehicle({
        segment: slowSegmentA, road: roadSlowA, sequence: 0, progress: 0.5, status: "WAITING_BEHIND_VEHICLE", destination: nodes[3],
    });
    const redLightVehicle = await addVehicle({
        segment: slowSegmentA, road: roadSlowA, sequence: 0, progress: 0.8, status: "WAITING_AT_SIGNAL", destination: nodes[3],
    });
    const redTurnVehicle = await addVehicle({
        segment: slowSegmentA, road: roadSlowA, sequence: 1,
        history: otherHistorySegment, historyRoad: roadOtherHistory, progress: 0, status: "MOVING", destination: nodes[3],
    });
    await db.update(vehicles).set({ position: [...points[1]] }).where(eq(vehicles.id, redTurnVehicle));
    // Add one permitted and one red incoming turn at the candidate's starting intersection.
    const [sourceLight] = await db.insert(trafficLights).values({
        cityId, intersectionId: nodes[1], cycleDuration: 100, currentPhase: 1, phaseElapsed: 0, status: "ACTIVE",
    }).returning({ id: trafficLights.id });
    await db.insert(trafficLightPhases).values({ trafficLightId: sourceLight.id, phaseNumber: 1, durationSeconds: 100, state: "GREEN" });
    await db.insert(trafficLightMovements).values([
        { trafficLightId: sourceLight.id, phaseNumber: 1, fromRoadId: roadHistory, toRoadId: roadFast, state: "GREEN" },
        { trafficLightId: sourceLight.id, phaseNumber: 1, fromRoadId: roadOtherHistory, toRoadId: roadFast, state: "RED" },
    ]);
    const [redLightFixture] = await db.select({ progress: vehicles.progress, status: vehicles.status })
        .from(vehicles).where(eq(vehicles.id, redLightVehicle));
    assert.equal(redLightFixture.progress, 0.8);
    assert.equal(redLightFixture.status, "WAITING_AT_SIGNAL");

    await stateService.initializeSimulationVehicleStates(simulationId);
    await trafficCache.loadTrafficLightCache(cityId);
    const cache = await cacheService.loadSimulationVehicleCache(simulationId);
    const oldTargetRoute = Array.from(cache.routesByVehicle.get(targetVehicle)!.values()).map((entry) => ({ ...entry }));
    const [beforeFailure] = await db.select({ position: sql<string>`ST_AsText(${vehicles.position})`, progress: vehicles.progress })
        .from(vehicles).where(eq(vehicles.id, targetVehicle));

    await db.execute(sql.raw(`
        CREATE FUNCTION reroute_test_fail_insert() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.vehicle_id = ${Number(targetVehicle)} AND NEW.sequence >= 2 THEN
            RAISE EXCEPTION 'intentional reroute integration failure';
          END IF;
          RETURN NEW;
        END $$;
    `));
    await db.execute(sql`CREATE TRIGGER reroute_test_fail_insert BEFORE INSERT ON vehicle_routes FOR EACH ROW EXECUTE FUNCTION reroute_test_fail_insert()`);
    const failedApplyCount = await rerouting.applyDynamicRerouteCandidates(simulationId, 10);
    assert.equal(failedApplyCount, 0);
    const failedRoute = await db.select({ segmentId: vehicleRoutes.segmentId, sequence: vehicleRoutes.sequence })
        .from(vehicleRoutes).where(eq(vehicleRoutes.vehicleId, targetVehicle)).orderBy(asc(vehicleRoutes.sequence));
    assert.deepEqual(failedRoute.map((row) => [row.sequence, row.segmentId]), [
        [0, pastSegment], [1, historySegment], [2, slowSegmentA], [3, slowSegmentB],
    ]);
    assert.deepEqual(Array.from(cache.routesByVehicle.get(targetVehicle)!.values()).map((entry) => ({ ...entry })), oldTargetRoute);
    const noFailureEvent = await db.select({ id: simulationEvents.id }).from(simulationEvents)
        .where(and(eq(simulationEvents.simulationRunId, simulationId), eq(simulationEvents.type, "DYNAMIC_REROUTE_APPLIED")));
    assert.equal(noFailureEvent.length, 0);
    const [afterFailure] = await db.select({ position: sql<string>`ST_AsText(${vehicles.position})`, progress: vehicles.progress })
        .from(vehicles).where(eq(vehicles.id, targetVehicle));
    assert.deepEqual(afterFailure, beforeFailure);
    say("forced transaction failure preserved database route, cache, position, progress, and emitted no event");
    await db.execute(sql`DROP TRIGGER reroute_test_fail_insert ON vehicle_routes`);
    await db.execute(sql`DROP FUNCTION reroute_test_fail_insert()`);

    // The failed attempt was at T+0; start at T+28 so T+30 is both cooldown-safe
    // and a cadence boundary while the target is still partway along its segment.
    await db.update(simulationRuns).set({ simulationTime: 28 }).where(eq(simulationRuns.id, simulationId));
    Object.assign(config.SimulationConfig, { tickIntervalMs: 30 });
    await engine.start(simulationId);

    const deadline = Date.now() + 15_000;
    let successfulEvents: { id: number }[] = [];
    while (Date.now() < deadline) {
        successfulEvents = await db.select({ id: simulationEvents.id }).from(simulationEvents)
            .where(and(eq(simulationEvents.simulationRunId, simulationId), eq(simulationEvents.type, "DYNAMIC_REROUTE_APPLIED")));
        if (successfulEvents.length > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 30));
    }
    assert.equal(successfulEvents.length, 1, "engine cadence did not apply exactly one reroute");
    const cachedAfterReroute = Array.from(cacheService.getSimulationVehicleCache(simulationId)!.routesByVehicle.get(targetVehicle)!.values())
        .sort((a, b) => a.sequence - b.sequence);
    await engine.stop(simulationId);
    await engine.waitForIdle(simulationId);

    const persistedRoute = await db.select({ segmentId: vehicleRoutes.segmentId, sequence: vehicleRoutes.sequence, isReverse: vehicleRoutes.isReverse })
        .from(vehicleRoutes).where(eq(vehicleRoutes.vehicleId, targetVehicle)).orderBy(asc(vehicleRoutes.sequence));
    assert.deepEqual(persistedRoute.map((row) => [row.sequence, row.segmentId, row.isReverse]), [
        [0, pastSegment, false], [1, historySegment, false], [2, fastSegment, false],
    ]);
    const [vehicleAfterReroute] = await db.select({
        currentSegmentId: vehicles.currentSegmentId,
        routeSequence: vehicles.routeSequence,
        progress: vehicles.progress,
        destinationIntersectionId: vehicles.destinationIntersectionId,
        position: sql<string>`ST_AsText(${vehicles.position})`,
    }).from(vehicles).where(eq(vehicles.id, targetVehicle));
    assert.ok(
        (vehicleAfterReroute.currentSegmentId === historySegment && vehicleAfterReroute.routeSequence === 1) ||
        (vehicleAfterReroute.currentSegmentId === fastSegment && vehicleAfterReroute.routeSequence === 2),
        "vehicle must remain on the preserved active segment or have advanced onto its replacement suffix",
    );
    assert.ok(vehicleAfterReroute.progress >= 0 && vehicleAfterReroute.progress < 1);
    assert.equal(vehicleAfterReroute.destinationIntersectionId, nodes[3]);
    // The engine may perform the next movement tick immediately after route
    // application, so validate that the vehicle stayed on the replacement
    // segment and that its physical position still matches its progress.
    const [reroutePositionCheck] = await db.execute(sql`
        SELECT ST_LineLocatePoint(rs.geometry, ST_SetSRID(v.position, 4326))::real AS progress
        FROM vehicles v JOIN road_segments rs ON rs.id = v.current_segment_id
        WHERE v.id = ${targetVehicle}
    `) as unknown as Array<{ progress: number }>;
    assert.ok(Math.abs(reroutePositionCheck.progress - vehicleAfterReroute.progress) < 0.0001);
    assert.deepEqual(cachedAfterReroute.map((entry) => [entry.sequence, entry.segmentId, entry.isReverse]), persistedRoute.map((entry) => [entry.sequence, entry.segmentId, entry.isReverse]));
    say("engine cadence applied faster route while preserving prefix, destination, position, and progress; cache matches persistence");

    // This vehicle is already beyond the branch point, so the faster branch is
    // unreachable from its directed continuation and its route must stay intact.
    const redTurnRoute = await db.select({ segmentId: vehicleRoutes.segmentId, sequence: vehicleRoutes.sequence })
        .from(vehicleRoutes).where(eq(vehicleRoutes.vehicleId, redTurnVehicle)).orderBy(asc(vehicleRoutes.sequence));
    assert.deepEqual(redTurnRoute.map((entry) => [entry.sequence, entry.segmentId]), [
        [0, otherHistorySegment], [1, slowSegmentA], [2, slowSegmentB],
    ]);
    say("unreachable faster branch was rejected for a vehicle past that branch point");

    let vehicleAfterMovement: { currentSegmentId: number | null; routeSequence: number; progress: number; position: unknown }[];
    await trafficCache.loadTrafficLightCache(cityId);
    for (let tick = 0; tick < 8; tick++) {
        await movement.moveVehicles(simulationId);
        vehicleAfterMovement = await db.select({
        currentSegmentId: vehicles.currentSegmentId,
        routeSequence: vehicles.routeSequence,
        progress: vehicles.progress,
        position: vehicles.position,
        }).from(vehicles).where(eq(vehicles.id, targetVehicle));
        if (vehicleAfterMovement[0]?.currentSegmentId === fastSegment) break;
    }
    const vehicleAfterReplacementTransition = vehicleAfterMovement![0];
    assert.equal(vehicleAfterReplacementTransition.currentSegmentId, fastSegment);
    assert.equal(vehicleAfterReplacementTransition.routeSequence, 2);
    assert.ok(vehicleAfterReplacementTransition.progress > 0 && vehicleAfterReplacementTransition.progress < 1);
    const [located] = await db.execute(sql`
        SELECT ST_LineLocatePoint(rs.geometry, ST_SetSRID(v.position, 4326))::real AS progress
        FROM vehicles v JOIN road_segments rs ON rs.id = v.current_segment_id
        WHERE v.id = ${targetVehicle}
    `) as unknown as Array<{ progress: number }>;
    assert.ok(Math.abs(located.progress - vehicleAfterReplacementTransition.progress) < 0.0001);
    const [followingVehicleAfterMove] = await db.select({ progress: vehicles.progress, status: vehicles.status })
        .from(vehicles).where(eq(vehicles.id, followerVehicle));
    assert.ok(followingVehicleAfterMove.progress >= 0 && followingVehicleAfterMove.progress < 1);
    assert.equal(followingVehicleAfterMove.status, "WAITING_BEHIND_VEHICLE");
    const [redLightAfterMove] = await db.select({ progress: vehicles.progress, status: vehicles.status })
        .from(vehicles).where(eq(vehicles.id, redLightVehicle));
    assert.equal(redLightAfterMove.progress, 0.8);
    assert.equal(redLightAfterMove.status, "WAITING_AT_SIGNAL");
    say("vehicle advanced on replacement segment with geometry/progress aligned; queued and red-light vehicles obeyed controls");

    console.log(JSON.stringify({
        simulationId,
        targetVehicle,
        oldRoute: [pastSegment, historySegment, slowSegmentA, slowSegmentB],
        replacementRoute: [pastSegment, historySegment, fastSegment],
        replacementProgressAfterMovement: vehicleAfterReplacementTransition.progress,
        eventId: successfulEvents[0].id,
    }));
} finally {
    if (engine && simulationId !== undefined) {
        engine.stop(simulationId);
        await engine.waitForIdle(simulationId).catch(() => undefined);
    }
    if (appConnection) await appConnection.end({ timeout: 2 }).catch(() => undefined);
    await admin.end({ timeout: 2 }).catch(() => undefined);
    if (createdDatabase) {
        const cleanup = postgres(baseUrl.toString(), { max: 1, connect_timeout: 5 });
        await cleanup.unsafe(`DROP DATABASE ${testDatabase} WITH (FORCE)`);
        await cleanup.end({ timeout: 2 });
        console.log(`CLEANED isolated database ${testDatabase}`);
    }
}

