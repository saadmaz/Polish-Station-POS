// A small, deliberately incomplete lookup of common vehicles seen in this
// market, keyed by normalized "make model". A starting point for
// pre-selecting sizeClass so a human isn't guessing from scratch every
// time — the field stays required and always overridable, this just cuts
// down how often "other" is the only option on offer.
import type { SizeClass } from "./vehicle";

const KNOWN_MODELS: Record<string, SizeClass> = {
  // Hatchbacks
  "toyota aqua": "hatchback",
  "toyota vitz": "hatchback",
  "toyota yaris": "hatchback",
  "toyota prius": "hatchback",
  "toyota passo": "hatchback",
  "toyota ist": "hatchback",
  "honda fit": "hatchback",
  "honda jazz": "hatchback",
  "honda insight": "hatchback",
  "suzuki alto": "hatchback",
  "suzuki swift": "hatchback",
  "suzuki wagon r": "hatchback",
  "suzuki celerio": "hatchback",
  "nissan march": "hatchback",
  "nissan note": "hatchback",
  "nissan leaf": "hatchback",
  "mazda demio": "hatchback",
  "mazda 2": "hatchback",
  "perodua axia": "hatchback",
  "perodua myvi": "hatchback",

  // Sedans
  "toyota corolla": "sedan",
  "toyota premio": "sedan",
  "toyota allion": "sedan",
  "toyota axio": "sedan",
  "toyota camry": "sedan",
  "honda civic": "sedan",
  "honda city": "sedan",
  "honda grace": "sedan",
  "nissan sunny": "sedan",
  "nissan sentra": "sedan",
  "suzuki ciaz": "sedan",
  "bmw 320i": "sedan",
  "bmw 316i": "sedan",
  "mercedes-benz c-class": "sedan",
  "mercedes-benz e-class": "sedan",

  // SUVs
  "toyota rav4": "suv",
  "toyota land cruiser": "suv",
  "toyota harrier": "suv",
  "honda vezel": "suv",
  "honda cr-v": "suv",
  "honda hr-v": "suv",
  "nissan x-trail": "suv",
  "nissan qashqai": "suv",
  "mazda cx-5": "suv",
  "mazda cx-3": "suv",
  "suzuki grand vitara": "suv",
  "suzuki jimny": "suv",
  "bmw x5": "suv",
  "bmw x3": "suv",
  "mitsubishi outlander": "suv",
  "mitsubishi montero": "suv",

  // Vans (KDH is the common local name for the Toyota Hiace in Sri Lanka)
  "toyota hiace": "van",
  "toyota kdh": "van",
  "toyota dolphin": "van",
  "toyota noah": "van",
  "toyota voxy": "van",
  "nissan caravan": "van",
  "nissan vanette": "van",
  "suzuki every": "van",

  // Cabs / pickups
  "toyota hilux": "cab",
  "isuzu d-max": "cab",
  "mitsubishi l200": "cab",
  "mahindra bolero": "cab",
  "ford ranger": "cab",

  // Motorcycles
  "honda dio": "motorcycle",
  "honda cb": "motorcycle",
  "yamaha fz": "motorcycle",
  "bajaj pulsar": "motorcycle",
  "tvs apache": "motorcycle",
};

/**
 * Looks up a known make+model, returning null (not a guessed fallback) when
 * there's no match — callers decide what to do with "no match" (e.g. the
 * migration falls back to "other" + a review flag; a create-vehicle form
 * would just leave the field for the person filling it in to pick).
 */
export function deriveSizeClass(make: string, model: string): SizeClass | null {
  const key = `${make} ${model}`.toLowerCase().trim();
  return KNOWN_MODELS[key] ?? null;
}
