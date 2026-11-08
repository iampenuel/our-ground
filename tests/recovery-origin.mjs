// A trusted preview credential must never follow a redirect to another service.
export async function protectRecoveryOrigin(target, origin, token) {
  if(!token || !/^https:\/\/ourground-staging-(?:[a-z0-9]+|git-eden10)-penuels-projects-aa802b06\.vercel\.app$/.test(origin)) throw Error('Use the protected Our Ground staging origin and its scoped credential.');
  await target.route(origin+'/**',async route=>{
    if(new URL(route.request().url()).origin!==origin)throw Error('Unexpected recovery origin.');
    const response=await route.fetch({maxRedirects:0,headers:{...route.request().headers(),'x-vercel-trusted-oidc-idp-token':token}});
    await route.fulfill({response});
  });
}
