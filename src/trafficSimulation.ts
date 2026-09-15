import { createRandom } from "./randomSeed.ts";

export type Point = { x: number; z: number };
export type Crossing = Point & { horizontal: boolean };
export const DIRECTIONS: Point[] = [
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
  { x: 0, z: -1 },
];
export const TIMING = {
  minGreen: 4,
  maxGreen: 12,
  gap: 2,
  amber: 3,
  clearance: 1.5,
  walk: 5,
  flash: 3,
};
export const STOP_LINE = 4.1;
export const LANE_OFFSET = 0.72;
export const WALK_EDGE = 1.72;
export const GAP = 0.35;
export const BRAKING = 2.4;
export const STEP = 1 / 30;
export type Stage = "green" | "amber" | "clearance" | "walk" | "flash";

export class SignalController {
  phase = 0;
  stage: Stage = "green";
  elapsed = 0;
  gap = 0;
  calls = [false, false, false, false, false];
  constructor(phase = 0) {
    this.phase = phase;
  }
  vehicle(direction: number) {
    return this.phase === direction && this.stage === "green"
      ? "green"
      : this.phase === direction && this.stage === "amber"
        ? "amber"
        : "red";
  }
  get pedestrian() {
    return this.stage === "walk"
      ? "green"
      : this.stage === "flash"
        ? "flash"
        : "red";
  }
  update(dt: number, demand: boolean[], occupied: boolean) {
    this.elapsed += dt;
    demand.forEach((requested, i) => {
      if (requested) this.calls[i] = true;
    });
    if (this.stage === "green" || this.stage === "walk")
      this.calls[this.phase] = false;
    const competing = this.calls.some((call, i) => call && i !== this.phase);
    this.gap = demand[this.phase] ? 0 : this.gap + dt;
    let next: Stage | undefined;
    if (
      this.stage === "green" &&
      competing &&
      this.elapsed >= TIMING.minGreen &&
      (this.elapsed >= TIMING.maxGreen || this.gap >= TIMING.gap)
    )
      next = "amber";
    if (this.stage === "amber" && this.elapsed >= TIMING.amber)
      next = "clearance";
    if (this.stage === "walk" && this.elapsed >= TIMING.walk) next = "flash";
    if (this.stage === "flash" && this.elapsed >= TIMING.flash)
      next = "clearance";
    if (
      this.stage === "clearance" &&
      this.elapsed >= TIMING.clearance &&
      !occupied
    ) {
      // Round-robin among latched calls prevents a busy approach from starving the others.
      for (let offset = 1; offset <= 5; offset++) {
        const phase = (this.phase + offset) % 5;
        if (this.calls[phase]) {
          this.phase = phase;
          break;
        }
      }
      next = this.phase === 4 ? "walk" : "green";
      this.calls[this.phase] = false;
    }
    if (next) {
      this.stage = next;
      this.elapsed = 0;
      this.gap = 0;
    }
  }
}

export type Junction = Point & {
  id: number;
  neighbors: number[];
  signal: SignalController | null;
  occupant: number | null;
  crossings: number[];
};
export const VEHICLES = [
  { name: "Hatchback", length: 1.25, width: 0.65, height: 0.42 },
  { name: "Sedan", length: 1.55, width: 0.68, height: 0.4 },
  { name: "SUV", length: 1.6, width: 0.73, height: 0.56 },
  { name: "Delivery van", length: 1.75, width: 0.74, height: 0.7 },
  { name: "Taxi", length: 1.55, width: 0.68, height: 0.43 },
  { name: "City bus", length: 2.05, width: 0.78, height: 0.76 },
];
export type Car = {
  id: number;
  kind: number;
  color: number;
  from: number;
  to: number;
  direction: number;
  nextDirection: number;
  s: number;
  speed: number;
  desiredSpeed: number;
  length: number;
  crossing: boolean;
  progress: number;
  path: Point[];
  pathLength: number;
  waitingSince: number;
  braking: boolean;
  lastSignal: string;
  amberCommitted: boolean;
  position: Point;
  previous: Point;
  angle: number;
  previousAngle: number;
};
export type Walker = {
  id: number;
  crossing: number;
  side: number;
  state: "stroll" | "approach" | "wait" | "cross";
  distance: number;
  speed: number;
  height: number;
  color: number;
  walkTime: number;
  offset: number;
  position: Point;
  previous: Point;
  angle: number;
  previousAngle: number;
};
export type WalkCrossing = Crossing & {
  junction: number;
  waiting: number;
  occupied: number;
  outward: number;
};
export type TrafficConfig = {
  citySize: number;
  spacing: number;
  offset: number;
  seed: string;
  crosswalks: Crossing[];
  cars?: number;
  people?: number;
  roadNodes?: { x: number; z: number; neighbors: number[] }[];
};
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
export function lanePoint(
  junction: Point,
  direction: number,
  along: number,
): Point {
  const d = DIRECTIONS[direction];
  return {
    x: junction.x + d.x * along - d.z * LANE_OFFSET,
    z: junction.z + d.z * along + d.x * LANE_OFFSET,
  };
}
export function stoppingDistance(speed: number) {
  return (speed * speed) / (2 * BRAKING);
}

export class TrafficSimulation {
  junctions: Junction[] = [];
  crossings: WalkCrossing[] = [];
  cars: Car[] = [];
  people: Walker[] = [];
  time = 0;
  completedTrips = 0;
  random: () => number;
  config: TrafficConfig;
  constructor(config: TrafficConfig) {
    if (
      !Number.isInteger(config.citySize) ||
      config.citySize < 3 ||
      !Number.isFinite(config.spacing) ||
      config.spacing < 11 ||
      !Number.isFinite(config.offset)
    ) {
      throw new Error(
        "Traffic requires a grid of at least 3 blocks and spacing of at least 11.",
      );
    }
    this.config = config;
    this.random = createRandom(`${config.seed}:traffic`);
    const n = config.citySize - 1;
    for (let x = 0; x < n; x++)
      for (let z = 0; z < n; z++) {
        this.junctions.push({
          id: x * n + z,
          x: x * config.spacing - config.offset + config.spacing / 2,
          z: z * config.spacing - config.offset + config.spacing / 2,
          neighbors: [
            x + 1 < n ? (x + 1) * n + z : -1,
            z + 1 < n ? x * n + z + 1 : -1,
            x > 0 ? (x - 1) * n + z : -1,
            z > 0 ? x * n + z - 1 : -1,
          ],
          signal: (x + z) % 4 === 0 ? null : new SignalController((x + z) % 4),
          occupant: null,
          crossings: [],
        });
      }
    if (config.roadNodes) {
      if (config.roadNodes.length !== this.junctions.length)
        throw new Error("Road layout has the wrong node count.");
      config.roadNodes.forEach((node, id) => {
        if (
          node.neighbors.length !== 4 ||
          node.neighbors.some(
            (to) =>
              !Number.isInteger(to) || to < -1 || to >= this.junctions.length,
          )
        )
          throw new Error("Invalid road connection.");
        this.junctions[id].neighbors = [...node.neighbors];
        if (node.neighbors.filter((to) => to >= 0).length < 3)
          this.junctions[id].signal = null;
      });
    }
    for (const c of config.crosswalks) {
      if (!Number.isFinite(c.x) || !Number.isFinite(c.z))
        throw new Error("Invalid crossing coordinates.");
      const x = Math.round(
        (c.x + config.offset - config.spacing / 2) / config.spacing,
      );
      const z = Math.round(
        (c.z + config.offset - config.spacing / 2) / config.spacing,
      );
      const junction = this.junctions[x * n + z];
      if (!junction || x < 0 || x >= n || z < 0 || z >= n) continue;
      junction.crossings.push(this.crossings.length);
      this.crossings.push({
        ...c,
        junction: junction.id,
        waiting: 0,
        occupied: 0,
        outward:
          Math.sign(c.horizontal ? c.z - junction.z : c.x - junction.x) || 1,
      });
    }
    this.setCounts(config.cars ?? 90, config.people ?? 160);
  }
  setCounts(cars: number, people: number) {
    if (
      !Number.isInteger(cars) ||
      cars < 0 ||
      cars > 300 ||
      !Number.isInteger(people) ||
      people < 0 ||
      people > 400
    )
      throw new Error("Invalid population.");
    // Rebuild only on the user's density change, using an independent seed stream.
    this.cars = [];
    this.people = [];
    this.time = 0;
    this.completedTrips = 0;
    this.random = createRandom(`${this.config.seed}:traffic`);
    this.junctions.forEach((j) => {
      j.occupant = null;
      if (j.signal) j.signal = new SignalController(j.id % 4);
    });
    this.crossings.forEach((c) => {
      c.waiting = 0;
      c.occupied = 0;
    });
    const edges: {
      from: number;
      to: number;
      direction: number;
      rank: number;
    }[] = [];
    for (const j of this.junctions)
      j.neighbors.forEach((to, direction) => {
        if (to >= 0)
          edges.push({
            from: j.id,
            to,
            direction,
            rank: Math.hypot(j.x, j.z) + this.random() * 75,
          });
      });
    edges.sort((a, b) => a.rank - b.rank);
    edges.slice(0, cars).forEach((edge, id) => {
      const kind = id % VEHICLES.length;
      const position = lanePoint(
        this.junctions[edge.from],
        edge.direction,
        this.config.spacing / 2,
      );
      this.cars.push({
        ...edge,
        id,
        kind,
        color: Math.floor(this.random() * 8),
        s: this.config.spacing / 2,
        speed: 0,
        desiredSpeed: 1.5 + this.random() * 0.6,
        length: VEHICLES[kind].length,
        nextDirection: this.chooseDirection(edge.to, edge.direction),
        crossing: false,
        progress: 0,
        path: [],
        pathLength: 0,
        waitingSince: 0,
        braking: false,
        lastSignal: "red",
        amberCommitted: false,
        position,
        previous: { ...position },
        angle: Math.atan2(
          DIRECTIONS[edge.direction].x,
          DIRECTIONS[edge.direction].z,
        ),
        previousAngle: 0,
      });
    });
    const crossings = this.crossings
      .map((c, id) => ({ id, rank: Math.hypot(c.x, c.z) + this.random() * 60 }))
      .sort((a, b) => a.rank - b.rank);
    for (let id = 0; id < people && crossings.length; id++) {
      const crossing = crossings[id % Math.min(crossings.length, 65)].id;
      const side = id % 2 ? 1 : -1;
      const person: Walker = {
        id,
        crossing,
        side,
        state: "stroll",
        distance: this.random() * 4,
        speed: 0.34 + this.random() * 0.16,
        height: 0.5 + this.random() * 0.16,
        color: Math.floor(this.random() * 8),
        walkTime: 0,
        offset:
          ((Math.floor(id / Math.min(crossings.length, 65)) % 7) - 3) * 0.24,
        position: { x: 0, z: 0 },
        previous: { x: 0, z: 0 },
        angle: 0,
        previousAngle: 0,
      };
      person.position = this.walkPoint(person);
      person.previous = { ...person.position };
      this.people.push(person);
    }
  }
  chooseDirection(junction: number, incoming: number) {
    const choices = [
      incoming,
      incoming,
      (incoming + 1) % 4,
      (incoming + 3) % 4,
    ].filter((d) => this.junctions[junction].neighbors[d] >= 0);
    return choices[Math.floor(this.random() * choices.length)];
  }
  walkPoint(person: Walker): Point {
    const c = this.crossings[person.crossing];
    const across =
      person.state === "cross"
        ? person.side * (WALK_EDGE - person.distance)
        : person.side * WALK_EDGE;
    const along =
      person.offset +
      (person.state === "stroll" || person.state === "approach"
        ? c.outward * person.distance
        : 0);
    return c.horizontal
      ? { x: c.x + across, z: c.z + along }
      : { x: c.x + along, z: c.z + across };
  }
  exitAvailable(car: Car) {
    // ponytail: scan at most 300 cars for exit reservations; index receiving lanes if the population cap grows.
    const to = this.junctions[car.to].neighbors[car.nextDirection];
    const exitCenter = STOP_LINE + car.length / 2;
    return !this.cars.some(
      (other) =>
        other.id !== car.id &&
        !other.crossing &&
        other.from === car.to &&
        other.to === to &&
        other.s - other.length / 2 < exitCenter + car.length / 2 + GAP,
    );
  }
  beginCrossing(car: Car) {
    const j = this.junctions[car.to];
    j.occupant = car.id;
    car.crossing = true;
    car.progress = 0;
    const reach = STOP_LINE + car.length / 2;
    const start = lanePoint(j, car.direction, -reach);
    const end = lanePoint(j, car.nextDirection, reach);
    const a = DIRECTIONS[car.direction],
      b = DIRECTIONS[car.nextDirection];
    const handle =
      car.direction === car.nextDirection
        ? (reach * 2) / 3
        : reach +
          (car.nextDirection === (car.direction + 1) % 4
            ? -LANE_OFFSET
            : LANE_OFFSET);
    const c1 = { x: start.x + a.x * handle, z: start.z + a.z * handle };
    const c2 = { x: end.x - b.x * handle, z: end.z - b.z * handle };
    car.path = [];
    // ponytail: 24 samples keep turns on a constant-distance polyline; use arc-length splines for larger roads.
    for (let i = 0; i <= 24; i++) {
      const t = i / 24,
        u = 1 - t;
      car.path.push({
        x:
          u ** 3 * start.x +
          3 * u * u * t * c1.x +
          3 * u * t * t * c2.x +
          t ** 3 * end.x,
        z:
          u ** 3 * start.z +
          3 * u * u * t * c1.z +
          3 * u * t * t * c2.z +
          t ** 3 * end.z,
      });
    }
    car.pathLength = car.path
      .slice(1)
      .reduce((sum, p, i) => sum + distance(p, car.path[i]), 0);
  }
  step(dt = STEP) {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.1)
      throw new Error("Traffic step must be between 0 and 0.1 seconds.");
    this.time += dt;
    const lanes = new Map<string, Car[]>();
    const approaches = new Map<number, Car[]>();
    for (const car of this.cars) {
      car.previous = { ...car.position };
      car.previousAngle = car.angle;
      if (car.crossing) continue;
      const key = `${car.from}:${car.to}`;
      if (!lanes.has(key)) lanes.set(key, []);
      lanes.get(key)!.push(car);
      if (!approaches.has(car.to)) approaches.set(car.to, []);
      approaches.get(car.to)!.push(car);
    }
    lanes.forEach((cars) => cars.sort((a, b) => b.s - a.s));
    this.crossings.forEach((c) => {
      c.waiting = 0;
      c.occupied = 0;
    });
    for (const p of this.people) {
      if (p.state === "wait") this.crossings[p.crossing].waiting++;
      if (p.state === "cross") this.crossings[p.crossing].occupied++;
    }
    for (const j of this.junctions) {
      const demand = [false, false, false, false, false];
      for (const car of approaches.get(j.id) ?? [])
        demand[car.direction] = true;
      demand[4] = j.crossings.some((id) => this.crossings[id].waiting > 0);
      j.signal?.update(
        dt,
        demand,
        j.occupant !== null ||
          j.crossings.some((id) => this.crossings[id].occupied > 0),
      );
    }
    // Pedestrian intent is evaluated before admitting any new vehicle.
    for (const p of this.people) {
      p.previous = { ...p.position };
      p.previousAngle = p.angle;
      const c = this.crossings[p.crossing],
        j = this.junctions[c.junction];
      if (p.state === "wait") {
        if (
          j.occupant === null &&
          (!j.signal || j.signal.pedestrian === "green")
        ) {
          p.state = "cross";
          p.distance = 0;
          c.occupied++;
        }
      } else {
        p.walkTime += dt;
        if (p.state === "stroll") {
          p.distance = Math.min(4, p.distance + p.speed * dt);
          if (p.distance >= 4) p.state = "approach";
        } else if (p.state === "approach") {
          p.distance = Math.max(0, p.distance - p.speed * dt);
          if (p.distance <= 0) {
            p.state = "wait";
            c.waiting++;
          }
        } else {
          p.distance = Math.min(WALK_EDGE * 2, p.distance + p.speed * dt);
          if (p.distance >= WALK_EDGE * 2) {
            p.side *= -1;
            p.state = "stroll";
            p.distance = 0;
          }
        }
      }
      p.position = this.walkPoint(p);
      const dx = p.position.x - p.previous.x,
        dz = p.position.z - p.previous.z;
      if (Math.hypot(dx, dz) > 0.00001) p.angle = Math.atan2(dx, dz);
    }
    const leaders = new Map<number, Car>();
    lanes.forEach((cars) =>
      cars.forEach((car, i) => {
        if (i) leaders.set(car.id, cars[i - 1]);
      }),
    );
    // Front vehicles first; deterministic order breaks equal-arrival ties at uncontrolled junctions.
    const ordered = [...this.cars].sort((a, b) => b.s - a.s || a.id - b.id);
    for (const car of ordered) {
      const oldSpeed = car.speed;
      if (car.crossing) {
        car.speed = Math.min(car.desiredSpeed * 0.85, car.speed + dt * 1.2);
        car.progress = Math.min(car.pathLength, car.progress + car.speed * dt);
        let remaining = car.progress;
        for (let i = 1; i < car.path.length; i++) {
          const a = car.path[i - 1],
            b = car.path[i],
            length = distance(a, b);
          if (remaining <= length || i === car.path.length - 1) {
            const t = Math.min(1, remaining / length);
            car.position = {
              x: a.x + (b.x - a.x) * t,
              z: a.z + (b.z - a.z) * t,
            };
            car.angle = Math.atan2(b.x - a.x, b.z - a.z);
            break;
          }
          remaining -= length;
        }
        if (car.progress >= car.pathLength) {
          const j = this.junctions[car.to];
          j.occupant = null;
          car.from = car.to;
          car.direction = car.nextDirection;
          car.to = j.neighbors[car.direction];
          car.nextDirection = this.chooseDirection(car.to, car.direction);
          car.s = STOP_LINE + car.length / 2;
          car.crossing = false;
          car.waitingSince = this.time;
          car.lastSignal = "red";
          car.amberCommitted = false;
          this.completedTrips++;
        }
      } else {
        const j = this.junctions[car.to];
        const stop = this.config.spacing - STOP_LINE - car.length / 2;
        let limit = stop;
        const leader = leaders.get(car.id);
        if (leader)
          limit = Math.min(
            limit,
            leader.s - (leader.length + car.length) / 2 - GAP,
          );
        const pedestrians = j.crossings.some(
          (id) =>
            this.crossings[id].occupied > 0 ||
            (!j.signal && this.crossings[id].waiting > 0),
        );
        const signal = j.signal?.vehicle(car.direction) ?? "green";
        if (signal === "amber" && car.lastSignal !== "amber") {
          car.amberCommitted =
            stoppingDistance(car.speed) > Math.max(0, stop - car.s);
        }
        if (signal !== "amber") car.amberCommitted = false;
        car.lastSignal = signal;
        let priority = true;
        if (!j.signal) {
          const contenders = (approaches.get(j.id) ?? []).filter(
            (other) => !other.crossing && other.s >= stop - 0.5,
          );
          const right = contenders.find(
            (other) => other.direction === (car.direction + 3) % 4,
          );
          const opposing = contenders.find(
            (other) =>
              other.direction === (car.direction + 2) % 4 &&
              car.nextDirection === (car.direction + 3) % 4 &&
              other.nextDirection !== (other.direction + 3) % 4,
          );
          priority = !right && !opposing;
          // ponytail: break a four-way priority-to-right stand-off by earliest arrival then ID.
          if (
            right &&
            new Set(contenders.map((other) => other.direction)).size === 4
          ) {
            priority =
              [...contenders].sort(
                (a, b) => a.waitingSince - b.waitingSince || a.id - b.id,
              )[0]?.id === car.id;
          }
        }
        const permission =
          signal === "green" || (signal === "amber" && car.amberCommitted);
        const enter =
          !leader &&
          permission &&
          priority &&
          !pedestrians &&
          j.occupant === null &&
          this.exitAvailable(car);
        // Always approach the line first; reserve the entire conflict area only when at its boundary.
        if (enter && stop - car.s < 0.015) {
          this.beginCrossing(car);
        } else {
          const gap = Math.max(0, limit - car.s);
          const targetSpeed = enter
            ? car.desiredSpeed
            : Math.min(car.desiredSpeed, Math.sqrt(2 * BRAKING * gap));
          car.speed = Math.max(0, Math.min(targetSpeed, car.speed + dt * 1.2));
          car.s += Math.min(gap, car.speed * dt);
          car.position = lanePoint(
            this.junctions[car.from],
            car.direction,
            car.s,
          );
        }
      }
      car.braking = car.speed < oldSpeed - 0.001 || car.speed < 0.05;
    }
  }
}
