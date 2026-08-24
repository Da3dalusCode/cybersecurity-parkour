export type Vec3 = readonly [number, number, number];

export type CheckpointDefinition = {
  id: string;
  label: string;
  kicker: string;
  position: Vec3;
  respawn: Vec3;
  radius: number;
};

export type DataShardDefinition = {
  id: string;
  position: Vec3;
  value: number;
};

export type BoostPadDefinition = {
  id: string;
  position: Vec3;
  direction: Vec3;
  radius: number;
};

export const CHECKPOINTS: readonly CheckpointDefinition[] = [
  {
    id: 'spawn',
    label: 'DROP ZONE',
    kicker: 'INITIALIZE',
    position: [0, 1, 18],
    respawn: [0, 1.15, 19],
    radius: 2.8,
  },
  {
    id: 'breach',
    label: 'BREACH',
    kicker: 'CLEAR THE CUBICLES',
    position: [0, 1.1, 4.5],
    respawn: [0, 1.15, 5.4],
    radius: 2.7,
  },
  {
    id: 'uplink',
    label: 'UPLINK',
    kicker: 'GAIN ELEVATION',
    position: [8, 3.6, -8.5],
    respawn: [8, 4.15, -7],
    radius: 2.6,
  },
  {
    id: 'firewall',
    label: 'FIREWALL',
    kicker: 'RUN THE GAUNTLET',
    position: [-5, 4.6, -21],
    respawn: [-3.5, 5.05, -19],
    radius: 2.6,
  },
  {
    id: 'exfil',
    label: 'EXFIL',
    kicker: 'TRANSMISSION SECURED',
    position: [0, 1.4, -36],
    respawn: [0, 1.15, -33],
    radius: 3.2,
  },
] as const;

export const DATA_SHARDS: readonly DataShardDefinition[] = [
  { id: 'packet-01', position: [-2.6, 1.2, 14], value: 100 },
  { id: 'packet-02', position: [2.6, 1.5, 10.5], value: 100 },
  { id: 'packet-03', position: [0, 1.8, 6.8], value: 150 },
  { id: 'packet-04', position: [0, 2.9, -2], value: 150 },
  { id: 'packet-05', position: [4.2, 3.5, -6], value: 200 },
  { id: 'packet-06', position: [8, 4.5, -10.5], value: 200 },
  { id: 'packet-07', position: [3.2, 4.8, -15.5], value: 250 },
  { id: 'packet-08', position: [-3.2, 5.1, -19.5], value: 250 },
  { id: 'packet-09', position: [-5, 5.2, -24.5], value: 300 },
  { id: 'packet-10', position: [-1.8, 2.5, -30], value: 300 },
  { id: 'packet-11', position: [2, 2, -33], value: 350 },
  { id: 'packet-12', position: [0, 2.4, -36], value: 500 },
] as const;

export const BOOST_PADS: readonly BoostPadDefinition[] = [
  { id: 'launch-01', position: [0, 0.08, 1.5], direction: [0, 0.55, -1], radius: 1.4 },
  { id: 'launch-02', position: [6.4, 3.25, -12.3], direction: [-0.75, 0.4, -1], radius: 1.4 },
  { id: 'launch-03', position: [-5, 4.25, -25.3], direction: [0.25, 0.6, -1], radius: 1.4 },
] as const;

export const START_POSITION: Vec3 = CHECKPOINTS[0].respawn;
