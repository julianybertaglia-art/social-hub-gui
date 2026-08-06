import { NextResponse } from 'next/server';

export async function GET(request) {
  const url = new URL(request.url);
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');
  const code = url.searchParams.get('code');

  const redirectUrl = new URL('/automacoes', url.origin);

  if (error) {
    redirectUrl.searchParams.set('instagram', 'erro');
    redirectUrl.searchParams.set('motivo', errorDescription || error);
    return NextResponse.redirect(redirectUrl);
  }

  if (code) {
    redirectUrl.searchParams.set('instagram', 'retorno_recebido');
    return NextResponse.redirect(redirectUrl);
  }

  redirectUrl.searchParams.set('instagram', 'sem_codigo');
  return NextResponse.redirect(redirectUrl);
}
