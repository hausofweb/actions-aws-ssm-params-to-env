import {
  SSMClient,
  GetParametersCommand,
  paginateGetParametersByPath,
  GetParametersResult
} from '@aws-sdk/client-ssm'

export const getParameters = async ({
  ssmPath,
  getChildren,
  decryption,
  region
}: {
  ssmPath: string
  getChildren: boolean
  decryption: boolean
  region: string
}) => {
  const client = new SSMClient({ region: region })
  const parameters: GetParametersResult['Parameters'] = []

  if (getChildren) {
    const paginatorConfig = {
      client: client,
      pageSize: 10 // Adjust as needed
    }

    const input = {
      // GetParametersByPathRequest
      Path: ssmPath,
      WithDecryption: decryption
    }

    const paginator = paginateGetParametersByPath(paginatorConfig, input)

    for await (const page of paginator) {
      if (page.Parameters) {
        parameters.push(...page.Parameters)
      }
    }
  } else {
    const input = {
      // GetParametersRequest
      Names: [
        // ParameterNameList // required
        ssmPath
      ],
      WithDecryption: decryption
    }
    const command = new GetParametersCommand(input)
    const response = await client.send(command)
    parameters.push(...(response.Parameters || []))
  }

  return parameters
}
