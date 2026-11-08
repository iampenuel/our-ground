// Resolve API rewrites once for both admission and dispatch. A visitor cannot
// change a /v1 endpoint by appending a conflicting ?path query parameter.
export function publicApiRoute(url:URL){
  const path=/^\/api\/(?:index(?:\.ts)?|v1)\/?$/.test(url.pathname)?url.searchParams.get('path')??'':url.pathname.replace(/^\/api\/v1\/?/,'');
  return path.replace(/^\/+|\/+$/g,'');
}
