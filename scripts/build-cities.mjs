// Builds lib/data/cities.json and lib/data/countries.json from the GeoNames
// cities15000 dump (all world cities with population >= 15,000), which also
// carries each city's IANA timezone. GeoNames data is CC-BY 4.0
// (https://www.geonames.org/) — attribution: "GeoNames.org".
//
// Usage: node scripts/build-cities.mjs

import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { pipeline } from "node:stream/promises"
import { execFileSync } from "node:child_process"
import { tmpdir } from "node:os"
import path from "node:path"

const CITIES_URL = "https://download.geonames.org/export/dump/cities15000.zip"
const COUNTRIES_URL = "https://download.geonames.org/export/dump/countryInfo.txt"

const outDir = path.join(process.cwd(), "lib", "data")
mkdirSync(outDir, { recursive: true })

async function download(url, dest) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`)
  await pipeline(res.body, createWriteStream(dest))
}

const zipPath = path.join(tmpdir(), "cities15000.zip")
const txtPath = path.join(tmpdir(), "cities15000.txt")
const countriesPath = path.join(tmpdir(), "countryInfo.txt")

console.log("Downloading cities15000.zip …")
await download(CITIES_URL, zipPath)
console.log("Downloading countryInfo.txt …")
await download(COUNTRIES_URL, countriesPath)

// Unzip (single entry: cities15000.txt). Use python for a dependency-free unzip on Windows.
execFileSync("python", [
  "-c",
  "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])",
  zipPath,
  tmpdir(),
])

// GeoNames columns: geonameid, name, asciiname, alternatenames, latitude,
// longitude, feature class, feature code, country code, cc2, admin1, admin2,
// admin3, admin4, population, elevation, dem, timezone, modification date
const lines = readFileSync(txtPath, "utf8").split("\n")
const cities = []
for (const line of lines) {
  if (!line.trim()) continue
  const f = line.split("\t")
  const name = f[2] // ASCII name: safe for search/display everywhere
  const country = f[8]
  const admin1 = f[10]
  const lat = Number(f[4])
  const lon = Number(f[5])
  const population = Number(f[14]) || 0
  const timezone = f[17]
  if (!name || !country || !timezone || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    continue
  }
  cities.push({
    n: name,
    c: country,
    a: admin1,
    la: Math.round(lat * 10000) / 10000,
    lo: Math.round(lon * 10000) / 10000,
    p: population,
    tz: timezone,
  })
}
cities.sort((a, b) => a.n.localeCompare(b.n))

const countries = {}
for (const line of readFileSync(countriesPath, "utf8").split("\n")) {
  if (!line.trim() || line.startsWith("#")) continue
  const f = line.split("\t")
  if (f[0] && f[4]) countries[f[0]] = f[4]
}

writeFileSync(path.join(outDir, "cities.json"), JSON.stringify(cities))
writeFileSync(path.join(outDir, "countries.json"), JSON.stringify(countries))

console.log(`Wrote ${cities.length} cities and ${Object.keys(countries).length} countries to lib/data/`)
