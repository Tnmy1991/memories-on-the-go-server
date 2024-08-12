import mime from "mime";
import sharp from "sharp";
import { dbClient } from "./clients/dbClient.js";
import { s3Client } from "./clients/s3Client.js";
import { marshall } from "@aws-sdk/util-dynamodb";
import { UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

export const handler = async function (event) {
  const key = decodeURIComponent(
    event.Records[0].s3.object.key.replace(/\+/g, " ")
  );
  const imageId = key.split("-").slice(0, 5).join("-");

  if (!key.includes("thumbnails/")) {
    const bucketName = event.Records[0].s3.bucket.name;
    const thumbnailKey = `thumbnails/${key}`;
    const ContentType = mime.getType(key);

    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });
      const response = await s3Client.send(command);
      const buffer = await response.Body.transformToByteArray();

      const imageMetadata = await sharp(buffer).metadata();
      const thumbnailBuffer = await sharp(buffer)
        .resize({ height: 172 })
        .toBuffer();

      // Upload the thumbnail
      const thumbnailCommand = new PutObjectCommand({
        Bucket: bucketName,
        Key: thumbnailKey,
        Body: thumbnailBuffer,
        ContentType: ContentType,
      });
      await s3Client.send(thumbnailCommand);

      // Update metadata in dynamoDB
      const parseRequest = { metadata: JSON.stringify(imageMetadata) };
      const objKeys = Object.keys(parseRequest);
      await dbClient.send(
        new UpdateItemCommand({
          TableName: process.env.IMAGE_TABLE_NAME,
          Key: marshall({ image_id: imageId }),
          UpdateExpression: `SET ${objKeys
            .map((_, index) => `#key${index} = :value${index}`)
            .join(", ")}`,
          ExpressionAttributeNames: objKeys.reduce(
            (acc, key, index) => ({
              ...acc,
              [`#key${index}`]: key,
            }),
            {}
          ),
          ExpressionAttributeValues: marshall(
            objKeys.reduce(
              (acc, key, index) => ({
                ...acc,
                [`:value${index}`]: parseRequest[key],
              }),
              {}
            )
          ),
        })
      );

      console.log("Thumbnail created successfully");
    } catch (err) {
      console.error("Error creating thumbnail:", err);
    }
  } else {
    console.log("Thumbnail already exist!");
  }
};
