import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as apigateway from "aws-cdk-lib/aws-apigateway";

export class MemoriesOnTheGoServerStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // User Table
    const userTable = new dynamodb.Table(this, "users", {
      partitionKey: {
        name: "user_id",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "username",
        type: dynamodb.AttributeType.STRING,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Access Token Table
    const accessTokenTable = new dynamodb.Table(this, "access_token", {
      partitionKey: {
        name: "token_id",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "user_id",
        type: dynamodb.AttributeType.STRING,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Image Table
    const imageTable = new dynamodb.Table(this, "images", {
      partitionKey: {
        name: "image_id",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "user_id",
        type: dynamodb.AttributeType.STRING,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // defines an AWS Lambda resource
    const users = new lambda.Function(this, "UsersHandler", {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset("lambdas"),
      handler: "users.handler",
      environment: {
        DEFAULT_TOKEN_EXPIRY: "7200",
        USER_TABLE_NAME: userTable.tableName,
        ACCESSTOKEN_TABLE_NAME: accessTokenTable.tableName,
      },
    });

    const images = new lambda.Function(this, "ImagesHandler", {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset("lambdas"),
      handler: "images.handler",
      environment: {
        IMAGE_TABLE_NAME: imageTable.tableName,
        ACCESSTOKEN_TABLE_NAME: accessTokenTable.tableName,
      },
    });

    // Grant the Lambda function only the necessary SNS actions
    const lambdaRole = images.role;
    lambdaRole?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSNSFullAccess")
    );

    // defines as AWS APIGateway resource
    const usersApi = new apigateway.LambdaRestApi(this, "usersAPI", {
      integrationOptions: {
        proxy: true,
      },
      handler: users,
      proxy: false,
    });

    const imagesApi = new apigateway.LambdaRestApi(this, "imagesAPI", {
      integrationOptions: {
        proxy: true,
      },
      handler: images,
      proxy: false,
    });

    const usersApiResources = usersApi.root.addResource("users");
    usersApiResources.addResource("login").addMethod("POST");
    usersApiResources.addResource("{user_id}").addMethod("PUT");
    usersApiResources.addResource("check-username").addMethod("GET");
    usersApiResources.addResource("refresh-token").addMethod("POST");
    usersApiResources.addResource("create-account").addMethod("POST");

    const imagesApiResources = imagesApi.root.addResource("images");
    imagesApiResources.addResource("fetch").addMethod("GET");
    imagesApiResources.addResource("upload").addMethod("POST");
    imagesApiResources.addResource("{image_id}").addMethod("DELETE");

    userTable.grantReadWriteData(users);
    accessTokenTable.grantReadWriteData(users);

    imageTable.grantReadWriteData(images);
    accessTokenTable.grantReadData(images);
  }
}
