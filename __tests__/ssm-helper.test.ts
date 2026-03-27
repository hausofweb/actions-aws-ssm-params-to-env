import { jest } from '@jest/globals'
import type { GetParametersResult } from '@aws-sdk/client-ssm'

const sendMock = jest.fn<() => Promise<GetParametersResult>>()
const ssmClientConstructorMock = jest.fn(() => {
  return {
    send: sendMock
  }
})
const getParametersCommandMock = jest.fn((input) => {
  return { input }
})
const paginateGetParametersByPathMock = jest.fn()

jest.unstable_mockModule('@aws-sdk/client-ssm', () => {
  return {
    SSMClient: ssmClientConstructorMock,
    GetParametersCommand: getParametersCommandMock,
    paginateGetParametersByPath: paginateGetParametersByPathMock
  }
})

const { getParameters } = await import('../src/ssm-helper')

async function* paginator(): AsyncGenerator<
  { Parameters?: Array<{ Name?: string; Value?: string }> },
  void
> {
  yield { Parameters: [{ Name: '/app/one', Value: '1' }] }
  yield { Parameters: [{ Name: '/app/two', Value: '2' }] }
  yield {}
}

describe('ssm-helper.ts', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('fetches parameters by path when getChildren is enabled', async () => {
    paginateGetParametersByPathMock.mockReturnValue(paginator())

    const result = await getParameters({
      ssmPath: '/app',
      getChildren: true,
      decryption: true,
      region: 'us-east-1'
    })

    expect(ssmClientConstructorMock).toHaveBeenCalledWith({
      region: 'us-east-1'
    })
    expect(paginateGetParametersByPathMock).toHaveBeenCalledWith(
      {
        client: expect.objectContaining({ send: sendMock }),
        pageSize: 10
      },
      {
        Path: '/app',
        WithDecryption: true
      }
    )
    expect(sendMock).not.toHaveBeenCalled()
    expect(result).toEqual([
      { Name: '/app/one', Value: '1' },
      { Name: '/app/two', Value: '2' }
    ])
  })

  it('fetches a single parameter name when getChildren is disabled', async () => {
    sendMock.mockResolvedValue({
      Parameters: [{ Name: '/app/DB_URL', Value: 'postgres://localhost/db' }]
    } as GetParametersResult)

    const result = await getParameters({
      ssmPath: '/app/DB_URL',
      getChildren: false,
      decryption: false,
      region: 'us-west-2'
    })

    expect(ssmClientConstructorMock).toHaveBeenCalledWith({
      region: 'us-west-2'
    })
    expect(getParametersCommandMock).toHaveBeenCalledWith({
      Names: ['/app/DB_URL'],
      WithDecryption: false
    })
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          Names: ['/app/DB_URL'],
          WithDecryption: false
        }
      })
    )
    expect(result).toEqual([
      { Name: '/app/DB_URL', Value: 'postgres://localhost/db' }
    ])
  })

  it('returns an empty list when direct lookup has no parameters', async () => {
    sendMock.mockResolvedValue({ Parameters: undefined } as GetParametersResult)

    const result = await getParameters({
      ssmPath: '/app/missing',
      getChildren: false,
      decryption: false,
      region: 'us-east-2'
    })

    expect(result).toEqual([])
  })
})
