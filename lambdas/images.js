import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "./clients/s3Client.js";

export const handler = async function (event) {
  const routePath = event.path.replace("/images/", "");

  try {
    const images = event.images;
    const uploadPromises = images.map(async (image) => {
      const buffer = Buffer.from(image.data, "base64");
      const params = {
        Bucket: process.env.IMAGE_BUCKET_NAME, // Replace with your bucket name
        Key: `images/${image.name}`, // Adjust key format as needed
        Body: buffer,
        ContentType: image.contentType, // If available
      };

      try {
        await s3Client.send(new PutObjectCommand(params));
        console.log(`Image ${image.name} uploaded successfully`);
      } catch (error) {
        console.error(`Error uploading image ${image.name}:`, error);
        // Handle error, e.g., retry or log
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
};
