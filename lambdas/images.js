import { v4 as uuidv4 } from "uuid";
import { s3Client } from "./clients/s3Client.js";
import { dbClient } from "./clients/dbClient.js";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { ScanCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { responseSanitizer, verifyUserIdentity } from "./helpers/helpers.js";

export const handler = async function (event) {
  const routePath = event.path.replace("/images/", "");
  const userIdentity = verifyUserIdentity(event.headers);

  switch (routePath) {
    case "upload":
      try {
        const key = uuidv4();
        const payload = JSON.parse(event.body);
        const s3Key = `${key}-${payload.image}`;

        await dbClient.send(
          new PutItemCommand({
            TableName: process.env.IMAGE_TABLE_NAME,
            Item: marshall({
              image_id: key,
              user_id: userIdentity.user_id,
              filename: payload.image,
              s3_key: s3Key,
              metadata: "",
              s3_key_thumbnail: `thumbnails/${s3Key}`,
              created_at: new Date().toISOString(),
            }),
          })
        );
        const url = await getSignedUrl(
          s3Client,
          new PutObjectCommand({
            Key: s3Key,
            Bucket: process.env.IMAGE_BUCKET_NAME,
          }),
          {
            expiresIn: process.env.PUT_SIGNED_URL_EXPIRY,
          }
        );

        return responseSanitizer({
          statusCode: 200,
          body: JSON.stringify({
            isSuccess: true,
            filename: payload.image,
            upload_url: url,
          }),
        });
      } catch (error) {
        console.error(
          `Error creating signedUrl for image ${payload.image}:`,
          error
        );
        return responseSanitizer({
          statusCode: 500,
          body: JSON.stringify({ error: error.message }),
        });
      }

    case "listing":
      try {
        let images = [];
        const { Items } = await dbClient.send(
          new ScanCommand({
            TableName: process.env.IMAGE_TABLE_NAME,
            FilterExpression: "#UserId = :user_id",
            ExpressionAttributeNames: {
              "#UserId": "user_id",
            },
            ExpressionAttributeValues: {
              ":user_id": { S: userIdentity.user_id },
            },
          })
        );

        if (Items.length) {
          images = Items.map((item) => ({ ...unmarshall(item) }));
        }

        return responseSanitizer({
          statusCode: 200,
          body: JSON.stringify({ images }),
        });
      } catch (error) {
        console.error("Error fetching images:", error);
        return responseSanitizer({
          statusCode: 500,
          body: JSON.stringify({ error: error.message }),
        });
      }

    case "s3-presigned":
      if (!event.body) {
        return responseSanitizer({
          statusCode: 400,
          body: "invalid request, you are missing the parameter body",
        });
      }

      try {
        const parseRequest = JSON.parse(event.body);
        const original_image = await getSignedUrl(
          s3Client,
          new GetObjectCommand({
            Bucket: process.env.IMAGE_BUCKET_NAME,
            Key: parseRequest.s3_key,
          }),
          {
            expiresIn: process.env.GET_SIGNED_URL_EXPIRY,
          }
        );

        const thumbnail_image = await getSignedUrl(
          s3Client,
          new GetObjectCommand({
            Bucket: process.env.IMAGE_BUCKET_NAME,
            Key: parseRequest.s3_key_thumbnail,
          }),
          {
            expiresIn: process.env.GET_SIGNED_URL_EXPIRY,
          }
        );

        return responseSanitizer({
          statusCode: 200,
          body: JSON.stringify({
            original_image,
            thumbnail_image,
          }),
        });
      } catch (error) {
        console.error("Error preparing s3 presigned url.", error);
        return responseSanitizer({
          statusCode: 500,
          body: JSON.stringify({ error: error.message }),
        });
      }

    default:
      return responseSanitizer({
        statusCode: 404,
        body: JSON.stringify({
          message: `Requested service endpoint not found.`,
        }),
      });
  }
};
