import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { dbClient } from "./clients/dbClient.js";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { ScanCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";

const generateSalt = () => bcrypt.genSaltSync(9);

const isUsernameExist = async (username) => {
  const command = new ScanCommand({
    TableName: process.env.USER_TABLE_NAME,
    FilterExpression: "#UserName = :username",
    ExpressionAttributeNames: {
      "#UserName": "username",
    },
    ExpressionAttributeValues: {
      ":username": { S: username },
    },
  });

  const response = await dbClient.send(command);
  return response?.Count > 0;
};

const isPhoneExist = async (phoneNumber) => {
  const command = new ScanCommand({
    TableName: process.env.USER_TABLE_NAME,
    FilterExpression: "#PhoneNumber = :phoneNumber",
    ExpressionAttributeNames: {
      "#PhoneNumber": "phone_number",
    },
    ExpressionAttributeValues: {
      ":phoneNumber": { S: phoneNumber },
    },
  });

  const response = await dbClient.send(command);
  return response?.Count > 0;
};

const passwordHash = (password) => {
  const salt = generateSalt();
  return bcrypt.hashSync(password, salt);
};

const authorizeUser = (name, user_id) => {
  return jwt.sign(
    { name: name, user_id: user_id },
    "=7@b&cibgc65x8jyyi1!q7-1w6&-2qegp)tf!7x270+h+92lrnyour",
    { expiresIn: "1h" }
  );
};

export const handler = async function (event) {
  const routePath = event.path.replace("/users/", "");

  switch (routePath) {
    case "create-account":
      if (!event.body) {
        return {
          statusCode: 400,
          body: "invalid request, you are missing the parameter body",
        };
      }

      try {
        const parseRequest = JSON.parse(event.body);
        const reponse = {
          access_token: "",
          display_name: parseRequest.name,
          message: `Thanks a lot! Your account has been created successfully.`,
        };

        if (await isUsernameExist(parseRequest.username)) {
          return {
            statusCode: 400,
            body: "Username already taken.",
          };
        }

        if (await isPhoneExist(parseRequest.phone_number)) {
          return {
            statusCode: 400,
            body: "Phone Number already exist.",
          };
        }

        const userId = uuidv4();
        const params = {
          TableName: process.env.USER_TABLE_NAME,
          Item: marshall({
            ...parseRequest,
            password: passwordHash(parseRequest.password),
            user_id: userId,
          }),
        };

        await dbClient.send(new PutItemCommand(params)).then(() => {
          reponse.access_token = authorizeUser(parseRequest.name, userId);
        });
        return {
          statusCode: 200,
          body: JSON.stringify(reponse),
        };
      } catch (errorResponse) {
        console.error(errorResponse);
        return { statusCode: 500, body: errorResponse };
      }

    case "login":
      if (!event.body) {
        return {
          statusCode: 400,
          body: "invalid request, you are missing the parameter body",
        };
      }

      try {
        const parseRequest = JSON.parse(event.body);
        const reponse = {
          access_token: "",
          display_name: "",
          message: `You've successfully logged in.`,
        };
        const command = new ScanCommand({
          TableName: process.env.USER_TABLE_NAME,
          FilterExpression: "#UserName = :username",
          ExpressionAttributeNames: {
            "#UserName": "username",
          },
          ExpressionAttributeValues: {
            ":username": { S: parseRequest.username },
          },
        });

        const { Items } = await dbClient.send(command);
        const user = unmarshall(Items[0]);
        const isPasswordCorrect = bcrypt.compareSync(
          parseRequest.password,
          user.password
        );
        if (isPasswordCorrect) {
          reponse.display_name = user.name;
          reponse.access_token = authorizeUser(user.name, user.user_id);
          return {
            statusCode: 200,
            body: JSON.stringify(reponse),
          };
        } else {
          return {
            statusCode: 400,
            body: JSON.stringify({
              message: `Password verification failed.`,
            }),
          };
        }
      } catch (errorResponse) {
        console.error(errorResponse);
        return { statusCode: 500, body: errorResponse };
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
