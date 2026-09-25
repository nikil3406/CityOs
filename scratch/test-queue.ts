import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql, eq } from "drizzle-orm";
import * as schema from "../src/db/schema/index";

const client = postgres(
  process.env.DATABASE_URL ||
    "postgresql://postgres:Nikilreddy@localhost:5432/cityos"
);
const db = drizzle(client, { schema });

async function testRedLightQueueAndGreenMove() {
  const base = "http://localhost:3000";

  console.log("===================================================================");
  console.log("    TRAFFIC QUEUE TEST: RED LIGHT QUEUEING -> GREEN LIGHT RESUMPTION");
  console.log("===================================================================");

  // 1. Create simulation run
  console.log("\n[1/6] Creating a fresh simulation run for City 1...");
  const createRes = await fetch(`${base}/api/simulation/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cityId: 1 }),
  });
  const run = await createRes.json();
  const simId = run.id;
  console.log(`Simulation run ID: ${simId}`);

  // 2. Find a road segment >=80m approaching a traffic light
  console.log("\n[2/6] Locating an approach road segment connected to a traffic light...");
  const segmentRows = await db.execute(sql`
    SELECT
      rs.id AS "segmentId",
      rs.road_id AS "roadId",
      rs.length_meters AS "lengthMeters",
      rs.end_intersection_id AS "intersectionId",
      tl.id AS "trafficLightId"
    FROM road_segments rs
    JOIN traffic_lights tl ON tl.intersection_id = rs.end_intersection_id
    WHERE tl.city_id = 1
      AND rs.length_meters >= 80
    LIMIT 1;
  `);

  if (segmentRows.length === 0) {
    throw new Error("No road segment (>=80m) with traffic light found in City 1.");
  }

  const targetSeg = segmentRows[0] as any;
  const segmentId = Number(targetSeg.segmentId);
  const roadId = Number(targetSeg.roadId);
  const intersectionId = Number(targetSeg.intersectionId);
  const segLength = Number(targetSeg.lengthMeters);
  const trafficLightId = Number(targetSeg.trafficLightId);

  console.log(`Segment ${segmentId} (${segLength.toFixed(1)}m, Road ${roadId}) -> Intersection ${intersectionId} (Light ${trafficLightId})`);

  const nextSegRows = await db.execute(sql`
    SELECT rs.id AS "segmentId", rs.road_id AS "roadId"
    FROM road_segments rs
    WHERE rs.start_intersection_id = ${intersectionId}
      AND rs.id <> ${segmentId}
    LIMIT 1;
  `);
  const nextSegId = nextSegRows.length > 0 ? Number((nextSegRows[0] as any).segmentId) : segmentId;
  const nextRoadId = nextSegRows.length > 0 ? Number((nextSegRows[0] as any).roadId) : roadId;

  // 3. Configure traffic light: 9s RED (3 ticks) then 9s GREEN (3 ticks)
  console.log("\n[3/6] Configuring traffic light: Phase 1 = RED (9s), Phase 2 = GREEN (9s)...");

  await db.execute(sql`
    UPDATE traffic_lights
    SET current_phase = 1, phase_elapsed = 0, status = 'ACTIVE'
    WHERE id = ${trafficLightId};
  `);

  await db.delete(schema.trafficLightPhases).where(eq(schema.trafficLightPhases.trafficLightId, trafficLightId));
  await db.insert(schema.trafficLightPhases).values([
    { trafficLightId, phaseNumber: 1, durationSeconds: 9, state: "RED" },
    { trafficLightId, phaseNumber: 2, durationSeconds: 9, state: "GREEN" },
  ]);

  await db.delete(schema.trafficLightMovements).where(eq(schema.trafficLightMovements.trafficLightId, trafficLightId));
  await db.insert(schema.trafficLightMovements).values([
    { trafficLightId, phaseNumber: 1, fromRoadId: roadId, toRoadId: nextRoadId, state: "RED" },
    { trafficLightId, phaseNumber: 2, fromRoadId: roadId, toRoadId: nextRoadId, state: "GREEN" },
  ]);

  console.log("Traffic light set: Phase 1=RED(9s/3 ticks), Phase 2=GREEN(9s/3 ticks)");

  // 4. Spawn vehicles just before the stop zone so they hit red on tick 1
  //    stop zone = last 10m = progress > (1 - 10/segLength)
  const stopProgress = 1 - (10 / segLength);
  const spawns = [
    { label: "Lead (Front)",   progress: Math.min(stopProgress - 0.01, 0.90) },
    { label: "Follower 1",     progress: Math.min(stopProgress - 0.07, 0.80) },
    { label: "Follower 2 (Rear)", progress: Math.min(stopProgress - 0.14, 0.70) },
  ];

  console.log(`\n[4/6] Spawning 3 vehicles. Stop zone starts at ${(stopProgress * 100).toFixed(1)}%...`);
  const spawnedIds: number[] = [];

  for (const s of spawns) {
    const posRes = await db.execute(sql`
      SELECT ST_AsGeoJSON(ST_LineInterpolatePoint(geometry, ${s.progress}))::json AS position
      FROM road_segments WHERE id = ${segmentId};
    `);
    const geo = (posRes[0] as any).position;

    const vRes = await db.execute(sql`
      INSERT INTO vehicles (
        simulation_run_id, current_road_id, current_segment_id,
        destination_intersection_id, route_sequence,
        position, speed_kmh, progress, status
      ) VALUES (
        ${simId}, ${roadId}, ${segmentId},
        ${intersectionId}, 0,
        ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geo)}), 4326),
        30, ${s.progress}, 'WAITING'
      ) RETURNING id;
    `);
    const vehId = Number((vRes[0] as any).id);
    spawnedIds.push(vehId);

    await db.insert(schema.vehicleRoutes).values([
      { vehicleId: vehId, segmentId, sequence: 0, isReverse: false },
      { vehicleId: vehId, segmentId: nextSegId, sequence: 1, isReverse: false },
    ]);
    console.log(`  ${s.label} (ID: ${vehId}) @ ${(s.progress * 100).toFixed(1)}% (${(s.progress * segLength).toFixed(1)}m)`);
  }

  // 5. Start simulation
  console.log("\n[5/6] Starting simulation engine...");
  const startRes = await fetch(`${base}/api/simulation/runs/${simId}/start`, { method: "POST" });
  const startData = await startRes.json();
  if (startData.error) throw new Error(`Start failed: ${JSON.stringify(startData)}`);
  console.log(`Simulation RUNNING`);

  // 6. Monitor 7 ticks
  console.log("\n[6/6] Monitoring 7 ticks (RED=ticks1-3, GREEN=ticks4-6)...");

  for (let tick = 1; tick <= 14; tick++) {
    await new Promise((r) => setTimeout(r, 3200));

    const vRes2 = await fetch(`${base}/api/simulation/runs/${simId}/vehicles`);
    const vData = (await vRes2.json()) as any[];

    const lightRes = await db.execute(sql`
      SELECT current_phase AS "phase", phase_elapsed AS "elapsed"
      FROM traffic_lights WHERE id = ${trafficLightId};
    `);
    const lightInfo = lightRes[0] as any;
    const currentPhase = Number(lightInfo?.phase);
    const phaseLabel = currentPhase === 1 ? "RED" : "GREEN";

    const myVehicles = vData.filter((v) => spawnedIds.includes(Number(v.id)));

    console.log(`\n--- Tick ${tick} (~${tick * 3}s) | Light: ${phaseLabel} (Phase ${currentPhase}, Elapsed ${lightInfo?.elapsed}s) ---`);
    console.table(myVehicles.map((v) => {
      const prog = Number(v.progress);
      return {
        "Vehicle ID": v.id,
        "Speed km/h": v.speedKmh,
        "Status": v.status,
        "Progress %": (prog * 100).toFixed(1),
        "Route Step": v.routeSequence,
        "Dist to End m": (segLength * (1 - prog)).toFixed(1),
      };
    }));

    const atSignal = myVehicles.filter((v) => v.status === "WAITING_AT_SIGNAL").length;
    if (currentPhase === 1) {
      console.log(`RED LIGHT: ${atSignal} vehicle(s) stopped at signal.`);
    } else {
      console.log(`GREEN LIGHT: Vehicles should now cross. ${atSignal} still at signal.`);
    }
  }

  // Stop
  console.log("\nStopping simulation...");
  const stopRes = await fetch(`${base}/api/simulation/runs/${simId}/stop`, { method: "POST" });
  const stopData = await stopRes.json();
  console.log(`Simulation ${simId} stopped: ${stopData.status}`);

  console.log("\n=== TEST COMPLETE ===");
  await client.end();
}

testRedLightQueueAndGreenMove()
  .then(() => process.exit(0))
  .catch((err) => { console.error("Test failed:", err); process.exit(1); });

