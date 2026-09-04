import { Suspense, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Image } from '@react-three/drei'
import { fitWithin, useImageAspects } from '../../lib/useImageAspects'

/* The WebGL version of the product wall.

   Kept intentionally cheap: unlit materials (product photography carries its own
   lighting), no shadow maps, no postprocessing, capped device pixel ratio. Those
   are the three things that turn a smooth scene into a stuttering one while a
   screen recorder competes for the same GPU, and none would make this look
   meaningfully better.

   Everything about the layout is derived from the camera's visible area at
   runtime rather than written down in world units. Fixed units were the cause of
   two visible bugs at once: on a wide screen the cards drifted into a small
   cluster with empty margins either side, and because their size did not shrink
   with the gaps, each card covered about forty per cent of its neighbour. */

/* Relative placement only — x is a fraction of the span, y a fraction of the
   drift, z a depth weight. Actual sizes come from the viewport. */
const SLOTS = [
  { x: 0.0, y: 0.5, r: -6, z: -0.8, s: 0.88 },
  { x: 0.167, y: -0.42, r: -3, z: 0.25, s: 0.97 },
  { x: 0.333, y: 0.44, r: 3, z: -0.35, s: 0.92 },
  { x: 0.5, y: -0.5, r: -2, z: 0.5, s: 1 },
  { x: 0.667, y: 0.46, r: 5, z: -0.55, s: 0.9 },
  { x: 0.833, y: -0.38, r: 3, z: 0.1, s: 0.96 },
  { x: 1.0, y: 0.42, r: -4, z: -0.95, s: 0.86 },
]

const FOV = 40

/* How much of the frame the wall occupies, and how much a card may overlap the
   gap it was given. 1.0 would leave cards exactly touching; a little over that
   reads as depth without hiding what is behind. */
const WIDTH_USE = 0.9
const HEIGHT_USE = 0.62
const OVERLAP = 1.1
const DEPTH = 0.55

function Card({ product, slot, index, aspect, layout, onPick }) {
  const ref = useRef()
  const [hovered, setHovered] = useState(false)

  const size = useMemo(
    () => fitWithin(aspect, layout.boxW, layout.boxH),
    [aspect, layout.boxW, layout.boxH],
  )

  const pos = useMemo(
    () => ({
      x: (slot.x - 0.5) * layout.spanX,
      y: slot.y * layout.spanY,
      z: slot.z * DEPTH,
    }),
    [slot, layout.spanX, layout.spanY],
  )

  /* Per-card phase offset so they drift independently — seven cards bobbing in
     unison reads as one object breathing, not seven things floating. */
  const phase = useMemo(() => index * 1.7, [index])

  /* Hover scale is eased here rather than set directly so it grows into place
     instead of snapping — there is no CSS transition to lean on in a canvas. */
  useFrame(({ clock }) => {
    if (!ref.current) return
    ref.current.position.y = pos.y + Math.sin(clock.elapsedTime * 0.55 + phase) * 0.05

    const target = slot.s * (hovered ? 1.07 : 1)
    ref.current.scale.x += (target - ref.current.scale.x) * 0.12
    ref.current.scale.y = ref.current.scale.x
    ref.current.scale.z = ref.current.scale.x
  })

  return (
    <group
      ref={ref}
      position={[pos.x, pos.y, pos.z]}
      rotation={[0, (slot.x - 0.5) * -0.16, (slot.r * Math.PI) / 180]}
      scale={slot.s}
      onClick={(e) => {
        e.stopPropagation()
        onPick(product)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        document.body.style.cursor = ''
      }}
    >
      <Image url={product.image_url} scale={size} radius={0.08} toneMapped={false} transparent />
    </group>
  )
}

function Wall({ products, aspects, onPick }) {
  const group = useRef()
  const { viewport } = useThree()

  /* Recomputed whenever the frame changes shape, so the wall fills whatever it
     is given instead of sitting in the middle of it. */
  const layout = useMemo(() => {
    const count = Math.max(products.length, 2)
    const spanX = viewport.width * WIDTH_USE
    const spacing = spanX / (count - 1)
    return {
      spanX,
      spanY: viewport.height * 0.2,
      boxW: spacing * OVERLAP,
      boxH: viewport.height * HEIGHT_USE,
    }
  }, [viewport.width, viewport.height, products.length])

  /* Mirrors the CSS version's pointer tilt. Rotating the group rather than
     moving the camera avoids the lookAt jitter you get when both change. */
  useFrame(({ pointer }) => {
    if (!group.current) return
    group.current.rotation.y += (pointer.x * 0.15 - group.current.rotation.y) * 0.045
    group.current.rotation.x += (-pointer.y * 0.09 - group.current.rotation.x) * 0.045
  })

  return (
    <group ref={group}>
      {products.map((product, i) => (
        <Card
          key={product.id}
          product={product}
          slot={SLOTS[i]}
          index={i}
          aspect={aspects[product.id]}
          layout={layout}
          onPick={onPick}
        />
      ))}
    </group>
  )
}

export default function ProductWall3D({ products, onPick }) {
  const aspects = useImageAspects(products)

  if (!products || products.length === 0) return null

  return (
    <div className="wall wall--3d">
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0, 6], fov: FOV }}
        performance={{ min: 0.5 }}
      >
        {/* Textures suspend while they download. A null fallback means the canvas
            stays empty for a beat rather than flashing a placeholder. */}
        <Suspense fallback={null}>
          <Wall products={products.slice(0, SLOTS.length)} aspects={aspects} onPick={onPick} />
        </Suspense>
      </Canvas>
    </div>
  )
}
