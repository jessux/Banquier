import { Preferences } from '@capacitor/preferences'
import type { Settings } from '../shared/types'

const KEY = 'banquier-settings'

const DEFAULT_SETTINGS: Settings = {
  openrouterApiKey: '',
  openrouterModel: '',
  currency: 'EUR',
  locale: 'fr-FR',
  onboardingDone: false,
  theme: 'dark'
}

export async function getSettings(): Promise<Settings> {
  const { value } = await Preferences.get({ key: KEY })
  if (!value) return { ...DEFAULT_SETTINGS }
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(value) as Partial<Settings>) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings()
  const next = { ...current, ...patch }
  await Preferences.set({ key: KEY, value: JSON.stringify(next) })
  return next
}
