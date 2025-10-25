import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import {
  KeyboardControls,
  PointerLockControls,
  useAnimations,
  useGLTF,
  useKeyboardControls,
} from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import {
  CapsuleCollider,
  RapierRigidBody,
  RigidBody,
  useRapier,
} from '@react-three/rapier';
import {
  AnimationAction,
  LoopOnce,
  LoopRepeat,
  Vector3,
  type Group,
  type Object3D,
} from 'three';
import { SkeletonUtils } from 'three-stdlib';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

type MovementState = 'idle' | 'run' | 'jump';

type ControlName =
  | 'forward'
  | 'backward'
  | 'left'
  | 'right'
  | 'run'
  | 'jump';

const MODEL_URL = new URL('models/andrew.glb', import.meta.env.BASE_URL).toString();
const HALF_HEIGHT = 0.6;
const RADIUS = 0.3;
const WALK_SPEED = 4.25;
const RUN_SPEED = 7.5;
const JUMP_IMPULSE = 4.5;
const VAULT_FORWARD_IMPULSE = 3;
const VAULT_UP_IMPULSE = 3.5;
const CAMERA_HEIGHT_OFFSET = 0.4;
const CAMERA_FOLLOW_SMOOTHNESS = 12;
const AVATAR_HEIGHT_OFFSET = -(HALF_HEIGHT + RADIUS);

const IDLE_CLIP_NAMES = ['Idle', 'idle', 'Armature|Idle', 'Armature|mixamo.com|Layer0'];
const RUN_CLIP_NAMES = ['Run', 'Running', 'run', 'Jog', 'Armature|Run'];
const JUMP_CLIP_NAMES = ['Jump', 'jump', 'Armature|Jump'];

type PlayerAvatarModelProps = {
  movementState: MovementState;
};

function PlayerAvatarModel({ movementState }: PlayerAvatarModelProps) {
  const { scene, animations } = useGLTF(MODEL_URL);
  const clonedScene = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { actions, mixer } = useAnimations(animations, clonedScene);
  const currentAction = useRef<AnimationAction | null>(null);

  const resolveAction = (
    candidates: readonly string[],
    allowFallback = true,
  ): AnimationAction | undefined => {
    if (!actions) {
      return undefined;
    }

    for (const name of candidates) {
      const action = actions[name];
      if (action) {
        return action;
      }
    }

    if (!allowFallback) {
      return undefined;
    }

    const availableActions = Object.values(actions).filter(
      (action): action is AnimationAction => Boolean(action),
    );

    return availableActions[0];
  };

  useEffect(() => {
    clonedScene.traverse((object: Object3D) => {
      object.castShadow = true;
      object.receiveShadow = true;
    });
  }, [clonedScene]);

  useEffect(() => {
    return () => {
      mixer?.stopAllAction();
    };
  }, [mixer]);

  useEffect(() => {
    if (!actions) {
      return;
    }

    let nextAction: AnimationAction | undefined;

    switch (movementState) {
      case 'idle':
        nextAction = resolveAction(IDLE_CLIP_NAMES);
        if (nextAction) {
          nextAction.setLoop(LoopRepeat, Infinity);
          nextAction.clampWhenFinished = false;
        }
        break;
      case 'run':
        nextAction = resolveAction(RUN_CLIP_NAMES);
        if (nextAction) {
          nextAction.setLoop(LoopRepeat, Infinity);
          nextAction.clampWhenFinished = false;
        }
        break;
      case 'jump':
        nextAction = resolveAction(JUMP_CLIP_NAMES, false);
        if (nextAction) {
          nextAction.reset();
          nextAction.setLoop(LoopOnce, 1);
          nextAction.clampWhenFinished = true;
        }
        break;
      default:
        break;
    }

    if (!nextAction) {
      return;
    }

    const previous = currentAction.current;

    if (previous !== nextAction) {
      nextAction.reset();
      nextAction.play();
      if (previous) {
        previous.crossFadeTo(nextAction, 0.2, false);
      }
      currentAction.current = nextAction;
    } else if (movementState === 'jump') {
      // Restart the jump animation whenever we trigger another jump.
      nextAction.reset().play();
    }
  }, [actions, movementState]);

  useFrame((_, delta) => {
    mixer?.update(delta);
  });

  return <primitive object={clonedScene} />;
}

type PlayerAvatarProps = {
  movementState: MovementState;
  groupRef: MutableRefObject<Group | null>;
};

function AvatarFallback() {
  return (
    <group>
      <mesh castShadow>
        <capsuleGeometry args={[RADIUS * 0.85, HALF_HEIGHT * 1.4, 8, 16]} />
        <meshStandardMaterial color="#9ca3af" />
      </mesh>
    </group>
  );
}

function PlayerAvatar({ movementState, groupRef }: PlayerAvatarProps) {
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let isMounted = true;
    setModelStatus('loading');
    const loader = new GLTFLoader();

    loader.load(
      MODEL_URL,
      () => {
        if (!isMounted) {
          return;
        }

        setModelStatus('ready');
        useGLTF.preload(MODEL_URL);
      },
      undefined,
      () => {
        if (isMounted) {
          setModelStatus('error');
        }
      },
    );

    return () => {
      isMounted = false;
    };
  }, []);

  const content =
    modelStatus === 'ready' ? (
      <Suspense fallback={<AvatarFallback />}>
        <PlayerAvatarModel movementState={movementState} />
      </Suspense>
    ) : (
      <AvatarFallback />
    );

  return (
    <group ref={groupRef} position={[0, AVATAR_HEIGHT_OFFSET, 0]}>
      {content}
    </group>
  );
}

function PlayerController() {
  const bodyRef = useRef<RapierRigidBody>(null);
  const avatarRef = useRef<Group>(null);
  const vaultCooldown = useRef(0);
  const jumpRequest = useRef(false);
  const movementStateRef = useRef<MovementState>('idle');
  const [movementState, setMovementState] = useState<MovementState>('idle');
  const { camera } = useThree();
  const { rapier, world } = useRapier();
  const [subscribeKeys, getKeys] = useKeyboardControls<ControlName>();

  const forwardVector = useMemo(() => new Vector3(), []);
  const sideVector = useMemo(() => new Vector3(), []);
  const moveVector = useMemo(() => new Vector3(), []);
  const desiredVelocity = useMemo(() => new Vector3(), []);
  const cameraTarget = useMemo(() => new Vector3(), []);

  useEffect(() => {
    const rawWorld = (world as unknown as {
      raw?: () => { setGravity: (value: { x: number; y: number; z: number }) => void };
    }).raw?.();
    rawWorld?.setGravity({ x: 0, y: -9.81, z: 0 });
  }, [world]);

  useEffect(() => {
    const unsubscribe = subscribeKeys(
      (state) => state.jump,
      (pressed) => {
        if (pressed) {
          jumpRequest.current = true;
        }
      },
    );
    return unsubscribe;
  }, [subscribeKeys]);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body) {
      return;
    }

    vaultCooldown.current = Math.max(0, vaultCooldown.current - delta);

    const translation = body.translation();
    const linvel = body.linvel();

    // Prepare orientation-aligned vectors.
    forwardVector.set(0, 0, -1).applyQuaternion(camera.quaternion);
    forwardVector.y = 0;
    forwardVector.normalize();

    sideVector.set(1, 0, 0).applyQuaternion(camera.quaternion);
    sideVector.y = 0;
    sideVector.normalize();

    moveVector.set(0, 0, 0);

    const { forward, backward, left, right, run } = getKeys();

    if (forward) moveVector.add(forwardVector);
    if (backward) moveVector.sub(forwardVector);
    if (left) moveVector.sub(sideVector);
    if (right) moveVector.add(sideVector);

    if (moveVector.lengthSq() > 0) {
      moveVector.normalize();
    }

    const speed = run ? RUN_SPEED : WALK_SPEED;
    desiredVelocity.copy(moveVector).multiplyScalar(speed);

    body.setLinvel({ x: desiredVelocity.x, y: linvel.y, z: desiredVelocity.z }, true);

    if (avatarRef.current && moveVector.lengthSq() > 0.01) {
      const targetAngle = Math.atan2(desiredVelocity.x, desiredVelocity.z);
      avatarRef.current.rotation.y = targetAngle;
    }

    // Ground detection via ray cast slightly below the player.
    const baseY = translation.y - (HALF_HEIGHT + RADIUS);
    const rayOrigin = {
      x: translation.x,
      y: baseY + 0.05,
      z: translation.z,
    };
    const ray = new rapier.Ray(rayOrigin, { x: 0, y: -1, z: 0 });
    const groundHit = world.castRay(
      ray,
      0.15,
      true,
      undefined,
      undefined,
      undefined,
      body,
    );
    const isGrounded = Boolean(groundHit);

    if (jumpRequest.current && isGrounded) {
      body.applyImpulse({ x: 0, y: JUMP_IMPULSE, z: 0 }, true);
      jumpRequest.current = false;
    }

    if (!getKeys().jump) {
      jumpRequest.current = false;
    }

    const updatedLinvel = body.linvel();
    const horizontalSpeed = Math.hypot(updatedLinvel.x, updatedLinvel.z);
    let nextState: MovementState = 'idle';

    if (!isGrounded) {
      nextState = 'jump';
    } else if (horizontalSpeed > 0.1) {
      nextState = 'run';
    }

    if (movementStateRef.current !== nextState) {
      movementStateRef.current = nextState;
      setMovementState(nextState);
    }

    // Simple vault mechanic: check forward for low obstacle.
    if (isGrounded && vaultCooldown.current === 0 && moveVector.lengthSq() > 0.1) {
      const vaultOrigin = {
        x: translation.x,
        y: baseY + 0.9,
        z: translation.z,
      };
      const vaultRay = new rapier.Ray(vaultOrigin, {
        x: moveVector.x,
        y: moveVector.y,
        z: moveVector.z,
      });
      const vaultHit = world.castRay(
        vaultRay,
        0.8,
        true,
        undefined,
        undefined,
        undefined,
        body,
      );

      if (vaultHit) {
        const hitPoint = vaultRay.pointAt(vaultHit.timeOfImpact);
        const obstacleHeight = hitPoint.y - baseY;
        if (obstacleHeight > 0.1 && obstacleHeight < 1.2) {
          body.applyImpulse(
            {
              x: moveVector.x * VAULT_FORWARD_IMPULSE,
              y: VAULT_UP_IMPULSE,
              z: moveVector.z * VAULT_FORWARD_IMPULSE,
            },
            true,
          );
          vaultCooldown.current = 0.5;
        }
      }
    }

    // Camera follow positioning.
    cameraTarget.set(translation.x, translation.y + CAMERA_HEIGHT_OFFSET, translation.z);
    camera.position.lerp(cameraTarget, 1 - Math.exp(-delta * CAMERA_FOLLOW_SMOOTHNESS));
  });

  return (
    <RigidBody
      ref={bodyRef}
      colliders={false}
      mass={1}
      position={[0, HALF_HEIGHT + RADIUS + 0.1, 0]}
      enabledRotations={[false, false, false]}
      linearDamping={0.9}
      angularDamping={1}
    >
      <CapsuleCollider args={[HALF_HEIGHT, RADIUS]} />
      <PlayerAvatar movementState={movementState} groupRef={avatarRef} />
    </RigidBody>
  );
}

export function Player() {
  return (
    <KeyboardControls
      map={[
        { name: 'forward', keys: ['KeyW', 'ArrowUp'] },
        { name: 'backward', keys: ['KeyS', 'ArrowDown'] },
        { name: 'left', keys: ['KeyA', 'ArrowLeft'] },
        { name: 'right', keys: ['KeyD', 'ArrowRight'] },
        { name: 'run', keys: ['ShiftLeft', 'ShiftRight'] },
        { name: 'jump', keys: ['Space'] },
      ]}
    >
      <PointerLockControls selector="canvas" />
      <PlayerController />
    </KeyboardControls>
  );
}

export default Player;
