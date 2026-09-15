import { DIRECTIONS, VEHICLES, lanePoint } from "./trafficSimulation.ts";
import type { Point, TrafficSimulation } from "./trafficSimulation.ts";

export type DrivenCar = {
  kind: number;
  color: number;
  position: Point;
  previous: Point;
  angle: number;
  previousAngle: number;
  speed: number;
  braking: boolean;
};

export class Driving {
  car: DrivenCar | null = null;
  keys = new Set<string>();
  roads: { a: Point; b: Point }[];
  constructor(simulation: TrafficSimulation) {
    this.roads = simulation.junctions.flatMap((a) =>
      a.neighbors.flatMap((to, direction) =>
        to >= 0 && direction < 2 ? [{ a, b: simulation.junctions[to] }] : [],
      ),
    );
  }
  start(kind: number, near: Point) {
    if (!Number.isInteger(kind) || !VEHICLES[kind])
      throw new Error("Choose a valid vehicle.");
    const road = this.roads.reduce<(typeof this.roads)[number] | undefined>(
      (best, road) => {
        const distance = ({ a, b }: typeof road) =>
          Math.hypot((a.x + b.x) / 2 - near.x, (a.z + b.z) / 2 - near.z);
        return !best || distance(road) < distance(best) ? road : best;
      },
      undefined,
    );
    if (!road) return false;
    const direction = road.a.x === road.b.x ? 1 : 0;
    const position = lanePoint(
      road.a,
      direction,
      Math.hypot(road.b.x - road.a.x, road.b.z - road.a.z) / 2,
    );
    const angle = Math.atan2(DIRECTIONS[direction].x, DIRECTIONS[direction].z);
    this.car = {
      kind,
      color: 0,
      position,
      previous: { ...position },
      angle,
      previousAngle: angle,
      speed: 0,
      braking: false,
    };
    this.keys.clear();
    return true;
  }
  stop() {
    this.car = null;
    this.keys.clear();
  }
  onRoad(position: Point, angle: number, kind: number) {
    const vehicle = VEHICLES[kind];
    // ponytail: test the footprint against retained road rectangles; add a spatial index if the city grows.
    return [-1, 1].every((side) =>
      [-1, 1].every((end) => {
        const x =
          position.x +
          ((side * vehicle.width) / 2) * Math.cos(angle) +
          ((end * vehicle.length) / 2) * Math.sin(angle);
        const z =
          position.z -
          ((side * vehicle.width) / 2) * Math.sin(angle) +
          ((end * vehicle.length) / 2) * Math.cos(angle);
        return this.roads.some(
          ({ a, b }) =>
            x >= Math.min(a.x, b.x) - 1.45 &&
            x <= Math.max(a.x, b.x) + 1.45 &&
            z >= Math.min(a.z, b.z) - 1.45 &&
            z <= Math.max(a.z, b.z) + 1.45,
        );
      }),
    );
  }
  update(delta: number) {
    if (!Number.isFinite(delta) || delta < 0)
      throw new Error("Invalid driving time step.");
    for (
      let remaining = Math.min(delta, 0.2);
      remaining > 0;
      remaining -= 1 / 60
    ) {
      this.step(Math.min(remaining, 1 / 60));
    }
  }
  private step(dt: number) {
    const car = this.car;
    if (!car) return;
    car.previous = { ...car.position };
    car.previousAngle = car.angle;
    const held = (...codes: string[]) =>
      codes.some((code) => this.keys.has(code));
    const throttle =
      Number(held("KeyW", "ArrowUp")) - Number(held("KeyS", "ArrowDown"));
    const brake = held("Space");
    const oldSpeed = car.speed;
    if (brake || !throttle)
      car.speed =
        Math.sign(car.speed) *
        Math.max(0, Math.abs(car.speed) - dt * (brake ? 6 : 0.8));
    else
      car.speed = Math.max(
        -1.5,
        Math.min(
          4,
          car.speed + throttle * dt * (car.speed * throttle < 0 ? 5 : 2),
        ),
      );
    const steering =
      Number(held("KeyA", "ArrowLeft")) - Number(held("KeyD", "ArrowRight"));
    const angle =
      car.angle +
      ((steering * car.speed) / VEHICLES[car.kind].length) * dt * 0.8;
    const position = {
      x: car.position.x + Math.sin(angle) * car.speed * dt,
      z: car.position.z + Math.cos(angle) * car.speed * dt,
    };
    if (this.onRoad(position, angle, car.kind)) {
      car.position = position;
      car.angle = angle;
    } else car.speed = 0;
    car.braking = brake || Math.abs(car.speed) < Math.abs(oldSpeed);
  }
}
