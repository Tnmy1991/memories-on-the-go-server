import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { dbClient } from "../clients/dbClient.js";
import { ScanCommand } from "@aws-sdk/client-dynamodb";

const SECRET_KEY = "=7@b&cibgc65x8jyyi1!q7-1w6&-2qegp)tf!7x270+h+92lrnyour";

export const generateSalt = () => bcrypt.genSaltSync(9);
export const responseSanitizer = (response) => {
  return {
    headers: {
      "Access-Control-Allow-Origin": "http://localhost:4200",
    },
    ...response,
  };
};
export const isUsernameExist = async (username) => {
  try {
    const response = await dbClient.send(
      new ScanCommand({
        TableName: process.env.USER_TABLE_NAME,
        FilterExpression: "#UserName = :username",
        ExpressionAttributeNames: {
          "#UserName": "username",
        },
        ExpressionAttributeValues: {
          ":username": { S: username },
        },
      })
    );
    return response?.Count > 0;
  } catch (error) {
    console.error(error);
    return responseSanitizer({
      statusCode: 401,
      body: JSON.stringify({
        message: "Access token either malformed or invalid",
      }),
    });
  }
};
export const isPhoneExist = async (phoneNumber) => {
  try {
    const response = await dbClient.send(
      new ScanCommand({
        TableName: process.env.USER_TABLE_NAME,
        FilterExpression: "#PhoneNumber = :phoneNumber",
        ExpressionAttributeNames: {
          "#PhoneNumber": "phone_number",
        },
        ExpressionAttributeValues: {
          ":phoneNumber": { S: phoneNumber },
        },
      })
    );

    return response?.Count > 0;
  } catch (error) {
    console.error(error);
    return responseSanitizer({
      statusCode: 401,
      body: JSON.stringify({
        message: "Access token either malformed or invalid",
      }),
    });
  }
};
export const passwordHash = (password) => {
  try {
    const salt = generateSalt();
    return bcrypt.hashSync(password, salt);
  } catch (error) {
    console.error(error);
    return responseSanitizer({
      statusCode: 401,
      body: JSON.stringify({
        message: "Access token either malformed or invalid",
      }),
    });
  }
};
export const comparePassword = (passwordHash, password) => {
  try {
    return bcrypt.compareSync(passwordHash, password);
  } catch (error) {
    console.error(error);
    return responseSanitizer({
      statusCode: 401,
      body: JSON.stringify({
        message: "Access token either malformed or invalid",
      }),
    });
  }
};
export const authorizeUser = (name, user_id) => {
  try {
    return jwt.sign({ name: name, user_id: user_id }, SECRET_KEY, {
      expiresIn: process.env.DEFAULT_TOKEN_EXPIRY,
    });
  } catch (error) {
    console.error(error);
    return responseSanitizer({
      statusCode: 401,
      body: JSON.stringify({
        message: "Access token either malformed or invalid",
      }),
    });
  }
};
export const verifyUserIdentity = (headers) => {
  try {
    const token = headers.Authorization.replace("Bearer ", "");
    return jwt.verify(token, SECRET_KEY);
  } catch (error) {
    console.error(error);
    return responseSanitizer({
      statusCode: 401,
      body: JSON.stringify({
        message: "Access token either malformed or invalid",
      }),
    });
  }
};
