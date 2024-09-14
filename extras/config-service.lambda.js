import { SSMClient, GetParametersCommand } from "@aws-sdk/client-ssm";

export const handler = async (event) => {
  const ssmClient = new SSMClient({ region: "us-east-1" });

  try {
    const response = await ssmClient.send(
      new GetParametersCommand({
        Names: [
          "/memories-on-the-go-server/users-api-endpoint",
          "/memories-on-the-go-server/images-api-endpoint",
        ],
        WithDecryption: true,
      })
    );
    return {
      statusCode: 200,
      body: JSON.stringify(response.Parameters),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: "Failed to retrieve SSM parameter",
    };
  }
};

/* Instructions */
// lambda function should have a function url and should accessable to anyone
// lambda user should have "Allow: ssm:GetParameters" policy attached
