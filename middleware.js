// middleware.js
export async function middleware(request) {
  const url = request.nextUrl.clone();

  // Protect only admin page
  if (url.pathname === '/admin' || url.pathname === '/admin.html') {
    
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

    if (!ADMIN_PASSWORD) {
      console.error("ADMIN_PASSWORD env variable is not set!");
      return Response.redirect(new URL('/spectator.html', request.url));
    }

    // Check for password in query string or header (flexible)
    const passwordFromUrl = url.searchParams.get('pw');
    const passwordFromHeader = request.headers.get('x-admin-password');

    const providedPassword = passwordFromUrl || passwordFromHeader;

    if (providedPassword !== ADMIN_PASSWORD) {
      // Return 401 with Basic Auth prompt (browser will show password dialog)
      return new Response('Unauthorized', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="CR Election Admin"',
        },
      });
    }
  }

  return Response.next();
}

// Apply middleware only to admin routes
export const config = {
  matcher: ['/admin', '/admin.html']
};