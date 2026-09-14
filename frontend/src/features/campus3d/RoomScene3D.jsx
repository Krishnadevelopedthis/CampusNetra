import { Suspense, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Billboard, ContactShadows, OrbitControls, Text } from '@react-three/drei'

import { TWIN_STATE } from '@/lib/format'

const ROOM_HEIGHT = 2.4
const WALL_COLOUR = '#f1f5f9'
const FLOOR_COLOUR = '#cbd5e1'

/**
 * A room's `boundary` is a polygon of 0..1 points in the *floor plan's*
 * coordinate space, not the room's own — useful for drawing it on a floor
 * plan, useless for sizing a standalone room. What actually describes the
 * room's own shape is its bounding box's aspect ratio, which is what this
 * pulls out; the absolute floor-plan position is irrelevant here.
 */
function roomAspect(boundary) {
  if (!boundary || boundary.length < 3) return 1.3
  const xs = boundary.map((p) => p[0])
  const ys = boundary.map((p) => p[1])
  const w = Math.max(...xs) - Math.min(...xs)
  const h = Math.max(...ys) - Math.min(...ys)
  if (!w || !h) return 1.3
  return Math.min(2.2, Math.max(0.6, w / h))
}

function AssetMarker3D({ asset, roomW, roomD, hovered, onHover, onOpen }) {
  const state = TWIN_STATE[asset.state] || TWIN_STATE.healthy
  // pos_x/pos_y are normalised within the room's own bounding box (0..1),
  // same convention the 2D floor plan uses — so a marker here lands in the
  // same relative spot it would on that plan, just in three dimensions.
  const x = (asset.pos_x ?? 0.5) * roomW - roomW / 2
  const z = (asset.pos_y ?? 0.5) * roomD - roomD / 2

  return (
    <group position={[x, 0, z]}>
      <mesh
        position={[0, 0.22, 0]}
        onPointerOver={(e) => { e.stopPropagation(); onHover(asset) }}
        onPointerOut={(e) => { e.stopPropagation(); onHover(null) }}
        onClick={(e) => { e.stopPropagation(); onOpen(asset) }}
      >
        <boxGeometry args={[0.26, 0.44, 0.26]} />
        <meshStandardMaterial
          color={state.colour} emissive={state.colour}
          emissiveIntensity={hovered ? 0.7 : 0.3} roughness={0.5}
        />
      </mesh>
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.16, 0.2, 24]} />
        <meshBasicMaterial color={state.colour} transparent opacity={hovered ? 0.9 : 0.45} />
      </mesh>
      {hovered && (
        <Billboard position={[0, 0.72, 0]}>
          <Text fontSize={0.16} color="#0b1c30" outlineWidth={0.01} outlineColor="#ffffff"
                anchorX="center" anchorY="middle">
            {asset.tag}
          </Text>
        </Billboard>
      )}
    </group>
  )
}

function Scene({ aspect, assets, onOpen }) {
  const [hoveredId, setHoveredId] = useState(null)
  const roomW = aspect >= 1 ? 5.5 : 5.5 * aspect
  const roomD = aspect >= 1 ? 5.5 / aspect : 5.5

  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[4, 6, 3]} intensity={0.7} />
      <directionalLight position={[-3, 4, -4]} intensity={0.3} />

      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[roomW, roomD]} />
        <meshStandardMaterial color={FLOOR_COLOUR} roughness={0.9} />
      </mesh>

      {/* Four low walls, open-topped so the camera can look down into the
          room — a real ceiling would just hide everything from the default
          orbit angle. */}
      {[
        { pos: [0, ROOM_HEIGHT / 2, -roomD / 2], size: [roomW, ROOM_HEIGHT, 0.08] },
        { pos: [0, ROOM_HEIGHT / 2, roomD / 2], size: [roomW, ROOM_HEIGHT, 0.08] },
        { pos: [-roomW / 2, ROOM_HEIGHT / 2, 0], size: [0.08, ROOM_HEIGHT, roomD] },
        { pos: [roomW / 2, ROOM_HEIGHT / 2, 0], size: [0.08, ROOM_HEIGHT, roomD] },
      ].map((w, i) => (
        <mesh key={i} position={w.pos}>
          <boxGeometry args={w.size} />
          <meshStandardMaterial color={WALL_COLOUR} roughness={0.85} />
        </mesh>
      ))}

      {assets.map((a) => (
        <AssetMarker3D
          key={a.id}
          asset={a}
          roomW={roomW * 0.86} roomD={roomD * 0.86}
          hovered={hoveredId === a.id}
          onHover={(x) => setHoveredId(x?.id ?? null)}
          onOpen={onOpen}
        />
      ))}

      <ContactShadows position={[0, 0.01, 0]} opacity={0.3} scale={roomW + roomD} blur={2} far={3} />
      <OrbitControls
        makeDefault enableDamping dampingFactor={0.1}
        minDistance={2.5} maxDistance={12}
        maxPolarAngle={Math.PI / 2.1}
        target={[0, 0.3, 0]}
      />
    </>
  )
}

/** Focused 3D view of one room and the assets placed in it — the drill-down
 * past a room selection, for actually seeing where equipment sits rather
 * than only reading it off a table. */
export default function RoomScene3D({ room, assets, onOpenAsset }) {
  const aspect = useMemo(() => roomAspect(room?.boundary), [room?.boundary])

  return (
    <div className="w-full h-[420px] cursor-grab active:cursor-grabbing">
      <Canvas camera={{ position: [3.2, 4, 4.6], fov: 45 }} dpr={[1, 1.5]} gl={{ antialias: true }}>
        <Suspense fallback={null}>
          <Scene aspect={aspect} assets={assets} onOpen={onOpenAsset} />
        </Suspense>
      </Canvas>
    </div>
  )
}
