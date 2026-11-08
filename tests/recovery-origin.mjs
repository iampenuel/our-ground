// A trusted preview credential must never follow a redirect to another service.
export async function protectRecoveryOrigin(target, origin, token) {
  if(!token || !/^https:\/\/ourground-staging-(?:[a-z0-9]+|git-eden10)-penuels-projects-aa802b06\.vercel\.app$/.test(origin)) throw Error('Use the protected Our Ground staging origin and its scoped credential.');
  await target.route(origin+'/**',async route=>{
    if(new URL(route.request().url()).origin!==origin)throw Error('Unexpected recovery origin.');
    try {
      const response=await route.fetch({maxRedirects:0,headers:{...route.request().headers(),'x-vercel-trusted-oidc-idp-token':token}});
      await route.fulfill({response});
    } catch(error) {
      // Playwright includes request headers in transport errors. Never emit
      // them, including when the test closes a tab with a fetch outstanding.
      if(!/disposed|closed|already handled/i.test(error?.message??'')){
        await route.abort('failed').catch(()=>{});
        throw Error('Protected staging transport failed.');
      }
    }
  });
}
