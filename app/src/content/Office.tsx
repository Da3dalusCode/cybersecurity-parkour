import { memo, useLayoutEffect, useRef } from 'react';
import { Object3D, InstancedMesh } from 'three';
import { RigidBody, CuboidCollider } from '@react-three/rapier';

// Tweaking the counts and spacing is centralized here so scene scale changes stay predictable.
const DESK_COLUMNS = 20; // Increase/decrease for more desks across the X axis.
const DESK_ROWS = 12; // Increase/decrease for more desks across the Z axis.
const DESK_COUNT = DESK_COLUMNS * DESK_ROWS; // 240 desks total (between 200 and 300).

const DESK_SIZE: [number, number, number] = [1.4, 0.75, 0.8];
const MONITOR_SIZE: [number, number, number] = [0.9, 0.5, 0.1];

// Base spacing between desks plus optional wider aisles after every N desks.
const BASE_SPACING_X = 1.2;
const BASE_SPACING_Z = 1.4;
const AISLE_EVERY_COLS = 5;
const AISLE_EVERY_ROWS = 4;
const AISLE_WIDTH_X = 2.2;
const AISLE_WIDTH_Z = 2;

const createAxisPositions = (
  count: number,
  baseSpacing: number,
  aisleEvery: number,
  aisleWidth: number,
) => {
  const values: number[] = new Array(count);
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    if (index === 0) {
      values[index] = 0;
      continue;
    }

    cursor += baseSpacing;
    if (aisleEvery > 0 && index % aisleEvery === 0) {
      cursor += aisleWidth;
    }
    values[index] = cursor;
  }

  const midpoint = (values[0] + values[count - 1]) / 2;
  return values.map((value) => value - midpoint);
};

const deskXPositions = createAxisPositions(DESK_COLUMNS, BASE_SPACING_X, AISLE_EVERY_COLS, AISLE_WIDTH_X);
const deskZPositions = createAxisPositions(DESK_ROWS, BASE_SPACING_Z, AISLE_EVERY_ROWS, AISLE_WIDTH_Z);

const tempDesk = new Object3D();
const tempMonitor = new Object3D();

function Desks() {
  const desksRef = useRef<InstancedMesh | null>(null);
  const monitorsRef = useRef<InstancedMesh | null>(null);

  useLayoutEffect(() => {
    if (!desksRef.current || !monitorsRef.current) {
      return;
    }

    let instanceIndex = 0;
    for (let row = 0; row < DESK_ROWS; row += 1) {
      for (let col = 0; col < DESK_COLUMNS; col += 1) {
        const x = deskXPositions[col];
        const z = deskZPositions[row];

        tempDesk.position.set(x, DESK_SIZE[1] / 2, z);
        tempDesk.rotation.set(0, 0, 0);
        tempDesk.updateMatrix();
        desksRef.current.setMatrixAt(instanceIndex, tempDesk.matrix);

        tempMonitor.position.set(x, DESK_SIZE[1] + MONITOR_SIZE[1] / 2, z - DESK_SIZE[2] * 0.25);
        tempMonitor.rotation.set(0, 0, 0);
        tempMonitor.updateMatrix();
        monitorsRef.current.setMatrixAt(instanceIndex, tempMonitor.matrix);

        instanceIndex += 1;
      }
    }

    desksRef.current.instanceMatrix.needsUpdate = true;
    monitorsRef.current.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <group>
      <instancedMesh ref={desksRef} args={[undefined, undefined, DESK_COUNT]} castShadow receiveShadow>
        <boxGeometry args={DESK_SIZE} />
        <meshStandardMaterial color="#9ca3af" />
      </instancedMesh>
      <instancedMesh ref={monitorsRef} args={[undefined, undefined, DESK_COUNT]} castShadow>
        <boxGeometry args={MONITOR_SIZE} />
        <meshStandardMaterial color="#111827" />
      </instancedMesh>
    </group>
  );
}

const obstacles: ReadonlyArray<{
  position: [number, number, number];
  size: [number, number, number];
}> = [
  { position: [-6, 0.6, 5], size: [2, 1.2, 1.5] },
  { position: [4, 0.6, -4], size: [1.5, 1.2, 2] },
  { position: [0, 0.6, 8], size: [3, 1.2, 1] },
];

function Obstacles() {
  return (
    <>
      {obstacles.map(({ position, size }, index) => (
        <RigidBody key={index} type="fixed" position={position} colliders={false}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={size} />
            <meshStandardMaterial color="#4b5563" />
          </mesh>
          <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} />
        </RigidBody>
      ))}
    </>
  );
}

function Ground() {
  return (
    <RigidBody type="fixed" colliders={false}>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <CuboidCollider args={[60, 0.1, 60]} position={[0, -0.05, 0]} />
    </RigidBody>
  );
}

function Lighting() {
  return (
    <group>
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[25, 35, 10]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
    </group>
  );
}

function OfficeScene() {
  return (
    <>
      <Lighting />
      <Ground />
      <Obstacles />
      <Desks />
    </>
  );
}

export default memo(OfficeScene);
