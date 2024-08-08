import mime from "mime";
import sharp from "sharp";
import { s3Client } from "./clients/s3Client.js";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

export const handler = async function (event) {
  const key = decodeURIComponent(
    event.Records[0].s3.object.key.replace(/\+/g, " ")
  );

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

      console.log("Thumbnail created successfully");
    } catch (err) {
      console.error("Error creating thumbnail:", err);
    }
  } else {
    console.log("Thumbnail already exist!");
  }
};
