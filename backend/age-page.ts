// The first-visit screen runs before the application. Its preview contains
// no links, scripts, fonts, account state, or assistant components.
export const previewPhotos = {
  desktop: '/images/our-ground/hero-courtyard-realistic-desktop.webp',
  mobile: '/images/our-ground/hero-courtyard-realistic-800.webp',
} as const;

const preview = `<div class="preview" inert aria-hidden="true">
  <div class="preview-header"><span>Our Ground</span><div>Find Support　　 Give Support　　 For Organizations　　 About　　 Organization account</div></div>
  <div class="preview-hero">
    <picture><source media="(max-width: 800px)" srcset="${previewPhotos.mobile}"><img src="${previewPhotos.desktop}" alt="" width="1672" height="941" referrerpolicy="no-referrer"></picture>
    <div class="preview-copy"><div class="preview-headline">Stronger<br>communities<br>grow here.</div>
      <p>Connecting people with local food, healthcare, and essential support — and the people and organizations who make it possible.</p>
      <div class="preview-actions"><span>Find support near you</span><span>Give support</span></div>
    </div>
    <div class="preview-values"><span>People<br>Real help. Real neighbors.</span><span>Places<br>Stronger communities.</span><span>Possibilities<br>A healthier, more connected tomorrow.</span></div>
  </div>
</div>`;

const policies = '<nav aria-label="Site policies"><a href="/terms">Terms</a> <span aria-hidden="true">·</span> <a href="/privacy">Privacy</a></nav>';
const escapeAttribute = (s:string) => s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');

function documentResponse(title:string, body:string, status:number) {
  // strict-origin preserves Chrome's native POST Origin without disclosing a callback query.
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="referrer" content="strict-origin"><title>${title} · Our Ground</title><link rel="stylesheet" href="/eligibility.css?v=4"></head><body>${body}</body></html>`, {
    status, headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Referrer-Policy':'strict-origin','X-Robots-Tag':'noindex'},
  });
}

export function page(title:string, content:string, status=200) {
  return documentResponse(title,`<main class="policy"><p>Our Ground</p><h1>${title}</h1>${content}${policies}</main>`,status);
}

function entrance(title:string, content:string, {status=200, policy=false} = {}) {
  return documentResponse(title,`${preview}<main class="entrance"><div class="panel${policy?' panel--policy':''}">
    <p class="brand">Our Ground</p>
    <h1>${title}</h1>
    ${content}
    ${policies}
  </div></main>`,status);
}

export function deniedEntrance() {
  return entrance('Our Ground is for adults 19 and older','<p>You cannot enter this demo. An adult can search on your behalf.</p>',{status:403});
}

export function policyPage(title:'Terms'|'Privacy', copy:string, preEntry:boolean) {
  const content = `<p>${copy}</p><a href="/">Return to Our Ground</a>`;
  return preEntry ? entrance(title,content,{policy:true}) : page(title,content);
}

export function gate(back:string) {
  return entrance('Age confirmation',`
    <p>Our Ground is currently available to adults 19 and older. Please confirm your age to continue.</p>
    <form method="post" action="/eligibility"><input type="hidden" name="return" value="${escapeAttribute(back)}">
      <button name="age" value="19plus">I'm 19 or older</button><button name="age" value="under19">I'm under 19</button>
    </form>
    <p class="note">Your choice is remembered for this browser session. No ID or birth date required.</p>`);
}
