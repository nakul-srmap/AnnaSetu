// Reorder levels lived in the dealer's screen, which meant the shop and the
// district could disagree about what "running low" meant. They live here now,
// as a policy knob, and both portals read the same number.
export const REORDER = {
  rice: Number(process.env.REORDER_RICE ?? 500),
  wheat: Number(process.env.REORDER_WHEAT ?? 200),
  sugar: Number(process.env.REORDER_SUGAR ?? 120),
}

export const COMMODITIES = Object.keys(REORDER)

export const isLow = (shop, commodity) =>
  (shop.stock?.[commodity] ?? 0) < (REORDER[commodity] ?? 0)

// What to ask for: enough to return to the opening receipt, rounded to a
// round number of kilos so the godown is not issuing odd quantities.
export function suggestedIndent(shop, commodity) {
  const onHand = shop.stock?.[commodity] ?? 0
  const target = shop.opening?.[commodity] ?? 0
  const gap = Math.max(0, target - onHand)
  return Math.max(50, Math.round(gap / 10) * 10)
}

// The stock line as both portals should see it.
export function stockLines(shop) {
  return COMMODITIES.filter((c) => c in (shop.opening ?? {})).map((commodity) => ({
    commodity,
    onHand: shop.stock?.[commodity] ?? 0,
    opening: shop.opening?.[commodity] ?? 0,
    reorder: REORDER[commodity],
    low: isLow(shop, commodity),
    suggested: suggestedIndent(shop, commodity),
  }))
}
