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
      {
        Name: '/app/json',
        Type: 'SecureString',
        Value: '{"USER":"alice","PASS":"secret"}'
      }
    ])

    await run_action()

    expect(core.exportVariable).toHaveBeenCalledWith('APP_USER', 'alice')
    expect(core.exportVariable).toHaveBeenCalledWith('APP_PASS', 'secret')
    expect(core.setSecret).toHaveBeenCalledWith('alice')
    expect(core.setSecret).toHaveBeenCalledWith('secret')
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('does not log literal parameter values in debug output', async () => {
    process.env.AWS_DEFAULT_REGION = 'us-east-1'
    setInputs({
      'ssm-path': '/app/DB_URL',
      'get-children': 'false',
      prefix: 'APP_',
      decryption: 'true',
      'mask-values': 'true'
    })
    const secretValue = 'postgres://prod-user:prod-pass@example.com/prod'
    mockGetParameters.mockResolvedValue([
      { Name: '/app/DB_URL', Type: 'SecureString', Value: secretValue }
    ])

    await run_action()

    expect(core.debug).not.toHaveBeenCalledWith(`parsedValue: ${secretValue}`)
    expect(core.debug).not.toHaveBeenCalledWith(
      expect.stringContaining(secretValue)
    )
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('does not log JSON parameter values in debug output', async () => {
    process.env.AWS_DEFAULT_REGION = 'us-east-1'
    setInputs({
      'ssm-path': '/app/json',
      'get-children': 'false',
      prefix: 'APP_',
      decryption: 'true',
      'mask-values': 'true'
    })
    const secretUser = 'alice'
    const secretPass = 'secret-pass-value'
    mockGetParameters.mockResolvedValue([
      {
        Name: '/app/json',
        Type: 'SecureString',
        Value: JSON.stringify({ USER: secretUser, PASS: secretPass })
      }
    ])

    await run_action()

    expect(core.debug).not.toHaveBeenCalledWith(
      expect.stringContaining(secretUser)
    )
    expect(core.debug).not.toHaveBeenCalledWith(
      expect.stringContaining(secretPass)
    )
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('logs only metadata for parsed parameter values', async () => {
    process.env.AWS_DEFAULT_REGION = 'us-east-1'
    setInputs({
      'ssm-path': '/app/json',
      'get-children': 'false',
      prefix: 'APP_',
      decryption: 'true',
      'mask-values': 'true'
    })
    mockGetParameters.mockResolvedValue([
      {
        Name: '/app/json',
        Type: 'SecureString',
        Value: JSON.stringify({ USER: 'alice', PASS: 'secret-pass-value' })
      },
      {
        Name: '/app/literal',
        Type: 'SecureString',
        Value: 'postgres://prod-user:prod-pass@example.com/prod'
      }
    ])

    await run_action()

    expect(core.debug).toHaveBeenCalledWith(
      'Parsed parameter as object with 2 key(s)'
    )
    expect(core.debug).toHaveBeenCalledWith(
      'Parsed parameter as string literal value'
    )
    expect(core.debug).not.toHaveBeenCalledWith(
      expect.stringContaining('parsedValue:')
    )
    expect(core.debug).not.toHaveBeenCalledWith(
      expect.stringContaining('secret-pass-value')
    )
    expect(core.debug).not.toHaveBeenCalledWith(
      expect.stringContaining('prod-pass')
    )
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('logs parsed values for non-secure parameters', async () => {
    process.env.AWS_DEFAULT_REGION = 'us-east-1'
    setInputs({
      'ssm-path': '/app/public-url',
      'get-children': 'false',
      prefix: 'APP_',
      decryption: 'true',
      'mask-values': 'false'
    })
    const nonSecretValue = 'https://example.com/public'
    mockGetParameters.mockResolvedValue([
      { Name: '/app/public-url', Type: 'String', Value: nonSecretValue }
    ])

    await run_action()

    expect(core.debug).toHaveBeenCalledWith(`parsedValue: ${nonSecretValue}`)
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('logs parsed JSON object values for non-secure parameters', async () => {
    process.env.AWS_DEFAULT_REGION = 'us-east-1'
    setInputs({
      'ssm-path': '/app/public-json',
      'get-children': 'false',
      prefix: 'APP_',
      decryption: 'true',
      'mask-values': 'false'
    })
    mockGetParameters.mockResolvedValue([
      {
        Name: '/app/public-json',
        Type: 'String',
        Value: JSON.stringify({ PUBLIC_URL: 'https://example.com/public' })
      }
    ])

    await run_action()

    expect(core.debug).toHaveBeenCalledWith(
      'parsedValue: {"PUBLIC_URL":"https://example.com/public"}'
    )
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('does not log parsed value when parameter type is missing', async () => {
    process.env.AWS_DEFAULT_REGION = 'us-east-1'
    setInputs({
      'ssm-path': '/app/missing-type',
      'get-children': 'false',
      prefix: 'APP_',
      decryption: 'true',
      'mask-values': 'false'
    })
    const value = 'https://example.com/missing-type'
    mockGetParameters.mockResolvedValue([
      { Name: '/app/missing-type', Value: value }
    ])

    await run_action()

    expect(core.debug).toHaveBeenCalledWith(
      'Parsed parameter as string literal value'
    )
    expect(core.debug).not.toHaveBeenCalledWith(`parsedValue: ${value}`)
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('does not log parsed value when parameter type is explicitly undefined', async () => {
    process.env.AWS_DEFAULT_REGION = 'us-east-1'
    setInputs({
      'ssm-path': '/app/undefined-type',
      'get-children': 'false',
      prefix: 'APP_',
      decryption: 'true',
      'mask-values': 'false'
    })
    const value = 'https://example.com/undefined-type'
    mockGetParameters.mockResolvedValue([
      { Name: '/app/undefined-type', Type: undefined, Value: value }
    ])

    await run_action()

    expect(core.debug).toHaveBeenCalledWith(
      'Parsed parameter as string literal value'
    )
    expect(core.debug).not.toHaveBeenCalledWith(`parsedValue: ${value}`)
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
