import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
const dbClient = new DynamoDBClient({ region: "us-east-1" });
export { dbClient };
