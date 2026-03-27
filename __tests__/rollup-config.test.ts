import { jest } from '@jest/globals'
import config from '../rollup.config.ts'

describe('rollup.config.ts', () => {
  it('suppresses rewritten this warnings from node_modules', () => {
    expect(config.onwarn).toEqual(expect.any(Function))

    const defaultHandler = jest.fn()

    config.onwarn(
      {
        code: 'THIS_IS_UNDEFINED',
        id: '/workspace/node_modules/@actions/core/lib/core.js'
      },
      defaultHandler
    )

    expect(defaultHandler).not.toHaveBeenCalled()
  })

  it('suppresses circular dependency warnings from node_modules', () => {
    expect(config.onwarn).toEqual(expect.any(Function))

    const defaultHandler = jest.fn()

    config.onwarn(
      {
        code: 'CIRCULAR_DEPENDENCY',
        ids: [
          '/workspace/node_modules/pkg/a.js',
          '/workspace/node_modules/pkg/b.js'
        ]
      },
      defaultHandler
    )

    expect(defaultHandler).not.toHaveBeenCalled()
  })

  it('forwards warnings from repository files', () => {
    expect(config.onwarn).toEqual(expect.any(Function))

    const defaultHandler = jest.fn()
    const warning = {
      code: 'THIS_IS_UNDEFINED',
      id: '/workspace/src/main.ts',
      message: '"this" has been rewritten to "undefined"'
    }

    config.onwarn(warning, defaultHandler)

    expect(defaultHandler).toHaveBeenCalledWith(warning)
  })
})
