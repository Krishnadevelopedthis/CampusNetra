import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/**
 * The campus, rendered as an actual 3D scene rather than a flat SVG.
 *
 * One canvas, four levels of detail, navigated by clicking the thing you want
 * to go inside — a building shows its floors stacked, a floor shows its
 * rooms laid out on it, a room shows the equipment inside it and lets you
 * click empty floor space to place a new one. Nothing here is a picture of
 * a building; every box is a real mesh positioned from the same map_x/map_y,
 * floors_count and pos_x/pos_y the old flat map used, so drilling in and
 * back out never re-fetches anything the caller did not already have.
 */

const WORLD = 34            // campus footprint, world units on each side
const BUILDING_UNIT = 2.6   // world units per building "cell"
const FLOOR_HEIGHT = 1.1
const FLOOR_UNIT = 2.4      // world units per floor-level tile edge
const ROOM_WORLD = 20       // room-level floor size, world units

// A small accent colour per room kind, shown as a corner tab on the tile —
// enough to tell a lab from a classroom at a glance without hiding the
// state colour, which still carries the primary signal.
const KIND_ACCENT = {
  laboratory: '#a855f7',
  classroom: '#3b82f6',
  lecture_hall: '#6366f1',
  auditorium: '#6366f1',
  server_room: '#ef4444',
  library: '#14b8a6',
  office: '#64748b',
  cafeteria: '#f59e0b',
  hostel_room: '#ec4899',
  washroom: '#94a3b8',
  corridor: '#cbd5e1',
  store: '#a8a29e',
  utility: '#a8a29e',
  other: '#94a3b8',
}

function disposeObject(obj) {
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose()
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      mats.forEach((m) => { m.map?.dispose(); m.dispose() })
    }
  })
}

/** Canvas-drawn text sprite — cheaper than loading a font for a handful of labels. */
function makeLabel(text, { fontSize = 42, color = '#0f172a', bg = 'rgba(255,255,255,0.88)' } = {}) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`
  const metrics = ctx.measureText(text)
  const padX = 22
  canvas.width = Math.ceil(metrics.width) + padX * 2
  canvas.height = fontSize + 28
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`
  ctx.fillStyle = bg
  const r = 14
  const w = canvas.width, h = canvas.height
  ctx.beginPath()
  ctx.moveTo(r, 0); ctx.arcTo(w, 0, w, h, r); ctx.arcTo(w, h, 0, h, r)
  ctx.arcTo(0, h, 0, 0, r); ctx.arcTo(0, 0, w, 0, r)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  ctx.fillText(text, padX, h / 2 + 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true })
  const sprite = new THREE.Sprite(material)
  const scale = 0.017
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1)
  return sprite
}

/** ceil(sqrt(n))-column grid layout inside a square, normalised 0..1 per cell centre. */
function gridCells(n, cols = Math.max(1, Math.ceil(Math.sqrt(n)))) {
  const rows = Math.max(1, Math.ceil(n / cols))
  return Array.from({ length: n }, (_, i) => ({
    cx: (i % cols + 0.5) / cols,
    cy: (Math.floor(i / cols) + 0.5) / rows,
    cellW: 1 / cols,
    cellH: 1 / rows,
  }))
}

// Shared window material — lots of window quads get created per rebuild
// (every building, every floor), one material for all of them instead of
// one per quad keeps that from being needlessly expensive.
const WINDOW_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#dceaf7', roughness: 0.25, metalness: 0.15,
  emissive: '#bfe0ff', emissiveIntensity: 0.35,
})

/** A grid of window quads on all four vertical faces of a footprint×height
 * box, roughly one row per floor. Purely decorative — condition/heat colour
 * lives on the roof cap and base ring added alongside this, not the walls,
 * so a building reads as a building first and a status indicator second. */
function addBuildingWindows(content, { cx, cz, footprint, height, floors }) {
  const cols = Math.max(2, Math.min(5, Math.round(footprint / 0.6)))
  const rows = Math.max(1, Math.min(6, floors))
  const rowH = height / rows
  const winW = (footprint / cols) * 0.52
  const winH = rowH * 0.5
  const marginY = (rowH - winH) / 2
  const half = footprint / 2

  const faces = [
    { axis: 'z', sign: 1 }, { axis: 'z', sign: -1 },
    { axis: 'x', sign: 1 }, { axis: 'x', sign: -1 },
  ]
  const group = new THREE.Group()
  faces.forEach(({ axis, sign }) => {
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), WINDOW_MATERIAL)
        const along = (c + 0.5) / cols - 0.5
        const y = r * rowH + marginY + winH / 2
        if (axis === 'z') {
          mesh.position.set(cx + along * footprint * 0.94, y, cz + sign * (half + 0.015))
          mesh.rotation.y = sign > 0 ? 0 : Math.PI
        } else {
          mesh.position.set(cx + sign * (half + 0.015), y, cz + along * footprint * 0.94)
          mesh.rotation.y = sign > 0 ? Math.PI / 2 : -Math.PI / 2
        }
        group.add(mesh)
      }
    }
  })
  content.add(group)
}

/** Open-topped walls sized to a square room, with a door gap in the front
 * wall and windows on the back wall — enough to read as an actual room
 * rather than a floor with markers floating over it. */
function addRoomWalls(content, half, height = 3.1) {
  const wallMat = new THREE.MeshStandardMaterial({ color: '#eef2f6', roughness: 0.85, side: THREE.DoubleSide })
  const t = 0.08
  const full = half * 2
  const group = new THREE.Group()

  const back = new THREE.Mesh(new THREE.BoxGeometry(full, height, t), wallMat)
  back.position.set(0, height / 2, -half)
  group.add(back)

  const left = new THREE.Mesh(new THREE.BoxGeometry(t, height, full), wallMat)
  left.position.set(-half, height / 2, 0)
  group.add(left)

  const right = left.clone()
  right.position.set(half, height / 2, 0)
  group.add(right)

  // Front wall gets a door-width gap in the middle rather than one solid slab.
  const doorWidth = full * 0.22
  const segW = (full - doorWidth) / 2
  const frontL = new THREE.Mesh(new THREE.BoxGeometry(segW, height, t), wallMat)
  frontL.position.set(-(doorWidth / 2 + segW / 2), height / 2, half)
  group.add(frontL)
  const frontR = frontL.clone()
  frontR.position.set(doorWidth / 2 + segW / 2, height / 2, half)
  group.add(frontR)

  // Windows: three across the back wall, one on each side wall.
  const cols = 3
  for (let i = 0; i < cols; i += 1) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry((full / cols) * 0.55, height * 0.32), WINDOW_MATERIAL)
    w.position.set((i + 0.5) / cols * full - half, height * 0.56, -half + t / 2 + 0.01)
    group.add(w)
  }
  const sideWin = new THREE.PlaneGeometry(full * 0.26, height * 0.32)
  const wL = new THREE.Mesh(sideWin, WINDOW_MATERIAL)
  wL.rotation.y = Math.PI / 2
  wL.position.set(-half + t / 2 + 0.01, height * 0.56, 0)
  group.add(wL)
  const wR = new THREE.Mesh(sideWin, WINDOW_MATERIAL)
  wR.rotation.y = -Math.PI / 2
  wR.position.set(half - t / 2 - 0.01, height * 0.56, 0)
  group.add(wR)

  content.add(group)
}

export const CampusScene3D = forwardRef(function CampusScene3D({
  view,               // 'campus' | 'building' | 'floor' | 'room'
  buildings = [],     // overview.buildings, each with .floors (nested) and .map_x/.map_y
  autoCount = 0,
  mode = 'condition', // 'condition' | 'heat'
  heatByBuilding,     // Map<buildingId, {intensity,count}> — only used at campus level
  heatColour,         // (intensity) => css colour, supplied by the caller
  selectedBuildingId,
  selectedFloorId,
  selectedRoomId,
  roomAssets = null,  // assets for the selected room, from the floor-plan fetch (null while loading)
  pendingPlacement = null, // {x,y} normalised, set while the "place asset" form is open
  onSelectBuilding,
  onSelectFloor,
  onSelectRoom,
  onSelectAsset,
  onPlaceAsset,       // ({x,y}) — called when empty room floor is clicked
  className,
}, ref) {
  const mountRef = useRef(null)
  const stateRef = useRef({})
  // Tracks which building/floor/room is actually "in view" so the content
  // effect below can tell a genuine drill-in/out from an incidental
  // re-render (a query refetch, a hover, a parent state tick) and only
  // reframe the camera for the former — otherwise every unrelated re-render
  // snapped the camera back to the default framing mid-drag, which is what
  // made the scene feel locked in place instead of freely orbitable.
  const subjectRef = useRef(null)

  // On-screen nav buttons for touch devices, where dragging to orbit is
  // awkward — rotate/tilt/zoom by nudging the camera's spherical position
  // around whatever OrbitControls' current target is, same math OrbitControls
  // itself does internally, then letting it re-derive its own state on the
  // next controls.update() rather than fighting it for ownership of the angle.
  useImperativeHandle(ref, () => ({
    rotate: (deltaDeg) => {
      const { camera, controls } = stateRef.current
      if (!camera || !controls) return
      const offset = camera.position.clone().sub(controls.target)
      const angle = (deltaDeg * Math.PI) / 180
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      const x = offset.x * cos - offset.z * sin
      const z = offset.x * sin + offset.z * cos
      camera.position.set(controls.target.x + x, camera.position.y, controls.target.z + z)
      controls.update()
    },
    tilt: (deltaDeg) => {
      const { camera, controls } = stateRef.current
      if (!camera || !controls) return
      const offset = camera.position.clone().sub(controls.target)
      const radius = offset.length()
      const currentPolar = Math.acos(Math.min(1, Math.max(-1, offset.y / radius)))
      const nextPolar = Math.min(
        controls.maxPolarAngle ?? Math.PI * 0.49,
        Math.max(0.15, currentPolar - (deltaDeg * Math.PI) / 180),
      )
      const azimuth = Math.atan2(offset.x, offset.z)
      const horizontal = radius * Math.sin(nextPolar)
      camera.position.set(
        controls.target.x + horizontal * Math.sin(azimuth),
        controls.target.y + radius * Math.cos(nextPolar),
        controls.target.z + horizontal * Math.cos(azimuth),
      )
      controls.update()
    },
    zoom: (factor) => {
      const { camera, controls } = stateRef.current
      if (!camera || !controls) return
      const offset = camera.position.clone().sub(controls.target)
      const minD = controls.minDistance ?? 1
      const maxD = controls.maxDistance ?? Infinity
      const nextLen = Math.min(maxD, Math.max(minD, offset.length() * factor))
      offset.setLength(nextLen)
      camera.position.copy(controls.target).add(offset)
      controls.update()
    },
    resetView: () => {
      const { camera, controls, defaultFraming } = stateRef.current
      if (!camera || !controls || !defaultFraming) return
      camera.position.copy(defaultFraming.position)
      controls.target.copy(defaultFraming.target)
      controls.update()
    },
  }), [])

  // ---- one-time setup: renderer, camera, controls, resize/click wiring ----
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = null

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.maxPolarAngle = Math.PI * 0.49
    controls.minDistance = 3
    controls.maxDistance = 90

    scene.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 1.15))
    const sun = new THREE.DirectionalLight(0xffffff, 0.9)
    sun.position.set(30, 45, 20)
    scene.add(sun)

    const content = new THREE.Group()
    scene.add(content)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let hoverTarget = null

    const resize = () => {
      const w = mount.clientWidth || 1
      const h = mount.clientHeight || 1
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(mount)
    resize()

    const pick = (e, list) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      return raycaster.intersectObjects(list, true)
    }

    const onMove2 = (e) => {
      const hits = pick(e, content.children)
      const hit = hits.find((h) => h.object.userData?.kind)
      if (hoverTarget && hoverTarget !== hit?.object) {
        hoverTarget.userData.setHover?.(false)
        hoverTarget = null
      }
      if (hit?.object.userData?.setHover) {
        hit.object.userData.setHover(true)
        hoverTarget = hit.object
      }
      renderer.domElement.style.cursor = hit?.object.userData?.cursor || 'grab'
    }
    const onClick = (e) => {
      const hits = pick(e, content.children)
      const first = hits.find((h) => h.object.userData?.onClick)
      first?.object.userData.onClick(first)
    }

    renderer.domElement.addEventListener('pointermove', onMove2)
    renderer.domElement.addEventListener('click', onClick)

    const clock = new THREE.Clock()
    let raf
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const t = clock.getElapsedTime()
      content.children.forEach((c) => c.userData?.tick?.(t))
      controls.update()
      renderer.render(scene, camera)
    }
    loop()

    stateRef.current = { scene, camera, renderer, controls, content }

    return () => {
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointermove', onMove2)
      renderer.domElement.removeEventListener('click', onClick)
      controls.dispose()
      disposeObject(scene)
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  // ---- rebuild the content group whenever the level or its data changes ----
  useEffect(() => {
    const st = stateRef.current
    if (!st.content) return
    const { content, camera, controls } = st

    while (content.children.length) {
      const child = content.children.pop()
      disposeObject(child)
    }

    // "Subject" = which building/floor/room is being looked at, not the
    // data behind it — a refetch that leaves the same room selected is not
    // a drill-in and must not touch the camera; picking a different
    // building/floor/room, or changing zoom level, is and should reframe.
    const subjectKey = `${view}|${selectedBuildingId || ''}|${selectedFloorId || ''}|${selectedRoomId || ''}`
    const subjectChanged = subjectRef.current !== subjectKey
    subjectRef.current = subjectKey

    // Applies a default framing (only when the subject actually changed,
    // same guard as before) and stashes it so the resetView() exposed via
    // ref can jump straight back to it later without recomputing anything.
    const frame = (px, py, pz, tx, ty, tz) => {
      if (!subjectChanged) return
      camera.position.set(px, py, pz)
      controls.target.set(tx, ty, tz)
      stateRef.current.defaultFraming = {
        position: new THREE.Vector3(px, py, pz),
        target: new THREE.Vector3(tx, ty, tz),
      }
    }

    const addClickable = (mesh, { onClick, cursor = 'pointer', hoverColor, baseScale = 1 } = {}) => {
      mesh.userData.kind = 'clickable'
      mesh.userData.cursor = cursor
      mesh.userData.onClick = onClick
      mesh.userData.setHover = (on) => {
        if (mesh.material?.emissive) {
          mesh.material.emissive.set(on ? (hoverColor || '#ffffff') : '#000000')
          mesh.material.emissiveIntensity = on ? 0.35 : 0
        }
        mesh.scale.setScalar(on ? baseScale * 1.04 : baseScale)
      }
      return mesh
    }

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(view === 'room' ? ROOM_WORLD * 0.9 : WORLD * 0.85, 48),
      new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 1 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.02
    ground.receiveShadow = false
    content.add(ground)

    const grid = new THREE.GridHelper(
      view === 'room' ? ROOM_WORLD : WORLD,
      view === 'room' ? 20 : 24, '#cbd5e1', '#dbe3ec',
    )
    grid.position.y = -0.01
    content.add(grid)

    // -------------------------------------------------------------- CAMPUS
    if (view === 'campus') {
      buildings.forEach((b) => {
        if (b.map_x == null || b.map_y == null) return
        const wx = (b.map_x - 0.5) * WORLD
        const wz = (b.map_y - 0.5) * WORLD
        const floors = Math.max(1, b.floors_count || 1)
        const h = Math.min(6, 0.9 + floors * 0.55)
        const footprint = BUILDING_UNIT * (0.7 + Math.min(1, (b.room_count || 1) / 12) * 0.5)

        const heat = heatByBuilding?.get(b.id)
        const statusColour = mode === 'heat' ? heatColour(heat?.intensity ?? 0) : (b.aggregate_colour || '#10b981')

        // Walls stay a neutral tone so the building reads as a building,
        // not a coloured block — condition/heat now lives on the roof cap
        // and base ring instead, still visible at a glance from orbit.
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(footprint, h, footprint),
          new THREE.MeshStandardMaterial({ color: '#e7e3d9', roughness: 0.65, metalness: 0.03 }),
        )
        box.position.set(wx, h / 2, wz)
        addClickable(box, {
          onClick: () => onSelectBuilding?.(b.id),
          hoverColor: '#3b82f6',
          baseScale: 1,
        })
        content.add(box)
        addBuildingWindows(content, { cx: wx, cz: wz, footprint, height: h, floors })

        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(footprint * 1.05, 0.14, footprint * 1.05),
          new THREE.MeshStandardMaterial({ color: statusColour, roughness: 0.4 }),
        )
        roof.position.set(wx, h + 0.07, wz)
        content.add(roof)

        const base = new THREE.Mesh(
          new THREE.BoxGeometry(footprint * 1.1, 0.12, footprint * 1.1),
          new THREE.MeshStandardMaterial({
            color: statusColour, roughness: 0.5, emissive: statusColour, emissiveIntensity: 0.15,
          }),
        )
        base.position.set(wx, 0.06, wz)
        content.add(base)

        if (b.id === selectedBuildingId) {
          const outline = new THREE.Mesh(
            new THREE.BoxGeometry(footprint * 1.08, h * 1.02, footprint * 1.08),
            new THREE.MeshBasicMaterial({ color: '#3b82f6', wireframe: true }),
          )
          outline.position.copy(box.position)
          content.add(outline)
        }

        const label = makeLabel(b.code)
        label.position.set(wx, h + 0.55, wz)
        content.add(label)

        if (b.open_issues > 0) {
          const badge = makeLabel(String(b.open_issues), { color: '#ffffff', bg: '#ef4444', fontSize: 34 })
          badge.position.set(wx + footprint * 0.32, h + 0.15, wz - footprint * 0.32)
          content.add(badge)
        }
      })

      if (autoCount > 0) {
        const note = makeLabel(
          autoCount === buildings.length
            ? 'Positions are approximate — set exact coordinates in Campus Management'
            : `${autoCount} building(s) at an approximate position`,
          { fontSize: 26, color: '#475569', bg: 'rgba(255,255,255,0.85)' },
        )
        note.position.set(0, 0.4, WORLD * 0.42)
        content.add(note)
      }

      frame(WORLD * 0.55, WORLD * 0.62, WORLD * 0.55, 0, 1.5, 0)
    }

    // ------------------------------------------------------------ BUILDING
    if (view === 'building') {
      const building = buildings.find((b) => b.id === selectedBuildingId)
      // campus_overview orders floors DESC (level 7, 6, 5, ... 1) for its own
      // reasons — fine for a list, wrong for Y position, where the ground
      // floor (lowest level) must get the smallest y. Sorting ascending
      // here, rather than relying on array order, is what actually pins
      // "Floor 1" to the bottom regardless of what order the API sends.
      const floors = [...(building?.floors || [])].sort(
        (a, b) => (a.level ?? 0) - (b.level ?? 0),
      )
      floors.forEach((f, i) => {
        const y = i * FLOOR_HEIGHT
        const size = FLOOR_UNIT * Math.max(2.4, Math.ceil(Math.sqrt(Math.max(1, f.rooms.length))))
        const worst = f.rooms.reduce((acc, r) => (r.open_issues > 0 ? acc + 1 : acc), 0)
        const slabColour = worst > 0 ? '#fde68a' : '#e2e8f0'

        const slab = new THREE.Mesh(
          new THREE.BoxGeometry(size, FLOOR_HEIGHT * 0.28, size),
          new THREE.MeshStandardMaterial({ color: slabColour, roughness: 0.8 }),
        )
        slab.position.set(0, y + FLOOR_HEIGHT * 0.14, 0)
        addClickable(slab, { onClick: () => onSelectFloor?.(f.id), hoverColor: '#3b82f6' })
        content.add(slab)

        // Small room-preview cubes on top of the slab, purely illustrative
        // at this zoomed-out level — clicking any of them still drills into
        // the floor, same as clicking the slab.
        const cells = gridCells(f.rooms.length)
        f.rooms.forEach((r, idx) => {
          const c = cells[idx]
          const cube = new THREE.Mesh(
            new THREE.BoxGeometry(size * c.cellW * 0.72, 0.22, size * c.cellH * 0.72),
            new THREE.MeshStandardMaterial({ color: r.colour, roughness: 0.5 }),
          )
          cube.position.set(
            (c.cx - 0.5) * size, y + FLOOR_HEIGHT * 0.28 + 0.12, (c.cy - 0.5) * size,
          )
          addClickable(cube, { onClick: () => onSelectFloor?.(f.id), hoverColor: '#3b82f6' })
          content.add(cube)
        })

        const label = makeLabel(f.name, { fontSize: 30 })
        label.position.set(-size / 2 - 0.9, y + 0.5, size / 2)
        content.add(label)

        if (f.id === selectedFloorId) {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(size * 0.72, size * 0.76, 32),
            new THREE.MeshBasicMaterial({ color: '#3b82f6', side: THREE.DoubleSide }),
          )
          ring.rotation.x = -Math.PI / 2
          ring.position.set(0, y + FLOOR_HEIGHT * 0.29, 0)
          content.add(ring)
        }
      })

      const topY = Math.max(0, floors.length - 1) * FLOOR_HEIGHT
      frame(WORLD * 0.28, topY + WORLD * 0.24, WORLD * 0.32, 0, topY / 2, 0)
    }

    // --------------------------------------------------------------- FLOOR
    if (view === 'floor') {
      const building = buildings.find((b) => b.id === selectedBuildingId)
      const floor = building?.floors?.find((f) => f.id === selectedFloorId)
      const rooms = floor?.rooms || []
      const cells = gridCells(rooms.length)

      rooms.forEach((r, idx) => {
        const c = cells[idx]
        const wx = (c.cx - 0.5) * ROOM_WORLD
        const wz = (c.cy - 0.5) * ROOM_WORLD
        const w = ROOM_WORLD * c.cellW * 0.88
        const d = ROOM_WORLD * c.cellH * 0.88

        const box = new THREE.Mesh(
          new THREE.BoxGeometry(w, 0.5, d),
          new THREE.MeshStandardMaterial({ color: r.colour, roughness: 0.55 }),
        )
        box.position.set(wx, 0.25, wz)
        addClickable(box, { onClick: () => onSelectRoom?.(r.id), hoverColor: '#3b82f6' })
        content.add(box)

        // Kind accent — a small coloured tab in the corner, so a lab reads as
        // a lab even before the label is legible.
        const accent = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.16, 0.62, d * 0.16),
          new THREE.MeshStandardMaterial({ color: KIND_ACCENT[r.kind] || '#94a3b8' }),
        )
        accent.position.set(wx - w * 0.38, 0.31, wz - d * 0.38)
        content.add(accent)

        if (r.open_issues > 0) {
          const badge = makeLabel(String(r.open_issues), { color: '#fff', bg: '#ef4444', fontSize: 28 })
          badge.position.set(wx + w * 0.36, 0.95, wz - d * 0.36)
          content.add(badge)
        }

        const label = makeLabel(`${r.code}`, { fontSize: 26 })
        label.position.set(wx, 0.85, wz + d * 0.15)
        content.add(label)

        if (r.id === selectedRoomId) {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(Math.max(w, d) * 0.58, Math.max(w, d) * 0.62, 32),
            new THREE.MeshBasicMaterial({ color: '#3b82f6', side: THREE.DoubleSide }),
          )
          ring.rotation.x = -Math.PI / 2
          ring.position.set(wx, 0.52, wz)
          content.add(ring)
        }
      })

      frame(0, ROOM_WORLD * 0.62, ROOM_WORLD * 0.62, 0, 0, 0)
    }

    // ---------------------------------------------------------------- ROOM
    if (view === 'room') {
      const floorMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(ROOM_WORLD * 0.72, ROOM_WORLD * 0.72),
        new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.9 }),
      )
      floorMesh.rotation.x = -Math.PI / 2
      floorMesh.userData.kind = 'clickable'
      floorMesh.userData.cursor = 'crosshair'
      floorMesh.userData.onClick = (hit) => {
        const half = ROOM_WORLD * 0.36
        const x = (hit.point.x + half) / (half * 2)
        const y = (hit.point.z + half) / (half * 2)
        onPlaceAsset?.({ x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) })
      }
      content.add(floorMesh)
      addRoomWalls(content, ROOM_WORLD * 0.36)

      const half = ROOM_WORLD * 0.36
      ;(roomAssets || []).forEach((a) => {
        if (a.pos_x == null || a.pos_y == null) return
        const wx = a.pos_x * half * 2 - half
        const wz = a.pos_y * half * 2 - half
        const marker = new THREE.Mesh(
          new THREE.CylinderGeometry(0.42, 0.42, 0.5, 20),
          new THREE.MeshStandardMaterial({ color: a.colour || '#10b981', roughness: 0.4 }),
        )
        marker.position.set(wx, 0.26, wz)
        addClickable(marker, {
          onClick: () => onSelectAsset?.(a),
          hoverColor: '#3b82f6',
        })
        content.add(marker)

        if (a.open_issue_count > 0) {
          const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.14, 12, 12),
            new THREE.MeshStandardMaterial({ color: '#ef4444' }),
          )
          dot.position.set(wx + 0.32, 0.6, wz - 0.32)
          content.add(dot)
        }

        const label = makeLabel(a.tag, { fontSize: 22 })
        label.position.set(wx, 0.85, wz)
        content.add(label)
      })

      if (pendingPlacement) {
        const wx = pendingPlacement.x * half * 2 - half
        const wz = pendingPlacement.y * half * 2 - half
        const ghost = new THREE.Mesh(
          new THREE.CylinderGeometry(0.42, 0.42, 0.5, 20),
          new THREE.MeshStandardMaterial({ color: '#3b82f6', transparent: true, opacity: 0.55 }),
        )
        ghost.position.set(wx, 0.26, wz)
        ghost.userData.tick = (t) => { ghost.position.y = 0.26 + Math.sin(t * 4) * 0.08 }
        content.add(ghost)
      }

      frame(0, ROOM_WORLD * 0.45, ROOM_WORLD * 0.45, 0, 0, 0)
    }

    controls.update()
  }, [
    view, buildings, autoCount, mode, heatByBuilding, heatColour,
    selectedBuildingId, selectedFloorId, selectedRoomId, roomAssets, pendingPlacement,
    onSelectBuilding, onSelectFloor, onSelectRoom, onSelectAsset, onPlaceAsset,
  ])

  return <div ref={mountRef} className={className} />
})
