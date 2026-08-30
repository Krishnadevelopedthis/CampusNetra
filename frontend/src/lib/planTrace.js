/**
 * Turn a click on an uploaded floor plan into a room outline.
 *
 * An architectural plan already contains the room boundaries — they are the
 * walls. Asking somebody to click out sixty rooms corner by corner is asking
 * them to retrace a drawing the building already has, so instead a click
 * floods the enclosed area it lands in and traces the edge of what it filled.
 *
 * Everything here works on a downscaled copy of the image. Plans are often
 * several thousand pixels across and a flood fill at that size stalls the tab
 * for seconds, while wall detection needs nothing like that much detail.
 */

const MAX_SIDE = 1100

/** Load the plan and hand back its pixels, downscaled to something workable. */
export function loadPlanPixels(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.max(1, Math.round(img.naturalWidth * scale))
      const h = Math.max(1, Math.round(img.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      // Plans are usually line art on white. Painting white underneath keeps a
      // transparent PNG from reading as one enormous dark region.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      try {
        resolve(toGrey(ctx.getImageData(0, 0, w, h)))
      } catch (err) {
        // A cross-origin image without CORS headers taints the canvas.
        reject(err)
      }
    }
    img.onerror = () => reject(new Error('The plan image could not be loaded.'))
    img.src = url
  })
}

/** 8-bit luminance, plus the threshold that separates walls from open floor. */
function toGrey({ data, width, height }) {
  const grey = new Uint8Array(width * height)
  const histogram = new Uint32Array(256)
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    // Rec. 601 luma, integer-only.
    const v = (data[i] * 77 + data[i + 1] * 151 + data[i + 2] * 28) >> 8
    grey[p] = v
    histogram[v] += 1
  }
  const threshold = otsu(histogram, width * height)
  return { grey, width, height, threshold, openIsLight: lightIsMajority(histogram, threshold) }
}

/**
 * Which side of the threshold is open floor, decided by area.
 *
 * Reading the polarity off the clicked pixel instead looks tempting and is
 * wrong: a click that lands on a wall then declares the walls to be open and
 * traces the whole wall network as if it were one room. Floor outweighs ink on
 * any plan, so the majority side is the floor and a click on the other side is
 * a click on a wall — which is refused below rather than answered with a shape.
 */
function lightIsMajority(histogram, threshold) {
  let light = 0, dark = 0
  for (let i = 0; i < 256; i += 1) {
    if (i >= threshold) light += histogram[i]
    else dark += histogram[i]
  }
  return light >= dark
}

/**
 * Otsu's method: the cut that best separates the histogram into two groups.
 *
 * A fixed threshold fails on the two kinds of plan people actually upload — a
 * faint pencil scan and a dark CAD export sit on opposite sides of any constant
 * you pick. Otsu reads the split out of the image itself.
 */
function otsu(histogram, total) {
  let sum = 0
  for (let i = 0; i < 256; i += 1) sum += i * histogram[i]

  let sumB = 0, weightB = 0, best = 0, cut = 128
  for (let i = 0; i < 256; i += 1) {
    weightB += histogram[i]
    if (weightB === 0) continue
    const weightF = total - weightB
    if (weightF === 0) break
    sumB += i * histogram[i]
    const meanDiff = sumB / weightB - (sum - sumB) / weightF
    const variance = weightB * weightF * meanDiff * meanDiff
    if (variance > best) { best = variance; cut = i }
  }
  return cut
}

/**
 * Flood the region under (x, y) and return its outline in 0..1 plan coordinates.
 *
 * `x`/`y` arrive normalised so the caller does not have to know what the image
 * was downscaled to.
 *
 * Returns null when the fill escapes — which is what happens when the click
 * lands on a wall, in a corridor that runs the length of the plan, or outside
 * the building where there is nothing to contain it. Guessing in that case
 * produces a room shaped like the whole page, so it declines instead and the
 * caller falls back to drawing by hand.
 */
export function traceRoomAt(pixels, x, y, { maxAreaFraction = 0.85 } = {}) {
  const { grey, width, height, threshold } = pixels
  const sx = Math.min(width - 1, Math.max(0, Math.round(x * width)))
  const sy = Math.min(height - 1, Math.max(0, Math.round(y * height)))

  // Plans come both ways round — dark ink on white, and white lines on a dark
  // CAD export — so which side of the threshold counts as floor is measured,
  // not assumed. See lightIsMajority.
  const openIsLight = pixels.openIsLight ?? majorityFromGrey(grey, threshold)
  const isOpen = (p) => (openIsLight ? grey[p] >= threshold : grey[p] < threshold)

  // Plans label their rooms, and a click aimed at "OFFICE 104" lands on the
  // lettering rather than the floor. Rejecting that is technically right and
  // useless in practice, so the start point steps off any ink it landed on and
  // onto the nearest floor pixel. The radius is small enough that a genuine
  // click on a wall stays inside the wall and is still refused.
  const start = nearestOpen(sx, sy, width, height, isOpen)
  if (!start) return null
  const [fx, fy] = start

  const mask = new Uint8Array(width * height)
  const budget = Math.floor(width * height * maxAreaFraction)
  let filled = 0

  // Scanline fill. A per-pixel stack on a million-pixel image runs out of
  // memory long before it runs out of room to fill.
  const stack = [[fx, fy]]
  let minX = fx, maxX = fx, minY = fy, maxY = fy
  while (stack.length) {
    const [seedX, seedY] = stack.pop()
    const row = seedY * width
    if (mask[row + seedX]) continue

    let left = seedX
    while (left > 0 && !mask[row + left - 1] && isOpen(row + left - 1)) left -= 1
    let right = seedX
    while (right < width - 1 && !mask[row + right + 1] && isOpen(row + right + 1)) right += 1

    for (let px = left; px <= right; px += 1) mask[row + px] = 1
    filled += right - left + 1
    if (filled > budget) return null

    if (left < minX) minX = left
    if (right > maxX) maxX = right
    if (seedY < minY) minY = seedY
    if (seedY > maxY) maxY = seedY

    for (const ny of [seedY - 1, seedY + 1]) {
      if (ny < 0 || ny >= height) continue
      const nrow = ny * width
      let px = left
      while (px <= right) {
        while (px <= right && (mask[nrow + px] || !isOpen(nrow + px))) px += 1
        if (px > right) break
        const runStart = px
        while (px <= right && !mask[nrow + px] && isOpen(nrow + px)) px += 1
        stack.push([runStart + ((px - 1 - runStart) >> 1), ny])
      }
    }
  }

  // A handful of pixels is a speck of paper texture, not a room.
  if (filled < 200) return null

  const contour = traceContour(mask, width, height, minX, minY, maxX, maxY)
  if (!contour || contour.length < 8) return null

  const tolerance = Math.max(2, Math.min(width, height) * 0.006)
  let simplified = simplify(contour, tolerance)
  // Keep the payload sane on a plan traced at full detail.
  if (simplified.length > 60) simplified = simplify(contour, tolerance * 2.5)
  if (simplified.length < 3) return null

  return {
    boundary: simplified.map(([px, py]) => [
      round5(Math.min(1, Math.max(0, px / width))),
      round5(Math.min(1, Math.max(0, py / height))),
    ]),
    areaFraction: filled / (width * height),
  }
}

/**
 * Walk the outside edge of the filled mask (Moore neighbourhood tracing).
 *
 * Following the boundary keeps the room's real shape — an L-shaped lab stays
 * L-shaped, where taking the bounding box of the fill would quietly swallow
 * whatever sits in the notch.
 */
function traceContour(mask, width, height, minX, minY, maxX, maxY) {
  const at = (px, py) =>
    px >= 0 && py >= 0 && px < width && py < height && mask[py * width + px] === 1

  // Leftmost pixel of the topmost filled row: guaranteed to be on the outline.
  let startX = -1, startY = -1
  for (let py = minY; py <= maxY && startX < 0; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      if (at(px, py)) { startX = px; startY = py; break }
    }
  }
  if (startX < 0) return null

  const NEIGHBOURS = [
    [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
  ]
  const contour = [[startX, startY]]
  let cx = startX, cy = startY
  let dir = 6 // came from above
  const limit = (maxX - minX + maxY - minY + 4) * 8

  for (let step = 0; step < limit; step += 1) {
    let moved = false
    // Resume just behind the direction we arrived from, so the walk hugs the
    // edge rather than cutting back across the interior.
    for (let k = 0; k < 8; k += 1) {
      const d = (dir + 6 + k) % 8
      const nx = cx + NEIGHBOURS[d][0]
      const ny = cy + NEIGHBOURS[d][1]
      if (at(nx, ny)) {
        cx = nx; cy = ny; dir = d; moved = true
        contour.push([cx, cy])
        break
      }
    }
    if (!moved) break
    if (cx === startX && cy === startY) break
  }
  return contour
}

/** Ramer–Douglas–Peucker, iterative so a long contour cannot blow the stack. */
function simplify(points, tolerance) {
  if (points.length < 3) return points
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1

  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [first, last] = stack.pop()
    let worst = 0
    let index = -1
    for (let i = first + 1; i < last; i += 1) {
      const d = perpendicular(points[i], points[first], points[last])
      if (d > worst) { worst = d; index = i }
    }
    if (index >= 0 && worst > tolerance) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }
  return points.filter((_, i) => keep[i])
}

function perpendicular([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy)
  if (len === 0) return Math.hypot(px - ax, py - ay)
  return Math.abs(dy * px - dx * py + bx * ay - by * ax) / len
}

/**
 * The nearest floor pixel to the click, searched in growing rings.
 *
 * Capped at roughly the height of a label — beyond that the click was not a
 * near miss on a room, and widening the net would start answering clicks on
 * walls with whatever room happens to lie on one side of them.
 */
function nearestOpen(sx, sy, width, height, isOpen) {
  if (isOpen(sy * width + sx)) return [sx, sy]

  const limit = Math.max(12, Math.round(Math.min(width, height) * 0.035))
  for (let r = 1; r <= limit; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      const ny = sy + dy
      if (ny < 0 || ny >= height) continue
      // Only the ring's edge — the interior was covered by a smaller radius.
      const step = Math.abs(dy) === r ? 1 : 2 * r
      for (let dx = -r; dx <= r; dx += step) {
        const nx = sx + dx
        if (nx < 0 || nx >= width) continue
        if (isOpen(ny * width + nx)) return [nx, ny]
      }
    }
  }
  return null
}

function majorityFromGrey(grey, threshold) {
  let light = 0
  for (let i = 0; i < grey.length; i += 1) if (grey[i] >= threshold) light += 1
  return light * 2 >= grey.length
}

const round5 = (n) => Math.round(n * 1e5) / 1e5
