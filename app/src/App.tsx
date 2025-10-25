import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import './App.css';
import Office from './content/Office';

export default function App() {
  return (
    <div className="app">
      <div className="overlay">
        <h1>Cybersecurity Parkour Sandbox</h1>
        <p>Use your mouse or trackpad to orbit the camera and explore the procedural office.</p>
      </div>
      <Canvas camera={{ position: [20, 22, 20], fov: 45 }} shadows>
        <color attach="background" args={[0.04, 0.05, 0.07]} />
        <Office />
        <OrbitControls maxPolarAngle={Math.PI / 2.1} />
      </Canvas>
    </div>
  );
}
