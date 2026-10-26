import { performance } from "perf_hooks";
import os from "os";
import { allocateCourtSchedule, type CourtRosterPlayer } from "./court-schedule";

export function runProductionBenchmark() {
  const roster40: CourtRosterPlayer[] = [];
  let totalFriendEdges = 0;

  for (let i = 1; i <= 40; i++) {
    roster40.push({ id: `player-${i}`, displayName: `Player ${i}`, priority: 1, friendIds: [] });
  }

  // Set up complex overlapping and isolated friend clusters:
  roster40[0]!.friendIds = ["player-2", "player-3", "player-4"]; // 3 edges
  roster40[1]!.friendIds = ["player-3", "player-5", "player-6"]; // 3 edges
  roster40[2]!.friendIds = ["player-1", "player-2", "player-7"]; // 3 edges

  roster40[10]!.friendIds = ["player-12", "player-13", "player-14"];
  roster40[11]!.friendIds = ["player-11", "player-13", "player-14"];
  roster40[12]!.friendIds = ["player-11", "player-12", "player-14"];
  roster40[13]!.friendIds = ["player-11", "player-12", "player-13"]; // 12 edges

  roster40[19]!.friendIds = ["player-21"];
  roster40[20]!.friendIds = ["player-20"];
  roster40[24]!.friendIds = ["player-26"];
  roster40[25]!.friendIds = ["player-25"];

  roster40[30]!.friendIds = ["player-32"];
  roster40[32]!.friendIds = ["player-34"];
  roster40[35]!.friendIds = ["player-37"];

  for (const p of roster40) {
    totalFriendEdges += (p.friendIds ?? []).length;
  }

  const session = {
    id: "wednesday-benchmark",
    startsAt: "18:00",
    courtCount: 4,
    durationMinutes: 120, // 8 rounds
  };

  // Measure initial cold run (warmup run 1)
  const tWarmup0 = performance.now();
  allocateCourtSchedule(session, roster40, { candidateCount: 1 });
  const tWarmup1 = performance.now();
  const coldTime = tWarmup1 - tWarmup0;

  // Additional 49 warmup runs
  const warmupTimes = [coldTime];
  for (let i = 0; i < 49; i++) {
    const t0 = performance.now();
    allocateCourtSchedule(session, roster40, { candidateCount: 1 });
    const t1 = performance.now();
    warmupTimes.push(t1 - t0);
  }

  // Steady-state measurement: 200 runs
  const SAMPLES = 200;
  const steadyTimes: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t0 = performance.now();
    allocateCourtSchedule(session, roster40, { candidateCount: 1 });
    const t1 = performance.now();
    steadyTimes.push(t1 - t0);
  }

  steadyTimes.sort((a, b) => a - b);

  const avg = steadyTimes.reduce((a, b) => a + b, 0) / steadyTimes.length;
  const median = steadyTimes[Math.floor(steadyTimes.length / 2)]!;
  const p95 = steadyTimes[Math.floor(steadyTimes.length * 0.95)]!;
  const min = steadyTimes[0]!;
  const max = steadyTimes[steadyTimes.length - 1]!;

  console.log("=== PRODUCTION BENCHMARK ENVIRONMENT & REPORT ===");
  console.log(`OS: ${os.type()} ${os.release()} (${os.arch()})`);
  console.log(`CPU: ${os.cpus()[0]?.model}`);
  console.log(`Node.js version: ${process.version}`);
  console.log(`Session Configuration: 40 participants, 4 courts (16 active slots/round), 8 rounds (120 min)`);
  console.log(`Friend Preference Edges: ${totalFriendEdges} directed edges`);
  console.log(`Database operations: EXCLUDED (pure in-memory algorithm)`);
  console.log(`Number of benchmarked 8-round runs: ${SAMPLES}`);
  console.log("-------------------------------------------------");
  console.log(`Cold Execution Time (Warmup Run 1): ${coldTime.toFixed(3)} ms`);
  console.log(`Warmup Maximum (50 runs):          ${Math.max(...warmupTimes).toFixed(3)} ms`);
  console.log(`Steady-State Average (200 runs):    ${avg.toFixed(3)} ms`);
  console.log(`Steady-State Median:               ${median.toFixed(3)} ms`);
  console.log(`Steady-State P95:                  ${p95.toFixed(3)} ms`);
  console.log(`Steady-State Min:                  ${min.toFixed(3)} ms`);
  console.log(`Steady-State Max:                  ${max.toFixed(3)} ms`);
  console.log("=================================================");
}
