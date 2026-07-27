import { FilePicker } from '@capawesome/capacitor-file-picker'

interface CachedFile {
  name: string
  base64: string
}

const cache = new Map<string, CachedFile>()
let counter = 0

/** Mirrors window.api.openFileDialog's contract: returns an opaque "path" string
 *  that previewCsv/importCsv can later resolve back to file content. */
export async function openFileDialog(): Promise<string | null> {
  const result = await FilePicker.pickFiles({
    types: [
      'text/csv',
      'text/comma-separated-values',
      'text/plain',
      'application/vnd.ms-excel',
      'application/pdf'
    ],
    readData: true
  })
  const file = result.files[0]
  if (!file?.data) return null
  const handle = `mobile-file-${++counter}-${file.name}`
  cache.set(handle, { name: file.name, base64: file.data })
  return handle
}

export function getCachedFile(handle: string): CachedFile | undefined {
  return cache.get(handle)
}
