import {
  isPhoneExist,
  passwordHash,
  authorizeUser,
  isUsernameExist,
  comparePassword,
  responseSanitizer,
} from "./helpers/helpers.js";
import { v4 as uuidv4 } from "uuid";
import { dbClient } from "./clients/dbClient.js";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { ScanCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";

export const handler = async function (event) {
  if (!event.body) {
    return responseSanitizer({
      statusCode: 400,
      body: "invalid request, you are missing the parameter body",
    });
  }
  const routePath = event.path.replace("/users/", "");

  switch (routePath) {
    case "create-account":
      try {
        const parseRequest = JSON.parse(event.body);
        const reponse = {
          access_token: "",
          display_name: parseRequest.name,
          message: `Thanks a lot! Your account has been created successfully.`,
        };

        if (await isUsernameExist(parseRequest.username)) {
          return responseSanitizer({
            statusCode: 400,
            body: "Username already taken.",
          });
        }

        if (await isPhoneExist(parseRequest.phone_number)) {
          return responseSanitizer({
            statusCode: 400,
            body: "Phone Number already exist.",
          });
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
        return responseSanitizer({
          statusCode: 200,
          body: JSON.stringify(reponse),
        });
      } catch (errorResponse) {
        console.error(errorResponse);
        return responseSanitizer({
          statusCode: 500,
          ...metaData,
          body: errorResponse,
        });
      }

    case "login":
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

        if (Items.length > 0) {
          const user = unmarshall(Items[0]);
          const isPasswordCorrect = comparePassword(
            parseRequest.password,
            user.password
          );
          if (isPasswordCorrect) {
            reponse.display_name = user.name;
            reponse.access_token = authorizeUser(user.name, user.user_id);
            return responseSanitizer({
              statusCode: 200,
              body: JSON.stringify(reponse),
            });
          } else {
            return responseSanitizer({
              statusCode: 400,
              body: JSON.stringify({
                field: `password`,
                message: `Password verification failed.`,
              }),
            });
          }
        } else {
          return responseSanitizer({
            statusCode: 400,
            body: JSON.stringify({
              field: `username`,
              message: `Username verification failed.`,
            }),
          });
        }
      } catch (errorResponse) {
        console.error(errorResponse);
        return responseSanitizer({ statusCode: 500, body: errorResponse });
      }

    case "lookup":
      try {
        let lookupFlag = false;
        const parseRequest = JSON.parse(event.body);

        switch (parseRequest.key) {
          case "username":
            lookupFlag = await isUsernameExist(parseRequest.value);
            break;

          case "phone_number":
            lookupFlag = await isPhoneExist(parseRequest.value);
            break;
        }

        return responseSanitizer({
          statusCode: 200,
          body: JSON.stringify({ lookupFlag }),
        });
      } catch (errorResponse) {
        console.error(errorResponse);
        return responseSanitizer({ statusCode: 500, body: errorResponse });
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
