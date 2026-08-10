import os from 'os'

export const app = {
  getPath: (_name: string): string => os.tmpdir(),
  getVersion: (): string => '0.0.0-test'
}
