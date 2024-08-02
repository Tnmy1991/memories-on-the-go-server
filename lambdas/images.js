import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "./clients/s3Client.js";
import { parse } from "lambda-multipart-parser";

export const handler = async function (event) {
  const routePath = event.path.replace("/images/", "");

  switch (routePath) {
    case "upload":
      try {
        const payload = await parse(event);
        const uploadPromises = payload.files.map(async (file) => {
          const params = {
            Bucket: process.env.IMAGE_BUCKET_NAME,
            Key: file.filename,
            Body: file.content,
            ContentType: file.contentType,
          };

          try {
            await s3Client.send(new PutObjectCommand(params));
          } catch (error) {
            console.error(`Error uploading image ${image.name}:`, error);
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

    default:
      return {
        statusCode: 404,
        body: JSON.stringify({
          message: `Requested service endpoint not found.`,
        }),
      };
  }
};
