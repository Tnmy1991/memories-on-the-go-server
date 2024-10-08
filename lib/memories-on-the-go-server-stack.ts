import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";

export class MemoriesOnTheGoServerStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create an S3 bucket to host the client
    const clientBucket = new s3.Bucket(this, "ClientBucket", {
      websiteIndexDocument: "index.html",
      websiteErrorDocument: "error.html",
      blockPublicAccess: {
        blockPublicAcls: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
        blockPublicPolicy: false,
      },
      publicReadAccess: true,
    });

    // Deploy website content to S3 bucket
    new s3deploy.BucketDeployment(this, "DeployClient", {
      destinationBucket: clientBucket,
      sources: [
        s3deploy.Source.asset(
          "./ui-client/dist/memories-on-the-go-client/browser"
        ),
      ],
    });

    // Create an S3 bucket for image storage
    const imageBucket = new s3.Bucket(this, "ImageBucket", {
      bucketName: "memories-on-the-go-image-bucket",
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
          ],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          maxAge: 300,
        },
      ],
    });

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

    // Image Table
    const imageTable = new dynamodb.Table(this, "images", {
      partitionKey: {
        name: "image_id",
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
        DEFAULT_TOKEN_EXPIRY: "1h",
        USER_TABLE_NAME: userTable.tableName,
      },
    });

    const images = new lambda.Function(this, "ImagesHandler", {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset("lambdas"),
      handler: "images.handler",
      timeout: cdk.Duration.seconds(15),
      environment: {
        PUT_SIGNED_URL_EXPIRY: "1200",
        GET_SIGNED_URL_EXPIRY: "18000",
        IMAGE_TABLE_NAME: imageTable.tableName,
        IMAGE_BUCKET_NAME: imageBucket.bucketName,
      },
    });

    const thumbnail = new lambda.Function(this, "ThumbnailHandler", {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset("lambdas"),
      handler: "thumbnail.handler",
      timeout: cdk.Duration.seconds(15),
      environment: {
        IMAGE_TABLE_NAME: imageTable.tableName,
      },
    });

    // Create an S3 event source and add it to the Lambda function
    thumbnail.addEventSource(
      new lambdaEventSources.S3EventSource(imageBucket, {
        events: [s3.EventType.OBJECT_CREATED_PUT],
      })
    );

    // defines as AWS APIGateway resource
    const usersApi = new apigateway.LambdaRestApi(this, "usersAPI", {
      integrationOptions: {
        proxy: true,
      },
      handler: users,
      proxy: false,
      defaultCorsPreflightOptions: {
        allowOrigins: ["*"],
        allowMethods: ["OPTIONS", "GET", "POST", "PUT", "DELETE"],
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
      },
    });

    const imagesApi = new apigateway.LambdaRestApi(this, "imagesAPI", {
      integrationOptions: {
        proxy: true,
      },
      handler: images,
      proxy: false,
      defaultCorsPreflightOptions: {
        allowOrigins: ["*"],
        allowMethods: ["OPTIONS", "GET", "POST", "PUT", "DELETE"],
        allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
      },
    });

    const usersApiResources = usersApi.root.addResource("users");
    usersApiResources.addResource("login").addMethod("POST");
    usersApiResources.addResource("lookup").addMethod("POST");
    usersApiResources.addResource("create-account").addMethod("POST");

    const imagesApiResources = imagesApi.root.addResource("images");
    imagesApiResources.addResource("listing").addMethod("GET");
    imagesApiResources.addResource("upload").addMethod("POST");
    imagesApiResources.addResource("s3-presigned").addMethod("POST");

    // Grant permissions to Lambda function
    imageBucket.grantReadWrite(images);
    imageBucket.grantReadWrite(thumbnail);

    userTable.grantReadWriteData(users);
    imageTable.grantReadWriteData(images);
    imageTable.grantReadWriteData(thumbnail);

    // Store API endpoint in SSM Parameter Store
    new ssm.StringParameter(this, "UsersApiEndpoint", {
      stringValue: usersApi.url,
      parameterName: "/memories-on-the-go-server/users-api-endpoint",
    });
    new ssm.StringParameter(this, "ImagesApiEndpoint", {
      stringValue: imagesApi.url,
      parameterName: "/memories-on-the-go-server/images-api-endpoint",
    });

    // Output the website URL
    new cdk.CfnOutput(this, "ClientURL", {
      value: `http://${clientBucket.bucketName}.s3-website-${cdk.Aws.REGION}.amazonaws.com`,
    });
  }
}
