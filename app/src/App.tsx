import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import './App.css';
import Office from './content/Office';
import useYeller from './game/useYeller';
import Player from './game/Player';

export default function App() {
  const { isSupported, muted, toggleMute } = useYeller();

  return (
    <div className="app">
      <div className="overlay">
        <h1>Cybersecurity Parkour Sandbox</h1>
        <p>Click inside the scene to take control of the agent.</p>
        <p>WASD to move, Shift to run, Space to jump.</p>
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
      <Canvas camera={{ position: [0, 1.7, 6], fov: 60 }} shadows>
        <color attach="background" args={['#0a0d12']} />
        <Physics gravity={[0, -9.81, 0]}>
          <Office />
          <Player />
        </Physics>
      </Canvas>
    </div>
  );
}
