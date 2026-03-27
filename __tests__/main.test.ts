/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * To mock dependencies in ESM, you can create fixtures that export mock
 * functions and objects. For example, the core module is mocked in this test,
 * so that the actual '@actions/core' module is not imported.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core'

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('../src/ssm-helper', () => {
  return {
    getParameters: jest.fn()
  }
})
// The module being tested should be imported dynamically. This ensures that the
// mocks are used in place of any actual dependencies.
const { run_action } = await import('../src/main')
const { getParameters } = await import('../src/ssm-helper')

const mockGetParameters = jest.mocked(getParameters)

const setInputs = (inputs: Record<string, string>) => {
  core.getInput.mockImplementation((name: string) => {
    return inputs[name] ?? ''
  })
}

describe('main.ts', () => {
  const originalAwsDefaultRegion = process.env.AWS_DEFAULT_REGION

  beforeEach(() => {
    delete process.env.AWS_DEFAULT_REGION
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  afterAll(() => {
    if (originalAwsDefaultRegion === undefined) {
      delete process.env.AWS_DEFAULT_REGION
    } else {
      process.env.AWS_DEFAULT_REGION = originalAwsDefaultRegion
    }
  })

  it('exports plain parameter values using prefix', async () => {
    process.env.AWS_DEFAULT_REGION = 'us-east-1'
    setInputs({
      'ssm-path': '/app/DB_URL',
      'get-children': 'false',
      prefix: 'APP_',
      decryption: 'false',
      'mask-values': 'false'
    })
    mockGetParameters.mockResolvedValue([
      { Name: '/app/DB_URL', Value: 'postgres://localhost/db' }
    ])

    await run_action()

    expect(mockGetParameters).toHaveBeenCalledWith({
      ssmPath: '/app/DB_URL',
      getChildren: false,
      decryption: false,
      region: 'us-east-1'
    })
    expect(core.exportVariable).toHaveBeenCalledWith(
      'APP_DB_URL',
      'postgres://localhost/db'
    )
    expect(core.setSecret).not.toHaveBeenCalled()
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('uses only the last path segment and sanitizes it when prefix is provided', async () => {
    process.env.AWS_DEFAULT_REGION = 'us-east-1'
    setInputs({
      'ssm-path': '/app/config/database-url',
      'get-children': 'false',
      prefix: 'APP_',
      decryption: 'false',
      'mask-values': 'false'
    })
    mockGetParameters.mockResolvedValue([
      { Name: '/app/config/database-url', Value: 'postgres://localhost/db' }
    ])

    await run_action()

    expect(core.exportVariable).toHaveBeenCalledWith(
      'APP_DATABASE_URL',
      'postgres://localhost/db'
    )
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('uses only the last path segment and sanitizes it when no prefix is provided', async () => {
    process.env.AWS_DEFAULT_REGION = 'us-east-1'
    setInputs({
      'ssm-path': '/app/config/service.primary-url',
      'get-children': 'false',
      prefix: '',
      decryption: 'false',
      'mask-values': 'false'
    })
    mockGetParameters.mockResolvedValue([
      {
        Name: '/app/config/service.primary-url',
        Value: 'https://example.com'
      }
    ])

    await run_action()

    expect(core.exportVariable).toHaveBeenCalledWith(
      'SERVICE_PRIMARY_URL',
      'https://example.com'
    )
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('exports JSON object keys and masks values when enabled', async () => {
    process.env.AWS_DEFAULT_REGION = 'us-east-1'
    setInputs({
      'ssm-path': '/app/json',
      'get-children': 'false',
      prefix: 'APP_',
      decryption: 'true',
      'mask-values': 'true'
    })
    mockGetParameters.mockResolvedValue([
      { Name: '/app/json', Value: '{"USER":"alice","PASS":"secret"}' }
    ])

    await run_action()

    expect(core.exportVariable).toHaveBeenCalledWith('APP_USER', 'alice')
    expect(core.exportVariable).toHaveBeenCalledWith('APP_PASS', 'secret')
    expect(core.setSecret).toHaveBeenCalledWith('alice')
    expect(core.setSecret).toHaveBeenCalledWith('secret')
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('sanitizes JSON object keys before exporting env vars', async () => {
    process.env.AWS_DEFAULT_REGION = 'us-east-1'
    setInputs({
      'ssm-path': '/app/json',
      'get-children': 'false',
      prefix: 'APP_',
      decryption: 'false',
      'mask-values': 'false'
    })
    mockGetParameters.mockResolvedValue([
      {
        Name: '/app/json',
        Value: '{"/service/test-parameter":"value"}'
      }
    ])

    await run_action()

    expect(core.exportVariable).toHaveBeenCalledWith(
      'APP__SERVICE_TEST_PARAMETER',
      'value'
    )
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('uses AWS_DEFAULT_REGION when provided', async () => {
    process.env.AWS_DEFAULT_REGION = 'us-west-2'
    setInputs({
      'ssm-path': '/app/DB_URL',
      'get-children': 'false',
      prefix: '',
      decryption: 'false',
      'mask-values': 'false'
    })
    mockGetParameters.mockResolvedValue([
      { Name: '/app/DB_URL', Value: 'postgres://localhost/db' }
    ])

    await run_action()

    expect(mockGetParameters).toHaveBeenCalledWith(
      expect.objectContaining({ region: 'us-west-2' })
    )
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('sets failed status when AWS_DEFAULT_REGION is not set', async () => {
    setInputs({
      'ssm-path': '/app/DB_URL',
      'get-children': 'false',
      prefix: '',
      decryption: 'false',
      'mask-values': 'false'
    })

    await run_action()

    expect(core.setFailed).toHaveBeenCalledWith(
      'AWS region must be specified via AWS_DEFAULT_REGION environment variable'
    )
    expect(mockGetParameters).not.toHaveBeenCalled()
  })

  it('sets failed status when parameter retrieval throws', async () => {
    process.env.AWS_DEFAULT_REGION = 'us-east-1'
    setInputs({
      'ssm-path': '/app/DB_URL',
      'get-children': 'false',
      prefix: '',
      decryption: 'false',
      'mask-values': 'false'
    })
    mockGetParameters.mockRejectedValue(new Error('SSM unavailable'))

    await run_action()

    expect(core.setFailed).toHaveBeenCalledWith('SSM unavailable')
  })

  it('sets failed status with a generic message for non-Error throw values', async () => {
    process.env.AWS_DEFAULT_REGION = 'us-east-1'
    setInputs({
      'ssm-path': '/app/DB_URL',
      'get-children': 'false',
      prefix: '',
      decryption: 'false',
      'mask-values': 'false'
    })
    mockGetParameters.mockRejectedValue({ reason: 'timeout' })

    await run_action()

    expect(core.setFailed).toHaveBeenCalledWith(
      'An unknown error occurred: {"reason":"timeout"}'
    )
  })

  it('skips exporting parameters that have no value', async () => {
    process.env.AWS_DEFAULT_REGION = 'us-east-1'
    setInputs({
      'ssm-path': '/app/EMPTY',
      'get-children': 'false',
      prefix: 'APP_',
      decryption: 'false',
      'mask-values': 'false'
    })
    mockGetParameters.mockResolvedValue([{ Name: '/app/EMPTY' }])

    await run_action()

    expect(core.debug).toHaveBeenCalledWith(
      'Parameter /app/EMPTY has no value, skipping...'
    )
    expect(core.exportVariable).not.toHaveBeenCalled()
  })

  it('skips exporting literal values when env var name cannot be derived', async () => {
    process.env.AWS_DEFAULT_REGION = 'us-east-1'
    setInputs({
      'ssm-path': '/app/unnamed',
      'get-children': 'false',
      prefix: '',
      decryption: 'false',
      'mask-values': 'false'
    })
    mockGetParameters.mockResolvedValue([{ Value: 'plain-text' }])

    await run_action()

    expect(core.debug).toHaveBeenCalledWith(
      'Could not derive env var name from parameter name undefined, skipping...'
    )
    expect(core.exportVariable).not.toHaveBeenCalled()
  })
})
