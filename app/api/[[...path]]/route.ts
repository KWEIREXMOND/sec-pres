import { handleApi } from '@/server/router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RouteContext = { params: { path?: string[] } };

function segments(context: RouteContext): string[] {
  return context.params?.path || [];
}

export async function GET(request: Request, context: RouteContext) {
  return handleApi(request, segments(context));
}

export async function POST(request: Request, context: RouteContext) {
  return handleApi(request, segments(context));
}

export async function PATCH(request: Request, context: RouteContext) {
  return handleApi(request, segments(context));
}

export async function PUT(request: Request, context: RouteContext) {
  return handleApi(request, segments(context));
}

export async function DELETE(request: Request, context: RouteContext) {
  return handleApi(request, segments(context));
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      'Cache-Control': 'no-store',
    },
  });
}
