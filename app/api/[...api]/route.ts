import { router } from "@/src/api/router";
import { createOpenApiAwsLambdaHandler } from "trpc-openapi";

const lambdaHander = createOpenApiAwsLambdaHandler({
  router,
  createContext: () => ({
    user: null,
  }),
});
const handler = async (req: Request) => {
  const pathname = new URL(req.url, "http://localhost").pathname.slice(4);

  console.log(req.url);
  console.log(pathname);

  // convert fetch request to lambda event
  const { body, headers, statusCode } = await lambdaHander(
    {
      body: await req.text(),
      path: pathname,
      rawPath: pathname,
      isBase64Encoded: false,
      queryStringParameters: Object.fromEntries(new URL(req.url, "http://localhost").searchParams),
      headers: Object.fromEntries(req.headers),
      multiValueHeaders: Object.fromEntries([...req.headers].map(([k, v]) => [k, [v]])),
      httpMethod: req.method,
      multiValueQueryStringParameters: Object.fromEntries(
        [...new URL(req.url, "http://localhost").searchParams].map(([k, v]) => [k, [v]]),
      ),
      pathParameters: {},
      stageVariables: {},
      rawQueryString: new URL(req.url, "http://localhost").search,
      resource: "/{proxy+}",
      routeKey: "ANY /{proxy}",

      version: "2.0",

      requestContext: {
        timeEpoch: 0,

        accountId: "local",
        apiId: "local",
        authorizer: {},
        path: pathname,
        stage: "local",
        requestId: "local",
        requestTimeEpoch: 0,
        resourceId: "local",
        resourcePath: "local",
        http: {
          method: req.method,
          path: pathname,
          protocol: "HTTP/1.1",
          sourceIp: "local",
          userAgent: "local",
        },
        protocol: "HTTP/1.1",
        requestTime: "local",
        routeKey: "ANY /{proxy}",
        domainName: "local",
        domainPrefix: "local",

        httpMethod: req.method,
        identity: {
          accessKey: "local",
          accountId: "local",
          apiKey: "local",
          apiKeyId: "local",
          caller: "local",
          clientCert: {
            validity: {
              notAfter: "local",
              notBefore: "local",
            },
            clientCertPem: "local",
            subjectDN: "local",
            issuerDN: "local",
            serialNumber: "local",
          },
          cognitoAuthenticationProvider: "local",
          cognitoAuthenticationType: "local",
          cognitoIdentityId: "local",
          cognitoIdentityPoolId: "local",
          principalOrgId: "local",
          sourceIp: "local",
          user: "local",
          userAgent: "local",
          userArn: "local",
        },
      },
    },
    {
      awsRequestId: "local",
      callbackWaitsForEmptyEventLoop: true,
      functionName: "local",
      functionVersion: "local",
      invokedFunctionArn: "local",
      memoryLimitInMB: "local",
      logGroupName: "local",
      logStreamName: "local",
      getRemainingTimeInMillis: () => 0,
      done: () => {},
      fail: () => {},
      succeed: () => {},
    },
  );
  return new Response(body, {
    headers: new Headers([...Object.entries(headers || {})].map(([k, v]) => [k, String(v)] as const)),
    status: statusCode,
  });
};
export { handler as DELETE, handler as GET, handler as PATCH, handler as POST, handler as PUT };
