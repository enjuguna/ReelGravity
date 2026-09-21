import Matter from "matter-js";

export type PhysicsPhase = "heap" | "lifting" | "result" | "returning";
export type PhysicsBodyState = { phase: PhysicsPhase; transitionId: number; target?: { x:number; y:number; angle:number }; lastRendered?: { x:number; y:number; angle:number; phase:PhysicsPhase } };

export function createFixedStepClock(stepMs: number, maxSteps: number) {
  let last = 0;
  let accumulator = 0;
  return {
    reset(now: number) { last = now; accumulator = 0; },
    advance(now: number, update: (stepMs: number) => void, paused: boolean) {
      if (!last) last = now;
      if (paused) { last = now; accumulator = 0; return; }
      const elapsed = Math.min(50, Math.max(0, now - last));
      last = now;
      accumulator = Math.min(accumulator + elapsed, stepMs * maxSteps);
      let steps = 0;
      while (accumulator >= stepMs && steps < maxSteps) { update(stepMs); accumulator -= stepMs; steps += 1; }
    },
  };
}

export function shouldWriteTransform(previous: PhysicsBodyState["lastRendered"], body: Matter.Body, phase: PhysicsPhase) {
  if (!previous || previous.phase !== phase) return true;
  return Math.abs(previous.x - body.position.x) > 0.05 || Math.abs(previous.y - body.position.y) > 0.05 || Math.abs(previous.angle - body.angle) > 0.001;
}

export function boundedReleaseVelocity(body: Matter.Body, vx: number, vy: number) {
  return { x: Math.max(-18, Math.min(18, vx || body.velocity.x)), y: Math.max(-18, Math.min(18, vy || body.velocity.y)) };
}
