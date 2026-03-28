import {
  debug,
  exportVariable,
  getInput,
  setFailed,
  setSecret
} from '@actions/core'
import type { Parameter } from '@aws-sdk/client-ssm'
import { getParameters } from './ssm-helper'

type ActionConfig = {
  ssmPath: string
  getChildren: boolean
  prefix: string
  region: string
  decryption: boolean
  maskValues: boolean
}

type SetEnvironmentVarOptions = {
  key: string
  value: string
  maskValue: boolean
}

const getActionConfig = (): ActionConfig => {
  const region = process.env.AWS_DEFAULT_REGION

  if (!region) {
    throw new Error(
      'AWS region must be specified via AWS_DEFAULT_REGION environment variable'
    )
  }

  return {
    ssmPath: getInput('ssm-path', { required: true }),
    getChildren: getInput('get-children') === 'true',
    prefix: getInput('prefix'),
    region,
    decryption: getInput('decryption') === 'true',
    maskValues: getInput('mask-values') === 'true'
  }
}

export const run_action = async () => {
  try {
    const config = getActionConfig()
    const params = await getParameters({
      ssmPath: config.ssmPath,
      getChildren: config.getChildren,
      decryption: config.decryption,
      region: config.region
    })
    exportParameters(params, config)
  } catch (e) {
    setFailed(getErrorMessage(e))
  }
}

const exportParameters = (params: Parameter[], config: ActionConfig) => {
  for (const param of params) {
    exportParameter(param, config)
  }
}

const exportParameter = (param: Parameter, config: ActionConfig) => {
  if (!param.Value) {
    debug(`Parameter ${param.Name} has no value, skipping...`)
    return
  }

  const parsedValue = parseValue(param.Value)
  const shouldMaskExportedValue =
    config.maskValues || isSecureStringParameter(param)
  const shouldLogParsedValue =
    param.Type != null && !isSecureStringParameter(param)

  if (typeof parsedValue === 'object') {
    exportObjectValue(
      parsedValue,
      config.prefix,
      shouldMaskExportedValue,
      shouldLogParsedValue
    )
    return
  }

  exportLiteralValue(
    param,
    parsedValue,
    config.prefix,
    shouldMaskExportedValue,
    shouldLogParsedValue
  )
}

const isSecureStringParameter = (param: Parameter): boolean => {
  return param.Type === 'SecureString'
}

const exportObjectValue = (
  parsedValue: Record<string, string>,
  prefix: string,
  maskValues: boolean,
  shouldLogParsedValue: boolean
) => {
  if (shouldLogParsedValue) {
    debug(`parsedValue: ${JSON.stringify(parsedValue)}`)
  } else {
    debug(
      `Parsed parameter as object with ${Object.keys(parsedValue).length} key(s)`
    )
  }

  for (const key in parsedValue) {
    const sanitizedKey = sanitizeEnvVarSegment(key)

    setEnvironmentVar({
      key: prefix + sanitizedKey,
      value: parsedValue[key],
      maskValue: maskValues
    })
  }
}

const exportLiteralValue = (
  param: Parameter,
  parsedValue: string,
  prefix: string,
  maskValues: boolean,
  shouldLogParsedValue: boolean
) => {
  if (shouldLogParsedValue) {
    debug(`parsedValue: ${parsedValue}`)
  } else {
    debug('Parsed parameter as string literal value')
  }

  const envVarName = prefix
    ? getPrefixedEnvVarName(param, prefix)
    : getSanitizedEnvVarName(param)

  if (!envVarName) {
    debug(
      `Could not derive env var name from parameter name ${param.Name}, skipping...`
    )
    return
  }

  setEnvironmentVar({
    key: envVarName,
    value: parsedValue,
    maskValue: maskValues
  })
}

const getPrefixedEnvVarName = (param: Parameter, prefix: string) => {
  const split = param.Name?.split('/')
  const envVarName = prefix + sanitizeEnvVarSegment(split?.at(-1))

  debug(`Using prefix + end of ssmPath for env var name: ${envVarName}`)

  return envVarName
}

const getSanitizedEnvVarName = (param: Parameter) => {
  // Only use the string after the last '/' in the parameter name, and replace non-alphanumeric characters with underscores to create a valid env var name. For example, /myapp/database-url would become DATABASE_URL

  const envVarName = sanitizeEnvVarSegment(param.Name?.split('/').at(-1))

  debug(
    `No prefix provided, using sanitized parameter name for env var: ${envVarName}`
  )

  return envVarName
}

const sanitizeEnvVarSegment = (value?: string) => {
  return value?.replaceAll(/[^\w]/g, '_').toUpperCase()
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return `An unknown error occurred: ${JSON.stringify(error)}`
}

const parseValue = (val: string) => {
  try {
    return JSON.parse(val)
  } catch {
    debug(
      'JSON parse failed - assuming parameter is to be taken as a string literal'
    )
    return val
  }
}

const setEnvironmentVar = ({
  key,
  value,
  maskValue
}: SetEnvironmentVarOptions) => {
  if (maskValue) {
    setSecret(value)
  }
  exportVariable(key, value)
}
