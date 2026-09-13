# City traffic and walking people

Run `npm run dev`, then open the local URL printed by Vite. The **City life · Dutch traffic** panel controls car and pedestrian counts, pauses traffic, and moves the camera to crossings. Changing density restarts the traffic population deterministically. The existing city lighting and day/night cycle keep running when traffic is paused.

The default population is 90 vehicles and 160 pedestrians. Vehicles include hatchbacks, sedans, SUVs with roof rails, delivery vans, taxis with roof signs, and short city buses. Colors, dimensions, speeds, windows, brake lights, headlights, and plates vary. Taxi plates are blue; other plates are yellow. Headlights and signal lenses are unlit colored geometry, so they stay visible at night without adding expensive real lights.

## What “Dutch” means here

There is no single universal Dutch traffic-light algorithm. This project implements a **simplified vehicle-actuated controller**, inspired by Dutch signal-group operation: a guaranteed green period, detector-based extension, resting in green when there is no competing request, and clearance before releasing conflicting traffic. CROW describes these ideas as *vastgroen*, *voertuigafhankelijk groen*, and *wachtgroen*. [CROW: signaalgroepafwikkeling](https://kennisbank.crow.nl/public/gastgebruiker/VMGT/Handboek_verkeerslichtenregelingen_2022/Signaalgroepafwikkeling/114458).

This is a visual simulation, not CCOL, a certified controller, or an engineering design for a real intersection. Its timings are adjustable simulation defaults, not prescribed Dutch timings. Real junctions need site-specific detection, conflict geometry, and engineered clearance times.

## Signal controller

`SignalController` in `src/trafficSimulation.ts` runs independently at each signalized junction. About three quarters of junctions have signals; every fourth diagonal grid position is uncontrolled. Initial phases differ by junction, so the whole city does not change together. This is not a coordinated green wave.

There are five request groups:

| Group | Movement |
| --- | --- |
| 0 | Vehicles travelling east |
| 1 | Vehicles travelling south |
| 2 | Vehicles travelling west |
| 3 | Vehicles travelling north |
| 4 | Pedestrians at this junction's crossings |

Only one vehicle approach receives green at a time. Straight, left, and right movements from that approach are protected against other approaches. Pedestrians receive an exclusive phase. This deliberately conservative layout avoids permissive-turn conflicts without pretending that every junction has dedicated turning lanes.

### Requests and phase selection

Each incoming lane acts as a virtual detector. A vehicle approaching the junction requests its direction. A pedestrian reaching the curb registers a request, equivalent to pressing the crossing button. The yellow button boxes are visual; simulated people press them automatically.

Requests are latched until served. At the next phase selection, the controller scans cyclically from the last group and picks the next requested group, skipping empty groups. A continuously busy approach cannot monopolize the controller. Physical blockage can still delay everyone: safety clearance is never overridden to satisfy a waiting-time target.

### Vehicle sequence

```text
GREEN (minimum, then extension / resting green)
  → AMBER
  → ALL RED (minimum clearance + wait for actual occupancy to clear)
  → next requested vehicle GREEN or pedestrian WALK
```

| Setting in `TIMING` | Default | Meaning |
| --- | --- | --- |
| `minGreen` | 4 s | Green cannot end before this minimum |
| `maxGreen` | 12 s | End green when another group is waiting and this limit is reached |
| `gap` | 2 s | With another request waiting, end green after this detector-free gap, once minimum green has elapsed |
| `amber` | 3 s | Amber before all red |
| `clearance` | 1.5 s | Minimum all-red duration; occupancy can extend it |
| `walk` | 5 s | Pedestrians may start crossing |
| `flash` | 3 s | Flashing green; existing pedestrians finish |

If no other group is waiting, a vehicle green remains green, even beyond `maxGreen`. A new competing request allows the controller to leave this resting state.

Intergreen concerns the interval between the outgoing group's amber/flashing-green start and the incoming group's green. This model uses amber or flashing green followed by a minimum all-red interval, extended by actual occupancy. It does **not** implement CROW's geometric calculation of pairwise clearance times. [CROW: intergroentijd](https://kennisbank.crow.nl/public/gastgebruiker/VMGT/Richtlijn_ontruimings-_en_intergroentijden_verkeersregelinstallaties_2024/Intergroentijd/119193).

### Amber decisions and red lights

A driver computes stopping distance as `speed² / (2 × BRAKING)` when first observing amber. If it can stop before the line, it commits to stopping for that amber phase. Otherwise it may proceed on amber, provided the junction and exit are free. It cannot accelerate toward the line and then reinterpret the same amber as permission to go.

Red prohibits new entry, including right turns. Vehicles already admitted finish their movement; the controller waits for them before releasing conflicting traffic. The government traffic-rules translation covers amber stopping and the meanings of vehicle/pedestrian signals in Articles 68 and 74. [Dutch traffic signs and regulations](https://www.government.nl/site/binaries/site-content/collections/documents/2024/02/09/road-traffic-signs-and-regulations-in-the-netherlands/Road%2BTraffic%2BSigns%2Band%2BRegulations%2Bin%2Bthe%2BNetherlands.pdf).

## Vehicle movement and yielding

Road connections come directly from the existing grid spacing and offset. Vehicles keep right, choose valid straight/left/right exits, and never turn into a missing boundary road. They circulate within the connected road grid; they do not teleport at an edge. An independent seeded random stream keeps traffic changes from changing the city's random generation.

Each tick sorts cars within incoming lanes. A following car stays behind its leader with a bumper gap. Desired speed varies across cars and acceleration is capped; a stopping-distance speed cap slows them toward a stop or queue. A hard position cap prevents overlap during sudden blockage. This is a kinematic safety constraint, not a full vehicle-dynamics model.

Green alone does not authorize entry. Before entering, the car must have:

1. No car ahead on its incoming lane.
2. An allowed signal, or priority at an uncontrolled junction.
3. No conflicting pedestrians.
4. A free intersection reservation.
5. Enough space in the receiving lane for its full length and the following gap.

The car reserves the entire junction, traverses a sampled curved path at controlled speed, and releases the reservation only after its rear has cleared the crossing area. Consequently there is at most one car traversing a junction at a time. This sacrifices throughput for a simple, auditable conflict rule; replace it with movement-specific conflict reservations if simultaneous non-conflicting movements become necessary.

At uncontrolled junctions, vehicles yield to approaching traffic from their right. A left-turning vehicle also yields to an opposing straight/right movement. A four-way priority-to-right stand-off is broken deterministically by oldest approach arrival, then vehicle ID—a simulation concession, not a Dutch legal priority rule. The real priority-to-right and turning rules are described in Articles 15 and 18 of the [government translation](https://www.government.nl/site/binaries/site-content/collections/documents/2024/02/09/road-traffic-signs-and-regulations-in-the-netherlands/Road%2BTraffic%2BSigns%2Band%2BRegulations%2Bin%2Bthe%2BNetherlands.pdf).

## Crossings and pedestrians

The existing generated crosswalks are reused. At signalized junctions, each has pedestrian signals. Crossings at uncontrolled junctions operate as zebras.

- **Signalized crossing:** wait for steady pedestrian green before starting. Flashing green is shown at 50 cycles per minute; this simulation conservatively admits no new walkers during flashing green. Walkers already crossing continue, including during red clearance. Vehicle green remains blocked until all crossing people finish.
- **Zebra:** a waiting or crossing pedestrian blocks new vehicle admissions. A car already committed finishes clearing; the pedestrian waits until the junction is free before stepping out. This prevents a pedestrian from appearing in front of an already-admitted car. Yielding to pedestrians crossing or apparently about to cross a zebra is covered by Article 49 of the [government translation](https://www.government.nl/site/binaries/site-content/collections/documents/2024/02/09/road-traffic-signs-and-regulations-in-the-netherlands/Road%2BTraffic%2BSigns%2Band%2BRegulations%2Bin%2Bthe%2BNetherlands.pdf).

People have varied height, clothing, skin tones, walking speeds, and animated arms/legs. They stroll along the adjacent sidewalks, approach the curb, wait, cross, and stroll on the opposite side. Small offsets spread people along the crossing. Building footprints now leave a half-unit perimeter strip so these sidewalk routes do not pass through walls. Crosswalk stripe spacing was corrected to fit the road width.

Routes are currently local sidewalk excursions attached to a crossing. Citywide building-to-building pathfinding, pedestrian crowd collision avoidance, bicycles, tram/bus priority, bus stops, emergency preemption, and separate turn lanes are not implemented. People can overlap other people; vehicle–crossing occupancy is enforced. Vehicle dimensions and timings are scaled for this stylized city, not calibrated to real-world road geometry.

The flashing-green display and pedestrian clearance concept are informed by [CROW: pedestrian green and flashing-green times](https://kennisbank.crow.nl/public/gastgebruiker/VMGT/Handboek_verkeerslichtenregelingen_2022/Minimale_groentijd_en_groenknippertijd_voor_voetgangers/114372) and [CROW: traffic-light regulation appendix](https://kennisbank.crow.nl/public/gastgebruiker/VMGT/Handboek_verkeerslichtenregelingen_2022/Bijlage_I_%C2%AD_Regeling_verkeerslichten/114590).

## Performance and code layout

- `src/trafficSimulation.ts`: seeded road connections, vehicles, people, controller, and conflict rules. No DOM or Three.js dependency.
- `src/trafficView.ts`: five instanced meshes for vehicles, vehicle lights, people, signal furniture, and signal lenses, plus native HTML controls. No individual mesh or real spotlight per car/person/signal.
- `src/main.ts`: initializes traffic after static building batching and updates it before rendering.
- `traffic.test.mjs`: executable behavior checks against the actual simulation.

Simulation advances at 30 fixed steps per simulated second. Rendering interpolates positions and headings. At most 0.2 seconds of catch-up is accepted per rendered frame, preventing a long inactive-tab pause from causing a large teleport or unbounded catch-up loop. At very low frame rates, simulation time can run slower than wall time.

Lane grouping is rebuilt once per tick. Receiving-lane reservations currently scan the capped population (maximum 300 cars); introduce a maintained lane index only if this becomes measurable. Signal furniture and lens transforms are static; lens colors update only when their state changes. Dynamic car/person parts share geometry and materials. The performance preset uses 8 nearby real street spotlights (all 1,800 lamp models remain visible) and caps pixel ratio at 1. Buildings, platforms, tree trunks/crowns, roads, parks, and ground are batched by primitive shape and spatial chunk. The live browser HUD measured 60 FPS in overview and crossing views with 90 cars and 160 people; overview draw calls fell from 2,071 to 296. These are observed samples, not a guarantee for every device or camera position.

## Checks

Requires Node 22.18+ for native TypeScript stripping in the direct simulation tests.

```sh
npm test
npm run build
```

The tests exercise minimum green, detector gap termination, wait-green, amber, occupancy-extended clearance, request fairness, exclusive pedestrian phases, blocked receiving lanes, reproducible seeds, lane separation, red stopping, latched amber decisions, zebra yielding, input validation, and five minutes of traffic progress. Existing streetlight-selection and building-batching checks also run.

For a visual check, use **Visit a crossing**, watch cars stop and turn, wait for people to reach the curb, then observe walk/flashing-green and all-red clearance. Pause/resume and change both population sliders. Compare FPS at the same camera position if evaluating performance.

## Camera

Drag to pan the city, scroll to zoom toward the cursor, and right-drag to rotate. On touch screens, use one finger to pan and two fingers to zoom/rotate. Overview resets the view; destinations and Visit a crossing frame the simulation from above.

Pedestrian POV follows the nearest simulated person to the map focus at their eye height. Drag to look around, use Next person to switch, and press Escape or City view to restore the previous map view. Pause traffic also pauses the followed pedestrian. If no people exist, increase the People slider first.
