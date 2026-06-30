import path from 'path'
import fs from 'fs'
import { app } from 'electron'

export interface Profile {
  id: string
  name: string
}

interface ProfilesStore {
  active: string
  profiles: Profile[]
}

function getStoreFile(): string {
  return path.join(app.getPath('userData'), 'profiles.json')
}

function loadStore(): ProfilesStore {
  const file = getStoreFile()
  if (!fs.existsSync(file)) {
    return { active: 'default', profiles: [{ id: 'default', name: 'Personnel' }] }
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as ProfilesStore
  } catch {
    return { active: 'default', profiles: [{ id: 'default', name: 'Personnel' }] }
  }
}

function saveStore(store: ProfilesStore): void {
  fs.writeFileSync(getStoreFile(), JSON.stringify(store, null, 2), 'utf8')
}

export function getDbPathForId(id: string): string {
  if (id === 'default') return path.join(app.getPath('userData'), 'banquier.db')
  return path.join(app.getPath('userData'), `profile_${id}.db`)
}

export function getActiveDbPath(): string {
  return getDbPathForId(loadStore().active)
}

export function getProfiles(): { active: string; profiles: Profile[] } {
  return loadStore()
}

export function createProfile(name: string): { active: string; profiles: Profile[] } {
  const store = loadStore()
  const id = Date.now().toString(36)
  store.profiles.push({ id, name })
  saveStore(store)
  return store
}

export function renameProfile(id: string, name: string): { active: string; profiles: Profile[] } {
  const store = loadStore()
  const profile = store.profiles.find((p) => p.id === id)
  if (profile) profile.name = name
  saveStore(store)
  return store
}

export function switchProfile(id: string): string {
  const store = loadStore()
  if (!store.profiles.find((p) => p.id === id)) throw new Error('Profil introuvable')
  store.active = id
  saveStore(store)
  return getDbPathForId(id)
}

export function deleteProfile(id: string): { active: string; profiles: Profile[] } {
  if (id === 'default') throw new Error('Impossible de supprimer le profil principal')
  const store = loadStore()
  store.profiles = store.profiles.filter((p) => p.id !== id)
  if (store.active === id) store.active = 'default'
  saveStore(store)
  return store
}
