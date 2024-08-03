import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { parse } from "lambda-multipart-parser";
import { s3Client } from "./clients/s3Client.js";
import { dbClient } from "./clients/dbClient.js";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { ScanCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const verifyUserIdentity = (headers) => {
  try {
    const token = headers.Authorization.replace("Bearer ", "");
    const decoded = jwt.verify(
      token,
      "=7@b&cibgc65x8jyyi1!q7-1w6&-2qegp)tf!7x270+h+92lrnyour"
    );

    return decoded;
  } catch (err) {
    console.error(err);
    return {
      statusCode: 401,
      body: JSON.stringify({
        message: "Access token either malformed or invalid",
      }),
    };
  }
};

export const handler = async function (event) {
  const routePath = event.path.replace("/images/", "");
  const userIdentity = verifyUserIdentity(event.headers);

  switch (routePath) {
    case "upload":
      try {
        const payload = await parse(event);
        const uploadPromises = payload.files.map(async (image) => {
          const s3Key = `${uuidv4()}-${image.filename}`;
          const params = {
            Bucket: process.env.IMAGE_BUCKET_NAME,
            Key: s3Key,
            Body: image.content,
            ContentType: image.contentType,
          };

          try {
            await s3Client.send(new PutObjectCommand(params)).then(async () => {
              await dbClient.send(
                new PutItemCommand({
                  TableName: process.env.IMAGE_TABLE_NAME,
                  Item: marshall({
                    image_id: uuidv4(),
                    user_id: userIdentity.user_id,
                    filename: image.filename,
                    content_type: image.contentType,
                    s3_key: s3Key,
                    cretaed_at: new Date().toISOString(),
                    updated_at: "",
                  }),
                })
              );
            });
          } catch (error) {
            console.error(`Error uploading image ${image.filename}:`, error);
          }
        });

        await Promise.all(uploadPromises);
        return {
          statusCode: 200,
          body: JSON.stringify({ message: "Images uploaded successfully" }),
        };
      } catch (error) {
        console.error("Error uploading images:", error);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: error.message }),
        };
      }

    case "listing":
      try {
        const command = new ScanCommand({
          TableName: process.env.IMAGE_TABLE_NAME,
          FilterExpression: "#UserId = :user_id",
          ExpressionAttributeNames: {
            "#UserId": "user_id",
          },
          ExpressionAttributeValues: {
            ":user_id": { S: userIdentity.user_id },
          },
        });

        let imageListing = [];
        const { Items } = await dbClient.send(command);
        const fetchPromises = Items.map(async (item) => {
          const image = unmarshall(item);
          const command = new GetObjectCommand({
            Bucket: process.env.IMAGE_BUCKET_NAME,
            Key: image.s3_key,
            ResponseContentType: image.content_type,
          });

          try {
            const url = await getSignedUrl(s3Client, command, {
              expiresIn: process.env.BUCKET_SIGNED_URL_EXPIRY,
            });
            imageListing.push({
              ...image,
              url,
            });
          } catch (error) {
            console.error(`Error uploading image ${image.filename}:`, error);
          }
        });

        await Promise.all(fetchPromises);
        return {
          statusCode: 200,
          body: JSON.stringify(imageListing),
        };
      } catch (error) {
        console.error("Error fetching images:", error);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: error.message }),
        };
      }

    default:
      return {
        statusCode: 404,
        body: JSON.stringify({
          message: `Requested service endpoint not found.`,
        }),
      };
  }
};
