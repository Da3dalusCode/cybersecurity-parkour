import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from 'react';
import { KeyboardControls, useKeyboardControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import {
  CapsuleCollider,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierCollider,
  type RapierRigidBody,
} from '@react-three/rapier';
import { Group, MathUtils, Mesh, PerspectiveCamera, Vector3 } from 'three';
import { BOOST_PADS, CHECKPOINTS, DATA_SHARDS, START_POSITION } from './course';
import { useGameStore, type ParkourAction } from './useGameStore';

type ControlName =
  | 'forward'
  | 'backward'
  | 'left'
  | 'right'
  | 'run'
  | 'jump'
  | 'slide'
  | 'dash';

type AvatarAction = 'idle' | 'move' | 'air' | 'slide' | 'vault' | 'dash';

type AvatarMotion = {
  action: AvatarAction;
  speed: number;
  grounded: boolean;
  targetYaw: number;
  verticalVelocity: number;
  storeAction: ParkourAction;
};

const CAPSULE_HALF_HEIGHT = 0.62;
const CAPSULE_RADIUS = 0.32;
const BODY_HALF_EXTENT = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS;
const SLIDE_HALF_HEIGHT = 0.24;
const SLIDE_HALF_EXTENT = SLIDE_HALF_HEIGHT + CAPSULE_RADIUS;
const SLIDE_COLLIDER_OFFSET = -(BODY_HALF_EXTENT - SLIDE_HALF_EXTENT);

const WALK_SPEED = 5.1;
const RUN_SPEED = 8.4;
const GROUND_ACCELERATION = 36;
const GROUND_DECELERATION = 44;
const AIR_ACCELERATION = 12;
const AIR_DECELERATION = 4;
const JUMP_SPEED = 7.25;
const JUMP_CUT_GRAVITY = 28;
const EXTRA_FALL_GRAVITY = 9;
const MAX_FALL_SPEED = 25;
const COYOTE_TIME = 0.12;
const JUMP_BUFFER_TIME = 0.15;
const JUMP_GROUND_LOCK = 0.11;

const SLIDE_DURATION = 0.62;
const SLIDE_ENTRY_SPEED = 9.6;
const SLIDE_MIN_SPEED = 3.1;
const SLIDE_DECELERATION = 7.5;
const DASH_SPEED = 14.5;
const DASH_DURATION = 0.16;
const DASH_COOLDOWN = 1.45;
const VAULT_SPEED = 8.2;
const VAULT_UP_SPEED = 6.2;
const VAULT_DURATION = 0.34;
const VAULT_COOLDOWN = 0.72;
const BOOST_IMPULSE = 7.6;

const GROUND_PROBE_START = 0.16;
const GROUND_PROBE_DISTANCE = 0.3;
const MIN_GROUND_NORMAL = 0.56;
const GROUND_PROBE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.18, 0],
  [-0.18, 0],
  [0, 0.18],
  [0, -0.18],
];

const BASE_CAMERA_FOV = 58;
const CAMERA_DISTANCE = 4.65;
const CAMERA_MIN_DISTANCE = 0.52;
const CAMERA_PIVOT_HEIGHT = 0.52;
const CAMERA_COLLISION_PADDING = 0.18;
const MOUSE_SENSITIVITY = 0.00225;
const MIN_CAMERA_PITCH = -0.68;
const MAX_CAMERA_PITCH = 0.48;

const INITIAL_POSITION: [number, number, number] = [...START_POSITION];

const dampAngle = (current: number, target: number, smoothing: number, delta: number) => {
  const angleDelta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + angleDelta * (1 - Math.exp(-smoothing * delta));
};

function CyberRunner({ motionRef }: { motionRef: MutableRefObject<AvatarMotion> }) {
  const rootRef = useRef<Group>(null);
  const modelRef = useRef<Group>(null);
  const torsoRef = useRef<Group>(null);
  const leftLegRef = useRef<Group>(null);
  const rightLegRef = useRef<Group>(null);
  const leftArmRef = useRef<Group>(null);
  const rightArmRef = useRef<Group>(null);
  const dashTrailRef = useRef<Mesh>(null);
  const animationTime = useRef(0);

  useFrame((_, delta) => {
    const root = rootRef.current;
    const model = modelRef.current;
    const torso = torsoRef.current;
    const leftLeg = leftLegRef.current;
    const rightLeg = rightLegRef.current;
    const leftArm = leftArmRef.current;
    const rightArm = rightArmRef.current;
    const dashTrail = dashTrailRef.current;
    if (!root || !model || !torso || !leftLeg || !rightLeg || !leftArm || !rightArm || !dashTrail) return;

    const motion = motionRef.current;
    const speedRatio = MathUtils.clamp(motion.speed / RUN_SPEED, 0, 1.25);
    animationTime.current += delta * (4.5 + motion.speed * 1.25);
    const stride = Math.sin(animationTime.current) * 0.78 * Math.min(1, speedRatio);
    const moving = motion.action === 'move';
    const airborne = motion.action === 'air';
    const sliding = motion.action === 'slide';
    const vaulting = motion.action === 'vault';
    const dashing = motion.action === 'dash';

    root.rotation.y = dampAngle(root.rotation.y, motion.targetYaw, 15, delta);
    model.scale.y = MathUtils.damp(model.scale.y, sliding ? 0.58 : dashing ? 0.86 : 1, 16, delta);
    model.scale.x = MathUtils.damp(model.scale.x, sliding ? 1.12 : 1, 16, delta);
    model.scale.z = MathUtils.damp(model.scale.z, dashing ? 1.08 : 1, 16, delta);
    model.position.y = MathUtils.damp(
      model.position.y,
      moving && motion.grounded ? Math.abs(Math.sin(animationTime.current * 2)) * 0.025 : 0,
      18,
      delta,
    );

    const torsoLean = sliding ? -0.52 : dashing ? -0.38 : vaulting ? -0.2 : moving ? -0.09 * speedRatio : 0;
    torso.rotation.x = MathUtils.damp(torso.rotation.x, torsoLean, 14, delta);
    torso.rotation.z = MathUtils.damp(
      torso.rotation.z,
      moving ? Math.sin(animationTime.current) * 0.035 * speedRatio : 0,
      10,
      delta,
    );

    let leftLegTarget = moving ? stride : 0;
    let rightLegTarget = moving ? -stride : 0;
    let leftArmTarget = moving ? -stride * 0.72 : 0;
    let rightArmTarget = moving ? stride * 0.72 : 0;
    if (airborne) {
      leftLegTarget = motion.verticalVelocity > 0 ? -0.38 : 0.28;
      rightLegTarget = motion.verticalVelocity > 0 ? 0.48 : -0.15;
      leftArmTarget = 0.72;
      rightArmTarget = 0.72;
    } else if (sliding) {
      leftLegTarget = -1.02;
      rightLegTarget = -0.68;
      leftArmTarget = 0.82;
      rightArmTarget = 0.62;
    } else if (vaulting) {
      leftLegTarget = -0.72;
      rightLegTarget = 0.9;
      leftArmTarget = 2.15;
      rightArmTarget = 2.15;
    } else if (dashing) {
      leftLegTarget = -0.32;
      rightLegTarget = 0.32;
      leftArmTarget = 0.68;
      rightArmTarget = 0.68;
    }

    leftLeg.rotation.x = MathUtils.damp(leftLeg.rotation.x, leftLegTarget, 18, delta);
    rightLeg.rotation.x = MathUtils.damp(rightLeg.rotation.x, rightLegTarget, 18, delta);
    leftArm.rotation.x = MathUtils.damp(leftArm.rotation.x, leftArmTarget, 18, delta);
    rightArm.rotation.x = MathUtils.damp(rightArm.rotation.x, rightArmTarget, 18, delta);
    dashTrail.visible = dashing;
    const trailScale = dashing ? 1 + Math.sin(animationTime.current * 3) * 0.15 : 0.01;
    dashTrail.scale.set(trailScale, trailScale, trailScale);
  });

  const armor = <meshStandardMaterial color="#1f2a3d" metalness={0.58} roughness={0.34} />;

  return (
    <group ref={rootRef} position={[0, -BODY_HALF_EXTENT, 0]}>
      <group ref={modelRef}>
        <group ref={torsoRef} position={[0, 1.18, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.52, 0.64, 0.34]} />
            <meshStandardMaterial color="#111827" metalness={0.7} roughness={0.28} />
          </mesh>
          <mesh castShadow position={[0, 0.03, -0.19]}>
            <boxGeometry args={[0.36, 0.27, 0.055]} />
            <meshStandardMaterial color="#0b1220" emissive="#06b6d4" emissiveIntensity={1.8} />
          </mesh>
          <mesh position={[0, 0.03, 0.2]} rotation={[0, 0, Math.PI / 4]}>
            <torusGeometry args={[0.2, 0.022, 8, 28]} />
            <meshStandardMaterial color="#22d3ee" emissive="#0891b2" emissiveIntensity={2.2} />
          </mesh>
        </group>
        <group position={[0, 1.66, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.4, 0.38, 0.38]} />
            <meshStandardMaterial color="#172033" metalness={0.78} roughness={0.22} />
          </mesh>
          <mesh position={[0, 0.035, -0.202]}>
            <boxGeometry args={[0.3, 0.105, 0.025]} />
            <meshStandardMaterial color="#67e8f9" emissive="#22d3ee" emissiveIntensity={3.2} />
          </mesh>
          <mesh position={[0.15, 0.25, 0]} rotation={[0, 0, -0.34]}>
            <boxGeometry args={[0.035, 0.22, 0.035]} />
            <meshStandardMaterial color="#f472b6" emissive="#db2777" emissiveIntensity={2.5} />
          </mesh>
        </group>
        <group ref={leftArmRef} position={[-0.36, 1.42, 0]}>
          <mesh castShadow position={[0, -0.25, 0]}><capsuleGeometry args={[0.09, 0.34, 6, 10]} />{armor}</mesh>
          <mesh castShadow position={[0, -0.49, -0.01]}><boxGeometry args={[0.15, 0.15, 0.18]} /><meshStandardMaterial color="#0e7490" emissive="#06b6d4" emissiveIntensity={0.7} /></mesh>
        </group>
        <group ref={rightArmRef} position={[0.36, 1.42, 0]}>
          <mesh castShadow position={[0, -0.25, 0]}><capsuleGeometry args={[0.09, 0.34, 6, 10]} />{armor}</mesh>
          <mesh castShadow position={[0, -0.49, -0.01]}><boxGeometry args={[0.15, 0.15, 0.18]} /><meshStandardMaterial color="#0e7490" emissive="#06b6d4" emissiveIntensity={0.7} /></mesh>
        </group>
        <group ref={leftLegRef} position={[-0.16, 0.86, 0]}>
          <mesh castShadow position={[0, -0.31, 0]}><capsuleGeometry args={[0.105, 0.43, 6, 10]} />{armor}</mesh>
          <mesh castShadow position={[0, -0.61, -0.055]}><boxGeometry args={[0.22, 0.16, 0.36]} /><meshStandardMaterial color="#090e18" metalness={0.72} roughness={0.28} /></mesh>
        </group>
        <group ref={rightLegRef} position={[0.16, 0.86, 0]}>
          <mesh castShadow position={[0, -0.31, 0]}><capsuleGeometry args={[0.105, 0.43, 6, 10]} />{armor}</mesh>
          <mesh castShadow position={[0, -0.61, -0.055]}><boxGeometry args={[0.22, 0.16, 0.36]} /><meshStandardMaterial color="#090e18" metalness={0.72} roughness={0.28} /></mesh>
        </group>
        <mesh ref={dashTrailRef} position={[0, 1.2, 0.92]} rotation={[Math.PI / 2, 0, 0]} visible={false}>
          <coneGeometry args={[0.4, 1.4, 12, 1, true]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.22} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

function PlayerController() {
  const bodyRef = useRef<RapierRigidBody>(null);
  const standingColliderRef = useRef<RapierCollider>(null);
  const slidingColliderRef = useRef<RapierCollider>(null);
  const { camera, gl } = useThree();
  const { rapier, world } = useRapier();
  const [subscribeKeys, getKeys] = useKeyboardControls<ControlName>();

  const jumpBuffer = useRef(0);
  const coyoteTimer = useRef(0);
  const groundLockTimer = useRef(0);
  const dashRequest = useRef(false);
  const dashTimer = useRef(0);
  const dashCooldown = useRef(0);
  const vaultTimer = useRef(0);
  const vaultCooldown = useRef(0);
  const slideTimer = useRef(0);
  const isSliding = useRef(false);
  const previousSlideInput = useRef(false);
  const wasGrounded = useRef(false);
  const lastVerticalVelocity = useRef(0);
  const respawnRequested = useRef(false);
  const physicsPaused = useRef(false);
  const pausedVelocity = useRef({ x: 0, y: 0, z: 0 });
  const activeBoostPads = useRef(new Set<string>());
  const telemetryTimer = useRef(0);
  const cameraYaw = useRef(0);
  const cameraPitch = useRef(-0.12);
  const smoothCameraYaw = useRef(0);
  const smoothCameraPitch = useRef(-0.12);
  const cameraDistance = useRef(CAMERA_DISTANCE);
  const snapCamera = useRef(true);
  const cameraClock = useRef(0);
  const bobClock = useRef(0);
  const landingKick = useRef(0);
  const landingShake = useRef(0);
  const reduceMotion = useRef(false);
  const motionRef = useRef<AvatarMotion>({ action: 'idle', speed: 0, grounded: false, targetYaw: 0, verticalVelocity: 0, storeAction: 'IDLE' });

  const forwardVector = useMemo(() => new Vector3(), []);
  const rightVector = useMemo(() => new Vector3(), []);
  const moveVector = useMemo(() => new Vector3(), []);
  const desiredHorizontal = useMemo(() => new Vector3(), []);
  const currentHorizontal = useMemo(() => new Vector3(), []);
  const velocityDelta = useMemo(() => new Vector3(), []);
  const groundNormal = useMemo(() => new Vector3(0, 1, 0), []);
  const slideDirection = useMemo(() => new Vector3(0, 0, -1), []);
  const dashDirection = useMemo(() => new Vector3(0, 0, -1), []);
  const vaultDirection = useMemo(() => new Vector3(0, 0, -1), []);
  const boostDirection = useMemo(() => new Vector3(), []);
  const cameraPivot = useMemo(() => new Vector3(), []);
  const cameraLookDirection = useMemo(() => new Vector3(), []);
  const cameraRayDirection = useMemo(() => new Vector3(), []);
  const desiredCameraPosition = useMemo(() => new Vector3(), []);

  const setSlideColliders = useCallback((sliding: boolean) => {
    standingColliderRef.current?.setEnabled(!sliding);
    slidingColliderRef.current?.setEnabled(sliding);
  }, []);

  useLayoutEffect(() => { slidingColliderRef.current?.setEnabled(false); }, []);

  useEffect(() => {
    const unsubscribeJump = subscribeKeys((state) => state.jump, (pressed) => {
      if (pressed) jumpBuffer.current = JUMP_BUFFER_TIME;
    });
    const unsubscribeDash = subscribeKeys((state) => state.dash, (pressed) => {
      if (pressed) dashRequest.current = true;
    });
    return () => { unsubscribeJump(); unsubscribeDash(); };
  }, [subscribeKeys]);

  useEffect(() => useGameStore.subscribe((state, previousState) => {
    if (state.phase === 'briefing' && previousState.phase !== 'briefing') respawnRequested.current = true;
  }), []);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreference = () => { reduceMotion.current = preference.matches; };
    syncPreference();
    preference.addEventListener('change', syncPreference);
    return () => preference.removeEventListener('change', syncPreference);
  }, []);

  useEffect(() => {
    const canvas = gl.domElement;
    const onPointerDown = () => {
      const phase = useGameStore.getState().phase;
      if (
        (phase !== 'running' && phase !== 'paused')
        || document.pointerLockElement === canvas
        || typeof canvas.requestPointerLock !== 'function'
      ) return;
      try {
        const lockRequest = canvas.requestPointerLock();
        if (lockRequest instanceof Promise) void lockRequest.catch(() => undefined);
      } catch {
        // Keyboard play remains available when a browser denies pointer lock.
      }
    };
    const onPointerLockChange = () => {
      if (document.pointerLockElement === canvas) useGameStore.getState().beginRun();
    };
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      cameraYaw.current -= event.movementX * MOUSE_SENSITIVITY;
      cameraPitch.current = MathUtils.clamp(cameraPitch.current - event.movementY * MOUSE_SENSITIVITY, MIN_CAMERA_PITCH, MAX_CAMERA_PITCH);
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('mousemove', onMouseMove);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('mousemove', onMouseMove);
    };
  }, [gl]);

  useBeforePhysicsStep((physicsWorld) => {
    const body = bodyRef.current;
    if (!body) return;

    const phase = useGameStore.getState().phase;
    if (phase === 'paused') {
      if (!physicsPaused.current) {
        const velocity = body.linvel();
        pausedVelocity.current = { x: velocity.x, y: velocity.y, z: velocity.z };
        body.setGravityScale(0, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        body.sleep();
        physicsPaused.current = true;
      }
      return;
    }

    if (physicsPaused.current) {
      body.setGravityScale(1, true);
      body.setLinvel(pausedVelocity.current, true);
      body.wakeUp();
      physicsPaused.current = false;
    }

    const delta = Math.min(physicsWorld.timestep, 1 / 30);
    jumpBuffer.current = Math.max(0, jumpBuffer.current - delta);
    groundLockTimer.current = Math.max(0, groundLockTimer.current - delta);
    dashTimer.current = Math.max(0, dashTimer.current - delta);
    dashCooldown.current = Math.max(0, dashCooldown.current - delta);
    vaultTimer.current = Math.max(0, vaultTimer.current - delta);
    vaultCooldown.current = Math.max(0, vaultCooldown.current - delta);
    if (isSliding.current) slideTimer.current = Math.max(0, slideTimer.current - delta);

    const translation = body.translation();
    if (respawnRequested.current || translation.y < -8 || !Number.isFinite(translation.y)) {
      const game = useGameStore.getState();
      const respawn = CHECKPOINTS[game.checkpointIndex]?.respawn ?? START_POSITION;
      body.setTranslation({ x: respawn[0], y: respawn[1], z: respawn[2] }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      respawnRequested.current = false;
      isSliding.current = false;
      setSlideColliders(false);
      jumpBuffer.current = 0;
      coyoteTimer.current = 0;
      dashTimer.current = 0;
      vaultTimer.current = 0;
      wasGrounded.current = false;
      snapCamera.current = true;
      return;
    }

    const linvel = body.linvel();
    const baseY = translation.y - BODY_HALF_EXTENT;
    let grounded = false;
    let bestNormalY = MIN_GROUND_NORMAL;
    groundNormal.set(0, 1, 0);
    if (groundLockTimer.current === 0) {
      for (const [offsetX, offsetZ] of GROUND_PROBE_OFFSETS) {
        const ray = new rapier.Ray({ x: translation.x + offsetX, y: baseY + GROUND_PROBE_START, z: translation.z + offsetZ }, { x: 0, y: -1, z: 0 });
        const hit = physicsWorld.castRayAndGetNormal(ray, GROUND_PROBE_DISTANCE, true, undefined, undefined, undefined, body);
        if (hit && hit.normal.y >= bestNormalY) {
          grounded = true;
          bestNormalY = hit.normal.y;
          groundNormal.set(hit.normal.x, hit.normal.y, hit.normal.z).normalize();
        }
      }
    }

    if (grounded) {
      coyoteTimer.current = COYOTE_TIME;
      if (!wasGrounded.current) {
        const impact = Math.max(0, -lastVerticalVelocity.current);
        if (impact > 3.5 && !reduceMotion.current) {
          landingKick.current = Math.min(0.16, (impact - 3.5) * 0.018);
          landingShake.current = Math.min(0.11, (impact - 3.5) * 0.014);
        }
      }
    } else coyoteTimer.current = Math.max(0, coyoteTimer.current - delta);

    const keys = getKeys();
    forwardVector.set(-Math.sin(cameraYaw.current), 0, -Math.cos(cameraYaw.current));
    rightVector.set(Math.cos(cameraYaw.current), 0, -Math.sin(cameraYaw.current));
    moveVector.set(0, 0, 0);
    const controlsEnabled = useGameStore.getState().phase === 'running';
    if (!controlsEnabled) {
      jumpBuffer.current = 0;
      dashRequest.current = false;
    }
    if (controlsEnabled && keys.forward) moveVector.add(forwardVector);
    if (controlsEnabled && keys.backward) moveVector.sub(forwardVector);
    if (controlsEnabled && keys.right) moveVector.add(rightVector);
    if (controlsEnabled && keys.left) moveVector.sub(rightVector);
    if (moveVector.lengthSq() > 1) moveVector.normalize();
    if (grounded && moveVector.lengthSq() > 0.001) moveVector.projectOnPlane(groundNormal).normalize();

    currentHorizontal.set(linvel.x, 0, linvel.z);
    const horizontalSpeed = currentHorizontal.length();
    const slidePressed = controlsEnabled && keys.slide && !previousSlideInput.current;
    previousSlideInput.current = keys.slide;
    if (slidePressed && !isSliding.current && grounded && horizontalSpeed > 3.2 && dashTimer.current === 0) {
      isSliding.current = true;
      slideTimer.current = SLIDE_DURATION;
      if (horizontalSpeed > 0.2) slideDirection.copy(currentHorizontal).normalize();
      else slideDirection.copy(moveVector.lengthSq() > 0.1 ? moveVector : forwardVector);
      setSlideColliders(true);
      useGameStore.getState().registerTrick('LOW PROFILE', 80);
    }

    if (isSliding.current && !keys.slide && slideTimer.current === 0) {
      let canStand = true;
      const slideTop = translation.y + SLIDE_COLLIDER_OFFSET + SLIDE_HALF_EXTENT - 0.02;
      const clearanceDistance = BODY_HALF_EXTENT - (SLIDE_COLLIDER_OFFSET + SLIDE_HALF_EXTENT) + 0.04;
      for (const [offsetX, offsetZ] of GROUND_PROBE_OFFSETS) {
        const clearanceRay = new rapier.Ray({ x: translation.x + offsetX, y: slideTop, z: translation.z + offsetZ }, { x: 0, y: 1, z: 0 });
        if (physicsWorld.castRay(clearanceRay, clearanceDistance, true, undefined, undefined, undefined, body)) {
          canStand = false;
          break;
        }
      }
      if (canStand) { isSliding.current = false; setSlideColliders(false); }
    }

    if (controlsEnabled && dashRequest.current) {
      dashRequest.current = false;
      if (dashCooldown.current === 0) {
        dashDirection.copy(moveVector);
        if (dashDirection.lengthSq() < 0.05 && horizontalSpeed > 0.2) dashDirection.copy(currentHorizontal).normalize();
        if (dashDirection.lengthSq() < 0.05) dashDirection.copy(forwardVector);
        dashDirection.y = 0;
        dashDirection.normalize();
        dashTimer.current = DASH_DURATION;
        dashCooldown.current = DASH_COOLDOWN;
        if (isSliding.current) { isSliding.current = false; setSlideColliders(false); }
        useGameStore.getState().registerTrick('PACKET DASH', 120);
      }
    }

    if (grounded && !isSliding.current && dashTimer.current === 0 && vaultTimer.current === 0 && vaultCooldown.current === 0 && horizontalSpeed > 3.3 && moveVector.lengthSq() > 0.25) {
      const lowRay = new rapier.Ray({ x: translation.x, y: baseY + 0.46, z: translation.z }, { x: moveVector.x, y: 0, z: moveVector.z });
      const highRay = new rapier.Ray({ x: translation.x, y: baseY + 1.32, z: translation.z }, { x: moveVector.x, y: 0, z: moveVector.z });
      const lowHit = physicsWorld.castRay(lowRay, 0.82, true, undefined, undefined, undefined, body);
      const highHit = physicsWorld.castRay(highRay, 0.9, true, undefined, undefined, undefined, body);
      if (lowHit && !highHit) {
        vaultDirection.copy(moveVector).setY(0).normalize();
        vaultTimer.current = VAULT_DURATION;
        vaultCooldown.current = VAULT_COOLDOWN;
        groundLockTimer.current = 0.16;
        coyoteTimer.current = 0;
        jumpBuffer.current = 0;
        grounded = false;
        useGameStore.getState().registerTrick('GHOST VAULT', 150);
      }
    }

    let verticalVelocity = linvel.y;
    if (controlsEnabled && jumpBuffer.current > 0 && coyoteTimer.current > 0 && dashTimer.current === 0 && vaultTimer.current === 0) {
      if (isSliding.current) { isSliding.current = false; setSlideColliders(false); }
      verticalVelocity = JUMP_SPEED;
      jumpBuffer.current = 0;
      coyoteTimer.current = 0;
      groundLockTimer.current = JUMP_GROUND_LOCK;
      grounded = false;
    }

    if (dashTimer.current > 0) {
      currentHorizontal.copy(dashDirection).multiplyScalar(DASH_SPEED);
      if (grounded) verticalVelocity = Math.max(verticalVelocity, 0.15);
    } else if (vaultTimer.current > 0) {
      currentHorizontal.copy(vaultDirection).multiplyScalar(VAULT_SPEED);
      if (vaultTimer.current > VAULT_DURATION - delta * 1.5) verticalVelocity = VAULT_UP_SPEED;
    } else if (isSliding.current) {
      if (moveVector.lengthSq() > 0.1) slideDirection.lerp(moveVector, 1 - Math.exp(-2.5 * delta)).normalize();
      const entryFrame = slideTimer.current > SLIDE_DURATION - delta * 1.5;
      const slideSpeed = Math.max(SLIDE_MIN_SPEED, horizontalSpeed < SLIDE_ENTRY_SPEED && entryFrame ? SLIDE_ENTRY_SPEED : horizontalSpeed - SLIDE_DECELERATION * delta);
      currentHorizontal.copy(slideDirection).multiplyScalar(slideSpeed);
    } else {
      desiredHorizontal.copy(moveVector).multiplyScalar(controlsEnabled && keys.run ? RUN_SPEED : WALK_SPEED);
      const hasInput = moveVector.lengthSq() > 0.01;
      const acceleration = grounded ? (hasInput ? GROUND_ACCELERATION : GROUND_DECELERATION) : (hasInput ? AIR_ACCELERATION : AIR_DECELERATION);
      velocityDelta.copy(desiredHorizontal).sub(currentHorizontal);
      const maxVelocityDelta = acceleration * delta;
      if (velocityDelta.lengthSq() > maxVelocityDelta * maxVelocityDelta) velocityDelta.normalize().multiplyScalar(maxVelocityDelta);
      currentHorizontal.add(velocityDelta);
    }

    if (grounded && verticalVelocity <= 0 && vaultTimer.current === 0) verticalVelocity = -1.2;
    else if (!grounded) {
      if (!keys.jump && verticalVelocity > 0 && vaultTimer.current === 0) verticalVelocity -= JUMP_CUT_GRAVITY * delta;
      else if (verticalVelocity < 0) verticalVelocity -= EXTRA_FALL_GRAVITY * delta;
      verticalVelocity = Math.max(verticalVelocity, -MAX_FALL_SPEED);
    }

    body.setLinvel({ x: currentHorizontal.x, y: verticalVelocity, z: currentHorizontal.z }, true);
    const footY = translation.y - BODY_HALF_EXTENT;
    for (const pad of BOOST_PADS) {
      const dx = translation.x - pad.position[0];
      const dz = translation.z - pad.position[2];
      const inside = dx * dx + dz * dz <= pad.radius * pad.radius && Math.abs(footY - pad.position[1]) < 1.25;
      if (inside && !activeBoostPads.current.has(pad.id)) {
        activeBoostPads.current.add(pad.id);
        boostDirection.set(...pad.direction).normalize().multiplyScalar(BOOST_IMPULSE);
        body.applyImpulse({ x: boostDirection.x, y: Math.max(2.5, boostDirection.y), z: boostDirection.z }, true);
        groundLockTimer.current = 0.12;
      } else if (!inside) activeBoostPads.current.delete(pad.id);
    }

    const finalSpeed = currentHorizontal.length();
    let avatarAction: AvatarAction = 'idle';
    let storeAction: ParkourAction = 'IDLE';
    if (dashTimer.current > 0) { avatarAction = 'dash'; storeAction = 'DASH'; }
    else if (vaultTimer.current > 0) { avatarAction = 'vault'; storeAction = 'VAULT'; }
    else if (isSliding.current) { avatarAction = 'slide'; storeAction = 'SLIDE'; }
    else if (!grounded) { avatarAction = 'air'; storeAction = 'AIRBORNE'; }
    else if (finalSpeed > 0.25) { avatarAction = 'move'; storeAction = keys.run ? 'SPRINT' : 'MOVE'; }

    const facingDirection = dashTimer.current > 0 ? dashDirection : vaultTimer.current > 0 ? vaultDirection : isSliding.current ? slideDirection : moveVector;
    if (facingDirection.lengthSq() > 0.05) motionRef.current.targetYaw = Math.atan2(-facingDirection.x, -facingDirection.z);
    motionRef.current.action = avatarAction;
    motionRef.current.speed = finalSpeed;
    motionRef.current.grounded = grounded;
    motionRef.current.verticalVelocity = verticalVelocity;
    motionRef.current.storeAction = storeAction;
    lastVerticalVelocity.current = verticalVelocity;
    wasGrounded.current = grounded;
  });

  useFrame((_, delta) => {
    useGameStore.getState().updateClock(delta);
    const body = bodyRef.current;
    if (!body) return;
    cameraClock.current += delta;
    telemetryTimer.current += delta;
    const translation = body.translation();
    const motion = motionRef.current;

    if (telemetryTimer.current >= 0.08) {
      telemetryTimer.current = 0;
      const game = useGameStore.getState();
      const paused = game.phase === 'paused';
      game.updateTelemetry({
        speed: paused ? 0 : motion.speed,
        action: paused ? 'IDLE' : motion.storeAction,
        position: [translation.x, translation.y, translation.z],
        dashCharge: 1 - MathUtils.clamp(dashCooldown.current / DASH_COOLDOWN, 0, 1),
      });
      for (const shard of DATA_SHARDS) {
        if (game.collectedShards[shard.id]) continue;
        const dx = translation.x - shard.position[0];
        const dy = translation.y - shard.position[1];
        const dz = translation.z - shard.position[2];
        if (dx * dx + dy * dy + dz * dz < 1.65) game.collectShard(shard.id);
      }
      const nextCheckpointIndex = game.checkpointIndex + 1;
      const checkpoint = CHECKPOINTS[nextCheckpointIndex];
      if (checkpoint) {
        const dx = translation.x - checkpoint.position[0];
        const dy = translation.y - checkpoint.position[1];
        const dz = translation.z - checkpoint.position[2];
        if (dx * dx + dy * dy + dz * dz <= checkpoint.radius * checkpoint.radius) game.reachCheckpoint(nextCheckpointIndex);
      }
    }

    smoothCameraYaw.current = dampAngle(smoothCameraYaw.current, cameraYaw.current, 22, delta);
    smoothCameraPitch.current = MathUtils.damp(smoothCameraPitch.current, cameraPitch.current, 22, delta);
    landingKick.current = MathUtils.damp(landingKick.current, 0, 9, delta);
    landingShake.current = MathUtils.damp(landingShake.current, 0, 12, delta);
    const speedRatio = MathUtils.clamp(motion.speed / RUN_SPEED, 0, 1.35);
    if (motion.grounded && motion.speed > 0.3 && motion.action === 'move') bobClock.current += delta * (8 + motion.speed * 1.15);
    const bobAmount = !reduceMotion.current && motion.grounded && motion.action === 'move'
      ? Math.sin(bobClock.current * 2) * 0.035 * Math.min(1, speedRatio)
      : 0;
    cameraPivot.set(translation.x, translation.y + CAMERA_PIVOT_HEIGHT + bobAmount, translation.z);
    const pitch = smoothCameraPitch.current - landingKick.current;
    const cosPitch = Math.cos(pitch);
    cameraLookDirection.set(-Math.sin(smoothCameraYaw.current) * cosPitch, Math.sin(pitch), -Math.cos(smoothCameraYaw.current) * cosPitch).normalize();
    cameraRayDirection.copy(cameraLookDirection).multiplyScalar(-1);
    const cameraRay = new rapier.Ray({ x: cameraPivot.x, y: cameraPivot.y, z: cameraPivot.z }, { x: cameraRayDirection.x, y: cameraRayDirection.y, z: cameraRayDirection.z });
    const cameraHit = world.castRay(cameraRay, CAMERA_DISTANCE, true, undefined, undefined, undefined, body);
    const targetDistance = cameraHit ? MathUtils.clamp(cameraHit.timeOfImpact - CAMERA_COLLISION_PADDING, CAMERA_MIN_DISTANCE, CAMERA_DISTANCE) : CAMERA_DISTANCE;
    cameraDistance.current = MathUtils.damp(cameraDistance.current, targetDistance, targetDistance < cameraDistance.current ? 34 : 7, delta);
    desiredCameraPosition.copy(cameraPivot).addScaledVector(cameraRayDirection, cameraDistance.current);
    if (landingShake.current > 0.001) {
      desiredCameraPosition.x += Math.sin(cameraClock.current * 53) * landingShake.current;
      desiredCameraPosition.y += Math.sin(cameraClock.current * 71) * landingShake.current * 0.7;
    }
    if (snapCamera.current) { camera.position.copy(desiredCameraPosition); snapCamera.current = false; }
    else camera.position.lerp(desiredCameraPosition, 1 - Math.exp(-delta * 15));
    camera.lookAt(cameraPivot);

    const perspectiveCamera = camera as PerspectiveCamera;
    const targetFov = reduceMotion.current
      ? BASE_CAMERA_FOV
      : BASE_CAMERA_FOV + Math.min(8, speedRatio * 6.5) + (motion.action === 'dash' ? 6 : 0) + (motion.action === 'vault' ? 2 : 0);
    const nextFov = MathUtils.damp(perspectiveCamera.fov, targetFov, 8, delta);
    if (Math.abs(nextFov - perspectiveCamera.fov) > 0.001) {
      perspectiveCamera.fov = nextFov;
      perspectiveCamera.updateProjectionMatrix();
    }
  });

  return (
    <RigidBody ref={bodyRef} position={INITIAL_POSITION} colliders={false} mass={1} enabledRotations={[false, false, false]} linearDamping={0.05} angularDamping={1} ccd canSleep={false}>
      <CapsuleCollider ref={standingColliderRef} args={[CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS]} friction={0} restitution={0} />
      <CapsuleCollider ref={slidingColliderRef} args={[SLIDE_HALF_HEIGHT, CAPSULE_RADIUS]} position={[0, SLIDE_COLLIDER_OFFSET, 0]} friction={0} restitution={0} />
      <CyberRunner motionRef={motionRef} />
    </RigidBody>
  );
}

export function Player() {
  return (
    <KeyboardControls map={[
      { name: 'forward', keys: ['KeyW', 'ArrowUp'] },
      { name: 'backward', keys: ['KeyS', 'ArrowDown'] },
      { name: 'left', keys: ['KeyA', 'ArrowLeft'] },
      { name: 'right', keys: ['KeyD', 'ArrowRight'] },
      { name: 'run', keys: ['ShiftLeft', 'ShiftRight'] },
      { name: 'jump', keys: ['Space'] },
      { name: 'slide', keys: ['ControlLeft', 'ControlRight', 'KeyC'] },
      { name: 'dash', keys: ['KeyE'] },
    ]}>
      <PlayerController />
    </KeyboardControls>
  );
}

export default Player;
