import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import './App.css';

function Placeholder() {
  return (
    <mesh position={[0, 0, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#4ade80" wireframe />
    </mesh>
  );
}

export default function App() {
  return (
    <div className="app">
      <div className="overlay">
        <h1>Cybersecurity Parkour Sandbox</h1>
        <p>Use your mouse or trackpad to orbit the camera and explore the empty space.</p>
      </div>
      <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <Placeholder />
        <OrbitControls enablePan={false} />
      </Canvas>
    </div>
  );
}
