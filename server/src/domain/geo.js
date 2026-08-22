const R = 6371 // km

const toRad = (deg) => (deg * Math.PI) / 180

// Great-circle distance. Good enough for "which shop is nearest" at district scale.
export function distanceKm(a, b) {
  if (!a || !b || ![a.lat, a.lng, b.lat, b.lng].every(Number.isFinite)) return null
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10
}

export const parseCoords = (query) => {
  const lat = Number(query?.lat)
  const lng = Number(query?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

// We have no reverse-geocoding service, so a position is resolved against our
// own registers: the nearest shop tells us the mandal and district.
export function locateAgainst(shops, coords) {
  if (!coords || shops.length === 0) return null
  const ranked = shops
    .map((s) => ({ shop: s, km: distanceKm(coords, s) }))
    .filter((r) => r.km !== null)
    .sort((a, b) => a.km - b.km)
  if (ranked.length === 0) return null
  const nearest = ranked[0]
  return {
    district: nearest.shop.district,
    mandal: nearest.shop.mandal,
    nearestShop: nearest.shop.code,
    distanceKm: nearest.km,
  }
}
