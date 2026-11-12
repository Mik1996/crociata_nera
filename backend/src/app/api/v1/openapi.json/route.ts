import { apiHandler } from '@/lib/http/api-handler';
import { ApiName } from '@/lib/http/api-name';
import { preflight } from '@/lib/http/cors';
import { assertDocsAccess } from '@/openapi/docs-access';
import { openApiDocument } from '@/openapi/document';

/**
 * `GET /api/v1/openapi.json`: the OpenAPI 3.1 document of the API (generated from `src/openapi`).
 * Public in development; in production for administrators only (see `assertDocsAccess`), so the
 * structure of the API is not published.
 */
export const GET = apiHandler({ apiName: ApiName.API_DOCS, database: false }, async ({ request, user }) => {
  await assertDocsAccess(request, user);
  return new Response(JSON.stringify(openApiDocument()), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
});

export const OPTIONS = preflight;
