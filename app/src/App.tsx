import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import './App.css';
import Office from './content/Office';
import useYeller from './game/useYeller';

export default function App() {
  const { isSupported, muted, toggleMute } = useYeller();

  return (
    <div className="app">
      <div className="overlay">
        <h1>Cybersecurity Parkour Sandbox</h1>
        <p>
          Use your mouse or trackpad to orbit the camera, then click inside the scene to take
          control.
        </p>
        <div className="overlay-controls">
          {isSupported ? (
            <button
              aria-pressed={muted}
              className="mute-toggle"
              onClick={toggleMute}
              type="button"
            >
              {muted ? 'Unmute Cybersecurity Yeller' : 'Mute Cybersecurity Yeller'}
            </button>
          ) : (
            <p className="mute-unavailable">Speech synthesis is unavailable in this browser.</p>
          )}
        </div>
      </div>
      <Canvas camera={{ position: [20, 22, 20], fov: 45 }} shadows>
        <color attach="background" args={[0.04, 0.05, 0.07]} />
        <Office />
        <OrbitControls maxPolarAngle={Math.PI / 2.1} />
      </Canvas>
    </div>
  );
}
