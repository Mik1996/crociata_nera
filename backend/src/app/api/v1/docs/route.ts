import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { assertDocsAccess } from '@/openapi/docs-access';

/** Swagger UI from the CDN, at a fixed version. */
const SWAGGER_UI = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.34.0';

const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Crociata Nera API</title>
    <link rel="stylesheet" href="${SWAGGER_UI}/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${SWAGGER_UI}/swagger-ui-bundle.js"></script>
    <script>
      SwaggerUIBundle({ url: './openapi.json', dom_id: '#swagger-ui', persistAuthorization: true, tryItOutEnabled: false });
    </script>
  </body>
</html>
`;

/**
 * `GET /api/v1/docs`: Swagger UI on the OpenAPI document (`./openapi.json`). Public in development;
 * in production for administrators, who sign in with the browser's login dialog using the
 * credentials of their account on the site (see `assertDocsAccess`). The browser then sends the same
 * credentials when the page reads `./openapi.json`.
 */
export const GET = apiHandler({ apiName: ApiName.API_DOCS, database: false }, async ({ request, user }) => {
  await assertDocsAccess(request, user);
  return new Response(PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
});
