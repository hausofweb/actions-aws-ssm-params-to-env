// See: https://rollupjs.org/introduction/

import commonjs from '@rollup/plugin-commonjs'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'
import json from '@rollup/plugin-json'

type RollupWarning = {
  code?: string
  id?: string
  ids?: string[]
}

const isDependencyPath = (filePath: string) =>
  filePath.includes('/node_modules/')

const isThirdPartyThisWarning = (warning: RollupWarning) => {
  return (
    warning.code === 'THIS_IS_UNDEFINED' &&
    typeof warning.id === 'string' &&
    isDependencyPath(warning.id)
  )
}

const isThirdPartyCircularDependencyWarning = (warning: RollupWarning) => {
  return (
    warning.code === 'CIRCULAR_DEPENDENCY' &&
    Array.isArray(warning.ids) &&
    warning.ids.length > 0 &&
    warning.ids.every(isDependencyPath)
  )
}

export const shouldIgnoreRollupWarning = (warning: RollupWarning) => {
  return (
    isThirdPartyThisWarning(warning) ||
    isThirdPartyCircularDependencyWarning(warning)
  )
}

const config = {
  input: 'src/index.ts',
  output: {
    esModule: true,
    dir: 'dist',
    format: 'es',
    sourcemap: true
  },
  plugins: [
    typescript(),
    nodeResolve({ preferBuiltins: true }),
    commonjs(),
    json()
  ],
  onwarn(
    warning: RollupWarning,
    defaultHandler: (warning: RollupWarning) => void
  ) {
    if (shouldIgnoreRollupWarning(warning)) {
      return
    }

    defaultHandler(warning)
  }
}

export default config
