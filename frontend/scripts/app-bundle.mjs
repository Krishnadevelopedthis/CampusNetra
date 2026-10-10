// Packages the web build as an over-the-air update for the Android app.
//
// Runs after `vite build` + prerender (see the "build" script). Writes:
//   dist/app-updates/<version>.zip   the app's files, with the SPA shell as index.html
//   dist/app-update.json             { version, url, checksum } -- read by src/lib/appUpdater.js
//
// The app downloads the zip in the background and switches to it on its next start.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { zipSync } from 'fflate'

const SITE = 'https://campusnetra.dpdns.org'
const dist = join(process.cwd(), 'dist')
const shell = join(dist, 'app.html')
if (!existsSync(shell)) {
  console.error('app-bundle: dist/app.html not found; run the prerender step first')
  process.exit(1)
}

// Only what the app needs: the shell, the built assets and the images it loads.
const INCLUDE_DIRS = ['static', 'img', 'assets']
const INCLUDE_FILES = ['logo-dark.svg', 'logo-light.svg', 'logo-placeholder.svg', 'offline.html']

const files = { 'index.html': readFileSync(shell) }
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full)
    else files[relative(dist, full).split(sep).join('/')] = readFileSync(full)
  }
}
for (const d of INCLUDE_DIRS) if (existsSync(join(dist, d))) walk(join(dist, d))
for (const f of INCLUDE_FILES) if (existsSync(join(dist, f))) files[f] = readFileSync(join(dist, f))

// The version changes whenever any packaged file does.
const hash = createHash('sha256')
for (const name of Object.keys(files).sort()) hash.update(name).update(files[name])
const sha = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7)
const version = [sha, hash.digest('hex').slice(0, 10)].filter(Boolean).join('-')

const zip = zipSync(files, { level: 6 })
// The updater refuses a download without the zip's SHA-256 and checks it after.
const checksum = createHash('sha256').update(zip).digest('hex')
mkdirSync(join(dist, 'app-updates'), { recursive: true })
writeFileSync(join(dist, 'app-updates', `${version}.zip`), zip)
writeFileSync(join(dist, 'app-update.json'),
  JSON.stringify({ version, url: `${SITE}/app-updates/${version}.zip`, checksum }, null, 2))

console.log(`app-bundle: ${Object.keys(files).length} files, ${(zip.length / 1048576).toFixed(1)} MB, version ${version}`)
