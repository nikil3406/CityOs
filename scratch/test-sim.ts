async function runTest() {
  const base = "http://localhost:3000";
  console.log("1. Creating a new simulation run...");
  const createRes = await fetch(`${base}/api/simulation/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cityId: 1 }),
  });
  const run = await createRes.json();
  console.log("Created simulation:", run.id);

  console.log("2. Spawning 5 vehicles...");
  const spawnRes = await fetch(`${base}/api/simulation/runs/${run.id}/vehicles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count: 5 }),
  });
  const spawnData = await spawnRes.json();
  console.log("Spawned count:", spawnData.count);

  console.log("3. Starting simulation engine...");
  const startRes = await fetch(`${base}/api/simulation/runs/${run.id}/start`, {
    method: "POST",
  });
  const startData = await startRes.json();
  console.log("Engine status:", startData.status);

  console.log("4. Waiting for 3 simulation ticks (9s)...");
  await new Promise((r) => setTimeout(r, 9500));

  console.log("5. Fetching vehicle positions...");
  const vehRes = await fetch(`${base}/api/simulation/runs/${run.id}/vehicles`);
  const vehicles = await vehRes.json();
  console.table(
    vehicles.map((v: any) => ({
      id: v.id,
      speedKmh: v.speedKmh,
      status: v.status,
      progress: Number(v.progress).toFixed(3),
      routeSeq: v.routeSequence,
      road: v.currentRoadId,
    }))
  );
}

runTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
