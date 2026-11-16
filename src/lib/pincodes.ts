// Pincode -> district -> state, from India Post's All India Pincode Directory.
// The table ships inside the app (src/data/pincodes.json, built by scripts/build-pincodes.py) and is loaded
// as its own chunk the first time the billing form needs it, so no API call is involved.

export interface PincodeData {
  states: string[]
  /** [district name, index into states] */
  districts: [string, number][]
  /** first three digits -> flat pairs of (last three digits, index into districts) */
  pins: Record<string, number[]>
}

let loading: Promise<PincodeData> | null = null

export function loadPincodes(): Promise<PincodeData> {
  loading ??= import('../data/pincodes.json').then((m) => m.default as unknown as PincodeData)
  return loading
}

/** The district and state a pincode belongs to, or null when the directory does not list it. */
export function lookupPincode(data: PincodeData, pincode: string): { city: string; state: string } | null {
  const pairs = data.pins[pincode.slice(0, 3)]
  if (!pairs) return null
  const rest = Number(pincode.slice(3))
  for (let i = 0; i < pairs.length; i += 2) {
    if (pairs[i] === rest) {
      const [city, stateIndex] = data.districts[pairs[i + 1]]
      return { city, state: data.states[stateIndex] }
    }
  }
  return null
}

export function districtsOf(data: PincodeData, state: string): string[] {
  const stateIndex = data.states.indexOf(state)
  if (stateIndex < 0) return []
  return data.districts.filter(([, s]) => s === stateIndex).map(([name]) => name)
}
