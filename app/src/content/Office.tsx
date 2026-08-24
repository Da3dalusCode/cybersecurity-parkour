import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import {
  AdditiveBlending,
  GridHelper,
  InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  type Group,
  type Mesh,
  type PointLight,
} from 'three';
import {
  BOOST_PADS,
  CHECKPOINTS,
  DATA_SHARDS,
  type BoostPadDefinition,
  type CheckpointDefinition,
  type DataShardDefinition,
  type Vec3,
} from '../game/course';
import { useGameStore } from '../game/useGameStore';

const CYAN = '#22d3ee';
const BLUE = '#2563eb';
const MAGENTA = '#f43f9a';
const AMBER = '#fbbf24';
const LIME = '#4ade80';
const VOID = '#030712';
const FLOOR = '#07111f';
const STEEL = '#111c2e';
const PANEL = '#17243a';

type Rotation = readonly [number, number, number];

type CourseBlockDefinition = {
  id: string;
  position: Vec3;
  size: Vec3;
  rotation?: Rotation;
  accent?: string;
};

// The route climbs from the cubicle breach into the uplink deck, cuts across a
// floating firewall gauntlet, then drops back to the exfil floor.
const COURSE_BLOCKS: readonly CourseBlockDefinition[] = [
  { id: 'vault-left', position: [-2.6, 0.42, 14], size: [2.3, 0.84, 1.45], accent: CYAN },
  { id: 'vault-right', position: [2.6, 0.58, 10.5], size: [2.4, 1.16, 1.45], accent: BLUE },
  { id: 'breach-wall', position: [0, 0.72, 6.8], size: [3.2, 1.44, 1.25], accent: MAGENTA },
  {
    id: 'uplink-ramp',
    position: [0, 0.92, -0.9],
    size: [3.8, 0.28, 5.5],
    rotation: [0.32, 0, 0],
    accent: CYAN,
  },
  { id: 'uplink-step-a', position: [2.35, 1.65, -4.35], size: [2.8, 0.55, 2.05], accent: CYAN },
  { id: 'uplink-step-b', position: [4.55, 2.15, -5.8], size: [2.8, 0.55, 2.05], accent: BLUE },
  { id: 'uplink-step-c', position: [6.65, 2.72, -7.2], size: [2.8, 0.56, 2.05], accent: MAGENTA },
  { id: 'uplink-deck', position: [8, 2.8, -10.2], size: [5.5, 0.8, 6], accent: CYAN },
  { id: 'gauntlet-a', position: [3.7, 3.43, -15.3], size: [4.2, 0.54, 3.2], accent: BLUE },
  { id: 'gauntlet-b', position: [-0.4, 3.76, -18.5], size: [4.1, 0.54, 3.15], accent: MAGENTA },
  { id: 'firewall-deck', position: [-4.6, 3.75, -22.4], size: [5.8, 0.7, 6.6], accent: AMBER },
  { id: 'descent-a', position: [-3.6, 3.35, -28], size: [3.4, 0.5, 3], accent: MAGENTA },
  { id: 'descent-b', position: [-1.8, 2.15, -30.5], size: [3.2, 0.5, 2.8], accent: BLUE },
  { id: 'descent-c', position: [1.7, 1.55, -33.2], size: [3.3, 0.45, 2.7], accent: CYAN },
  { id: 'exfil-plinth', position: [0, 0.34, -36.2], size: [5.4, 0.68, 4], accent: LIME },
] as const;

const SERVER_POSITIONS: readonly Vec3[] = Array.from({ length: 26 }, (_, index) => {
  const side = index % 2 === 0 ? -1 : 1;
  const row = Math.floor(index / 2);
  return [side * 11.3, 1.85, 22 - row * 5] as const;
});

const CUBICLE_POSITIONS: readonly Vec3[] = [
  [-7, 0.58, 17],
  [7, 0.58, 17],
  [-7, 0.58, 12.5],
  [7, 0.58, 12.5],
  [-7, 0.58, 8],
  [7, 0.58, 8],
  [-7, 0.58, 3.5],
  [7, 0.58, 3.5],
] as const;

const CIRCUIT_TRACES: readonly {
  position: Vec3;
  length: number;
  rotation: number;
  color: 'cyan' | 'magenta';
}[] = Array.from({ length: 42 }, (_, index) => {
  const row = Math.floor(index / 2);
  const side = index % 2 === 0 ? -1 : 1;
  return {
    position: [side * (5.3 + (row % 4) * 1.35), 0.018, 24 - row * 3.2],
    length: 1.5 + (row % 5) * 0.48,
    rotation: row % 3 === 0 ? 0 : Math.PI / 2,
    color: row % 4 === 0 ? 'magenta' : 'cyan',
  } as const;
});

const INSTANCE_DUMMY = new Object3D();

const mutableVec3 = (value: Vec3): [number, number, number] => [value[0], value[1], value[2]];
const mutableRotation = (value: Rotation): [number, number, number] => [value[0], value[1], value[2]];

function distanceSquared(a: Vec3, b: Vec3) {
  const x = a[0] - b[0];
  const y = a[1] - b[1];
  const z = a[2] - b[2];
  return x * x + y * y + z * z;
}

function RouteBlock({ position, size, rotation = [0, 0, 0], accent = CYAN }: CourseBlockDefinition) {
  return (
    <RigidBody type="fixed" colliders={false} position={mutableVec3(position)} rotation={mutableRotation(rotation)}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={mutableVec3(size)} />
        <meshStandardMaterial color={STEEL} metalness={0.72} roughness={0.34} />
      </mesh>
      <mesh position={[0, size[1] / 2 + 0.012, 0]} receiveShadow>
        <boxGeometry args={[size[0] * 0.91, 0.024, size[2] * 0.86]} />
        <meshStandardMaterial
          color={PANEL}
          emissive={accent}
          emissiveIntensity={0.36}
          metalness={0.65}
          roughness={0.28}
        />
      </mesh>
      <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} />
    </RigidBody>
  );
}

function CircuitFloor() {
  const grid = useRef<GridHelper>(null);
  const cyanTraces = useRef<InstancedMesh>(null);
  const magentaTraces = useRef<InstancedMesh>(null);
  const cyanCount = CIRCUIT_TRACES.filter((trace) => trace.color === 'cyan').length;
  const magentaCount = CIRCUIT_TRACES.length - cyanCount;

  useLayoutEffect(() => {
    if (grid.current) {
      const material = Array.isArray(grid.current.material)
        ? grid.current.material[0]
        : grid.current.material;
      material.transparent = true;
      material.opacity = 0.24;
      material.depthWrite = false;
    }

    let cyanIndex = 0;
    let magentaIndex = 0;
    for (const trace of CIRCUIT_TRACES) {
      const target = trace.color === 'cyan' ? cyanTraces.current : magentaTraces.current;
      if (!target) continue;
      const targetIndex = trace.color === 'cyan' ? cyanIndex++ : magentaIndex++;
      INSTANCE_DUMMY.position.set(...trace.position);
      INSTANCE_DUMMY.rotation.set(0, trace.rotation, 0);
      INSTANCE_DUMMY.scale.set(trace.length, 1, 1);
      INSTANCE_DUMMY.updateMatrix();
      target.setMatrixAt(targetIndex, INSTANCE_DUMMY.matrix);
    }

    if (cyanTraces.current) cyanTraces.current.instanceMatrix.needsUpdate = true;
    if (magentaTraces.current) magentaTraces.current.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <group>
      <RigidBody type="fixed" colliders={false} position={[0, -0.15, -8]}>
        <mesh receiveShadow>
          <boxGeometry args={[34, 0.3, 72]} />
          <meshStandardMaterial color={FLOOR} metalness={0.56} roughness={0.43} />
        </mesh>
        <CuboidCollider args={[17, 0.15, 36]} />
      </RigidBody>
      <gridHelper ref={grid} args={[72, 72, '#0e7490', '#10243a']} position={[0, 0.012, -8]} />
      <instancedMesh ref={cyanTraces} args={[undefined, undefined, cyanCount]}>
        <boxGeometry args={[1, 0.018, 0.055]} />
        <meshBasicMaterial color={CYAN} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={magentaTraces} args={[undefined, undefined, magentaCount]}>
        <boxGeometry args={[1, 0.018, 0.055]} />
        <meshBasicMaterial color={MAGENTA} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

function ServerBanks() {
  const cabinets = useRef<InstancedMesh>(null);
  const screens = useRef<InstancedMesh>(null);
  const vents = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    if (!cabinets.current || !screens.current || !vents.current) return;

    SERVER_POSITIONS.forEach(([x, y, z], index) => {
      INSTANCE_DUMMY.position.set(x, y, z);
      INSTANCE_DUMMY.rotation.set(0, 0, 0);
      INSTANCE_DUMMY.scale.set(1, 1, 1);
      INSTANCE_DUMMY.updateMatrix();
      cabinets.current?.setMatrixAt(index, INSTANCE_DUMMY.matrix);

      INSTANCE_DUMMY.position.set(x - Math.sign(x) * 1.11, y + 0.35, z);
      INSTANCE_DUMMY.rotation.set(0, Math.sign(x) * Math.PI / 2, 0);
      INSTANCE_DUMMY.updateMatrix();
      screens.current?.setMatrixAt(index, INSTANCE_DUMMY.matrix);

      INSTANCE_DUMMY.position.set(x - Math.sign(x) * 1.115, y - 0.52, z);
      INSTANCE_DUMMY.updateMatrix();
      vents.current?.setMatrixAt(index, INSTANCE_DUMMY.matrix);
    });

    cabinets.current.instanceMatrix.needsUpdate = true;
    screens.current.instanceMatrix.needsUpdate = true;
    vents.current.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <RigidBody type="fixed" colliders={false}>
      <instancedMesh ref={cabinets} args={[undefined, undefined, SERVER_POSITIONS.length]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 3.7, 1.35]} />
        <meshStandardMaterial color="#0a1324" metalness={0.8} roughness={0.28} />
      </instancedMesh>
      <instancedMesh ref={screens} args={[undefined, undefined, SERVER_POSITIONS.length]}>
        <boxGeometry args={[0.82, 0.34, 0.035]} />
        <meshBasicMaterial color={CYAN} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={vents} args={[undefined, undefined, SERVER_POSITIONS.length]}>
        <boxGeometry args={[0.92, 0.48, 0.04]} />
        <meshStandardMaterial color="#26364d" metalness={0.9} roughness={0.18} />
      </instancedMesh>
      {SERVER_POSITIONS.map((position, index) => (
        <CuboidCollider key={index} position={mutableVec3(position)} args={[1.1, 1.85, 0.675]} />
      ))}
    </RigidBody>
  );
}

function CubicleBanks() {
  const desks = useRef<InstancedMesh>(null);
  const partitions = useRef<InstancedMesh>(null);
  const screens = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    if (!desks.current || !partitions.current || !screens.current) return;

    CUBICLE_POSITIONS.forEach(([x, y, z], index) => {
      INSTANCE_DUMMY.position.set(x, y, z);
      INSTANCE_DUMMY.rotation.set(0, 0, 0);
      INSTANCE_DUMMY.scale.set(1, 1, 1);
      INSTANCE_DUMMY.updateMatrix();
      desks.current?.setMatrixAt(index, INSTANCE_DUMMY.matrix);

      INSTANCE_DUMMY.position.set(x + Math.sign(x) * 1.42, y + 0.48, z);
      INSTANCE_DUMMY.updateMatrix();
      partitions.current?.setMatrixAt(index, INSTANCE_DUMMY.matrix);

      INSTANCE_DUMMY.position.set(x - Math.sign(x) * 0.25, y + 0.68, z);
      INSTANCE_DUMMY.rotation.set(0, Math.sign(x) * 0.13, 0);
      INSTANCE_DUMMY.updateMatrix();
      screens.current?.setMatrixAt(index, INSTANCE_DUMMY.matrix);
    });

    desks.current.instanceMatrix.needsUpdate = true;
    partitions.current.instanceMatrix.needsUpdate = true;
    screens.current.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <RigidBody type="fixed" colliders={false}>
      <instancedMesh ref={desks} args={[undefined, undefined, CUBICLE_POSITIONS.length]} castShadow receiveShadow>
        <boxGeometry args={[2.8, 1.16, 2.25]} />
        <meshStandardMaterial color="#162338" metalness={0.48} roughness={0.48} />
      </instancedMesh>
      <instancedMesh ref={partitions} args={[undefined, undefined, CUBICLE_POSITIONS.length]} castShadow>
        <boxGeometry args={[0.09, 2.05, 2.8]} />
        <meshStandardMaterial color="#22314a" metalness={0.44} roughness={0.52} />
      </instancedMesh>
      <instancedMesh ref={screens} args={[undefined, undefined, CUBICLE_POSITIONS.length]}>
        <boxGeometry args={[1.05, 0.62, 0.08]} />
        <meshStandardMaterial color="#07101d" emissive={MAGENTA} emissiveIntensity={1.6} toneMapped={false} />
      </instancedMesh>
      {CUBICLE_POSITIONS.map((position, index) => (
        <CuboidCollider key={index} position={mutableVec3(position)} args={[1.4, 0.58, 1.125]} />
      ))}
    </RigidBody>
  );
}

function BoundaryShell() {
  const beamPositions = useMemo(
    () => Array.from({ length: 10 }, (_, index) => [0, 7.6, 24 - index * 7.2] as const),
    [],
  );

  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        {[-16, 16].map((x) => (
          <group key={x}>
            <mesh position={[x, 3, -8]} receiveShadow>
              <boxGeometry args={[0.45, 6, 72]} />
              <meshStandardMaterial color="#07101d" metalness={0.72} roughness={0.3} />
            </mesh>
            <mesh position={[x - Math.sign(x) * 0.24, 1.2, -8]}>
              <boxGeometry args={[0.05, 0.08, 70]} />
              <meshBasicMaterial color={x < 0 ? MAGENTA : CYAN} toneMapped={false} />
            </mesh>
            <mesh position={[x - Math.sign(x) * 0.24, 4.7, -8]}>
              <boxGeometry args={[0.05, 0.08, 70]} />
              <meshBasicMaterial color={x < 0 ? MAGENTA : CYAN} toneMapped={false} />
            </mesh>
            <CuboidCollider position={[x, 3, -8]} args={[0.225, 3, 36]} />
          </group>
        ))}
        <mesh position={[0, 3, -44]} receiveShadow>
          <boxGeometry args={[32.5, 6, 0.5]} />
          <meshStandardMaterial color="#07101d" metalness={0.72} roughness={0.3} />
        </mesh>
        <mesh position={[0, 3, 28]} receiveShadow>
          <boxGeometry args={[32.5, 6, 0.5]} />
          <meshStandardMaterial color="#07101d" metalness={0.72} roughness={0.3} />
        </mesh>
        <CuboidCollider position={[0, 3, -44]} args={[16.25, 3, 0.25]} />
        <CuboidCollider position={[0, 3, 28]} args={[16.25, 3, 0.25]} />
      </RigidBody>
      {beamPositions.map((position, index) => (
        <group key={index} position={position}>
          <mesh castShadow>
            <boxGeometry args={[32, 0.22, 0.28]} />
            <meshStandardMaterial color="#0d1b2f" metalness={0.8} roughness={0.25} />
          </mesh>
          <mesh position={[0, -0.14, 0]}>
            <boxGeometry args={[19, 0.025, 0.08]} />
            <meshBasicMaterial color={index % 2 === 0 ? CYAN : MAGENTA} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function CheckpointGate({ checkpoint, index, reduceMotion }: {
  checkpoint: CheckpointDefinition;
  index: number;
  reduceMotion: boolean;
}) {
  const frame = useRef<Group>(null);
  const rotor = useRef<Group>(null);
  const material = useRef<MeshStandardMaterial>(null);
  const checkpointIndex = useGameStore((state) => state.checkpointIndex);
  const phase = useGameStore((state) => state.phase);
  const passed = index <= checkpointIndex;
  const active = phase === 'running' && index === checkpointIndex + 1;
  const color = passed ? LIME : active ? CYAN : '#6d28d9';

  useFrame(({ clock }, delta) => {
    const elapsed = clock.getElapsedTime();
    if (frame.current) {
      frame.current.rotation.z = reduceMotion ? 0 : Math.sin(elapsed * 0.75 + index) * 0.025;
    }
    if (rotor.current && !reduceMotion) rotor.current.rotation.z += delta * (active ? 1.25 : 0.28);
    if (material.current) {
      material.current.emissiveIntensity = active
        ? 1.8 + (reduceMotion ? 0 : Math.sin(elapsed * 4 + index) * 0.65)
        : passed
          ? 0.72
          : 0.32;
    }

    if (!active) return;
    const playerPosition = useGameStore.getState().position;
    if (distanceSquared(playerPosition, checkpoint.position) <= checkpoint.radius ** 2) {
      useGameStore.getState().reachCheckpoint(index);
    }
  });

  return (
    <group ref={frame} position={[checkpoint.position[0], checkpoint.position[1] + 0.82, checkpoint.position[2]]}>
      <mesh castShadow scale={[1, 0.78, 1]}>
        <torusGeometry args={[2.05, 0.105, 10, 64]} />
        <meshStandardMaterial
          ref={material}
          color="#091426"
          emissive={color}
          emissiveIntensity={active ? 2 : 0.5}
          metalness={0.82}
          roughness={0.2}
          toneMapped={false}
        />
      </mesh>
      <group ref={rotor} scale={[1, 0.78, 1]}>
        <mesh rotation-z={0.2}>
          <torusGeometry args={[1.77, 0.025, 5, 28, Math.PI * 0.52]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
        <mesh rotation-z={Math.PI + 0.2}>
          <torusGeometry args={[1.77, 0.025, 5, 28, Math.PI * 0.52]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function DataShard({ shard, index, reduceMotion }: {
  shard: DataShardDefinition;
  index: number;
  reduceMotion: boolean;
}) {
  const group = useRef<Group>(null);
  const core = useRef<MeshStandardMaterial>(null);
  const collected = useGameStore((state) => Boolean(state.collectedShards[shard.id]));

  useFrame(({ clock }, delta) => {
    if (!group.current || collected) return;
    const elapsed = clock.getElapsedTime();
    if (!reduceMotion) {
      group.current.rotation.y += delta * 1.7;
      group.current.rotation.z = Math.sin(elapsed * 1.3 + index) * 0.25;
      group.current.position.y = shard.position[1] + Math.sin(elapsed * 2.5 + index * 0.7) * 0.18;
      if (core.current) core.current.emissiveIntensity = 2.1 + Math.sin(elapsed * 5 + index) * 0.65;
    }

    const state = useGameStore.getState();
    if (state.phase === 'running' && distanceSquared(state.position, shard.position) < 1.45 ** 2) {
      state.collectShard(shard.id);
    }
  });

  if (collected) return null;

  return (
    <group ref={group} position={mutableVec3(shard.position)}>
      <mesh castShadow>
        <octahedronGeometry args={[0.42, 0]} />
        <meshStandardMaterial
          ref={core}
          color="#dffbff"
          emissive={CYAN}
          emissiveIntensity={2.2}
          metalness={0.45}
          roughness={0.12}
          toneMapped={false}
        />
      </mesh>
      <mesh scale={1.48} rotation={[0.2, 0.35, 0.1]}>
        <octahedronGeometry args={[0.42, 0]} />
        <meshBasicMaterial color={index % 3 === 0 ? MAGENTA : CYAN} wireframe transparent opacity={0.72} toneMapped={false} />
      </mesh>
      <mesh rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.66, 0.018, 4, 32]} />
        <meshBasicMaterial color={CYAN} transparent opacity={0.8} toneMapped={false} />
      </mesh>
    </group>
  );
}

function BoostPad({ pad, index, reduceMotion }: {
  pad: BoostPadDefinition;
  index: number;
  reduceMotion: boolean;
}) {
  const arrows = useRef<Group>(null);
  const plate = useRef<MeshStandardMaterial>(null);
  const yaw = Math.atan2(pad.direction[0], -pad.direction[2]);

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    if (arrows.current) {
      arrows.current.position.z = reduceMotion ? 0 : ((elapsed * 1.8 + index * 0.31) % 0.5) - 0.25;
    }
    if (plate.current) {
      plate.current.emissiveIntensity = 1.45 + (reduceMotion ? 0 : Math.sin(elapsed * 5 + index) * 0.45);
    }
  });

  return (
    <group position={mutableVec3(pad.position)} rotation-y={yaw}>
      <mesh receiveShadow>
        <boxGeometry args={[2.75, 0.11, 2.15]} />
        <meshStandardMaterial
          ref={plate}
          color="#071827"
          emissive={index % 2 === 0 ? CYAN : MAGENTA}
          emissiveIntensity={1.5}
          metalness={0.76}
          roughness={0.22}
          toneMapped={false}
        />
      </mesh>
      <group ref={arrows} position={[0, 0.085, 0]}>
        {[-0.58, 0, 0.58].map((z) => (
          <group key={z} position={[0, 0, z]}>
            <mesh position={[-0.2, 0, 0]} rotation-y={-0.62}>
              <boxGeometry args={[0.11, 0.035, 0.64]} />
              <meshBasicMaterial color="#d9fcff" toneMapped={false} />
            </mesh>
            <mesh position={[0.2, 0, 0]} rotation-y={0.62}>
              <boxGeometry args={[0.11, 0.035, 0.64]} />
              <meshBasicMaterial color="#d9fcff" toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

function SecuritySweep({ reduceMotion }: { reduceMotion: boolean }) {
  const sweep = useRef<Mesh>(null);
  const material = useRef<MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    if (!sweep.current || reduceMotion) return;
    const elapsed = clock.getElapsedTime();
    sweep.current.position.z = 25 - (elapsed * 4.2) % 68;
    if (material.current) material.current.opacity = 0.055 + Math.sin(elapsed * 2.4) * 0.018;
  });

  return (
    <mesh ref={sweep} position={[0, 0.027, 25]} rotation-x={-Math.PI / 2} visible={!reduceMotion}>
      <planeGeometry args={[28, 2.4]} />
      <meshBasicMaterial
        ref={material}
        color={CYAN}
        transparent
        opacity={0.065}
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

function LightingRig({ reduceMotion }: { reduceMotion: boolean }) {
  const pulseA = useRef<PointLight>(null);
  const pulseB = useRef<PointLight>(null);

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    if (pulseA.current) pulseA.current.intensity = 16 + (reduceMotion ? 0 : Math.sin(elapsed * 1.8) * 4);
    if (pulseB.current) pulseB.current.intensity = 14 + (reduceMotion ? 0 : Math.sin(elapsed * 1.45 + 1.5) * 4);
  });

  return (
    <group>
      <hemisphereLight color="#a5f3fc" groundColor={VOID} intensity={0.42} />
      <ambientLight color="#bfdbfe" intensity={0.16} />
      <directionalLight
        position={[14, 24, 18]}
        color="#dbeafe"
        intensity={1.65}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={30}
        shadow-camera-bottom={-38}
        shadow-camera-near={1}
        shadow-camera-far={78}
        shadow-bias={-0.00035}
      />
      <pointLight ref={pulseA} position={[0, 5.5, 8]} color={CYAN} intensity={16} distance={20} decay={2} />
      <pointLight ref={pulseB} position={[6, 7, -12]} color={MAGENTA} intensity={14} distance={19} decay={2} />
      <pointLight position={[-5, 7, -24]} color={AMBER} intensity={15} distance={18} decay={2} />
      <pointLight position={[0, 5, -37]} color={LIME} intensity={12} distance={13} decay={2} />
    </group>
  );
}

function OfficeScene() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => setReduceMotion(preference.matches);
    syncPreference();
    preference.addEventListener('change', syncPreference);
    return () => preference.removeEventListener('change', syncPreference);
  }, []);

  return (
    <>
      <color attach="background" args={[VOID]} />
      <fog attach="fog" args={[VOID, 24, 70]} />
      <LightingRig reduceMotion={reduceMotion} />
      <CircuitFloor />
      <BoundaryShell />
      <ServerBanks />
      <CubicleBanks />
      <group>
        {COURSE_BLOCKS.map((block) => (
          <RouteBlock key={block.id} {...block} />
        ))}
      </group>
      {CHECKPOINTS.map((checkpoint, index) => (
        <CheckpointGate key={checkpoint.id} checkpoint={checkpoint} index={index} reduceMotion={reduceMotion} />
      ))}
      {DATA_SHARDS.map((shard, index) => (
        <DataShard key={shard.id} shard={shard} index={index} reduceMotion={reduceMotion} />
      ))}
      {BOOST_PADS.map((pad, index) => (
        <BoostPad key={pad.id} pad={pad} index={index} reduceMotion={reduceMotion} />
      ))}
      <SecuritySweep reduceMotion={reduceMotion} />
    </>
  );
}

export default memo(OfficeScene);
