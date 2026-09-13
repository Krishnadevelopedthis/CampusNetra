import { Suspense, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Billboard, ContactShadows, Grid, OrbitControls, Text } from '@react-three/drei'

// World spans -HALF_W..HALF_W on X and -HALF_D..HALF_D on Z, kept at the same
// 1000:620 aspect as the 2D map's viewBox so a building's relative position
// reads the same in both views.
const HALF_W = 10
const HALF_D = 6.2
const FLOOR_HEIGHT = 0.5
const MIN_HEIGHT = 0.6

function toWorld(mapX, mapY) {
  return [(mapX - 0.5) * 2 * HALF_W, (mapY - 0.5) * 2 * HALF_D]
}

/**
 * One building, extruded to a height proportional to its floor count so
 * "which building has the most floors" is visible at a glance, not just
 * "which building has a problem" (colour still carries that, as it does on
 * the 2D map — condition colour or heat colour, same rule, same legend).
 */
function Building3D({ b, colour, count, isHot, hovered, onHover, onOpen }) {
  const meshRef = useRef()
  const floors = Math.max(1, (b.floors || []).length)
  const widest = Math.max(1, ...(b.floors || []).map((f) => f.rooms?.length || 0))
  const width = Math.min(2.4, 1 + widest * 0.12)
  const depth = width * 0.75
  const height = Math.max(MIN_HEIGHT, floors * FLOOR_HEIGHT)
  const [x, z] = toWorld(b.map_x, b.map_y)

  return (
    <group position={[x, 0, z]}>
      <mesh
        ref={meshRef}
        position={[0, height / 2, 0]}
        onPointerOver={(e) => { e.stopPropagation(); onHover(b) }}
        onPointerOut={(e) => { e.stopPropagation(); onHover(null) }}
        onClick={(e) => { e.stopPropagation(); onOpen(b) }}
      >
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial
          color={colour}
          emissive={colour}
          emissiveIntensity={hovered ? 0.55 : 0.18}
          roughness={0.55}
          metalness={0.05}
        />
      </mesh>

      {/* Base ring, brighter when hovered — cheap depth cue and hit-target
          without needing an outline post-processing pass. */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[Math.max(width, depth) * 0.62, Math.max(width, depth) * 0.72, 32]} />
        <meshBasicMaterial color={colour} transparent opacity={hovered ? 0.9 : 0.35} />
      </mesh>

      {isHot && (
        <mesh position={[width / 2 + 0.15, height + 0.22, -depth / 2 - 0.15]}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.8} />
        </mesh>
      )}

      <Billboard position={[0, height + 0.42, 0]}>
        <Text fontSize={0.32} color="#0b1c30" outlineWidth={0.018} outlineColor="#ffffff"
              anchorX="center" anchorY="middle">
          {b.code}
        </Text>
        {count != null && (
          <Text fontSize={0.22} color="#334155" outlineWidth={0.012} outlineColor="#ffffff"
                anchorX="center" anchorY="middle" position={[0, -0.3, 0]}>
            {count}
          </Text>
        )}
      </Billboard>
    </group>
  )
}

function Scene({ buildings, heatByBuilding, mode, heatColour, onHover, onOpen, hoveredId }) {
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[8, 14, 6]} intensity={0.9} />
      <directionalLight position={[-6, 8, -8]} intensity={0.25} />

      <Grid
        args={[HALF_W * 2 + 4, HALF_D * 2 + 4]}
        cellSize={1} cellThickness={0.5} cellColor="#94a3b8"
        sectionSize={5} sectionThickness={1} sectionColor="#64748b"
        fadeDistance={30} fadeStrength={1} infiniteGrid={false}
        position={[0, 0, 0]}
      />

      {buildings.map((b) => {
        const h = heatByBuilding.get(b.id)
        const colour = mode === 'heat' ? heatColour(h?.intensity ?? 0) : b.aggregate_colour
        const count = mode === 'heat' ? (h?.count ?? 0) : (b.open_issues || null)
        return (
          <Building3D
            key={b.id}
            b={b}
            colour={colour}
            count={count}
            isHot={mode === 'condition' && b.open_issues > 0}
            hovered={hoveredId === b.id}
            onHover={(bld) => onHover(bld ? { ...bld, heat: heatByBuilding.get(bld.id) } : null)}
            onOpen={onOpen}
          />
        )
      })}

      <ContactShadows position={[0, 0, 0]} opacity={0.35} scale={30} blur={2} far={4} />
      <OrbitControls
        makeDefault
        enableDamping dampingFactor={0.1}
        minDistance={6} maxDistance={28}
        maxPolarAngle={Math.PI / 2.15}
        target={[0, 0.5, 0]}
      />
    </>
  )
}

/**
 * The 3D counterpart to the flat SVG campus map — same data, same colour
 * rules (condition vs. heat), same hover contract (calls `onHover` with the
 * hovered building plus its heat entry, or null), so the info panel already
 * built for the 2D view works for this one without changes.
 */
export default function Campus3DView({ buildings, heatByBuilding, mode, heatColour, onHover, onOpen }) {
  const [hoveredId, setHoveredId] = useState(null)

  const handleHover = (b) => {
    setHoveredId(b?.id ?? null)
    onHover(b)
  }

  // Buildings never move once loaded for a given campus, so the scene only
  // needs to remount when the actual set of buildings changes.
  const key = useMemo(() => buildings.map((b) => b.id).join(','), [buildings])

  return (
    <div className="w-full h-[560px] cursor-grab active:cursor-grabbing">
      <Canvas key={key} camera={{ position: [0, 13, 15], fov: 45 }}
              dpr={[1, 1.5]} gl={{ antialias: true }}>
        <Suspense fallback={null}>
          <Scene
            buildings={buildings}
            heatByBuilding={heatByBuilding}
            mode={mode}
            heatColour={heatColour}
            onHover={handleHover}
            onOpen={onOpen}
            hoveredId={hoveredId}
          />
        </Suspense>
      </Canvas>
    </div>
  )
}
