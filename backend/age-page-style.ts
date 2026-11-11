// Served through the existing same-origin /eligibility.css endpoint under production CSP.
export const agePageStyle = `
:root { color-scheme:light; font:100%/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:#252a28; background:#fcfcfa; }
*, *::before, *::after { box-sizing:border-box; }
body { margin:0; }
h1, .brand, .preview-headline, .preview-header > span { font-family:Georgia,"Times New Roman",serif; font-weight:400; }
.policy { max-width:34rem; margin:8vh auto; padding:1.5rem; font-size:1.125rem; }
a { color:inherit; }
.preview { --edge:clamp(1.25rem,4.2vw,5rem); position:fixed; inset:-3px; overflow:hidden; pointer-events:none; user-select:none; filter:blur(15px); transform:scale(1.025); background:#202222; }
.preview-header { background:#fcfcfa; height:5rem; padding-inline:var(--edge); display:flex; justify-content:space-between; align-items:center; }
.preview-header > span { font-size:1.875rem; letter-spacing:-.055em; }
.preview-hero { position:relative; isolation:isolate; min-height:calc(100svh - 5rem); display:grid; grid-template-rows:1fr auto; align-items:center; color:white; background:linear-gradient(110deg,#202222 25%,#494c39 70%,#79694f); }
.preview-hero picture { position:absolute; inset:0; z-index:-1; }
.preview-hero img { width:min(92%,1400px); height:100%; display:block; margin-left:auto; object-fit:cover; object-position:right 45%; mask-image:linear-gradient(90deg,transparent,#000 26%); }
.preview-hero picture::after { content:""; position:absolute; inset:0; background:linear-gradient(90deg,#202222ed,#202222bb 38%,transparent 76%),linear-gradient(0deg,#20222299,transparent 38%); }
.preview-copy { margin:2.5rem var(--edge) 1.5rem; }
.preview-headline { font-size:clamp(3.5rem,4.8vw,4.5rem); letter-spacing:-.055em; line-height:1.02; }
.preview-copy p { max-width:25rem; margin:1.5rem 0; }
.preview-actions, .preview-values { display:flex; gap:1rem; }
.preview-actions span { border:1px solid #fff; padding:.75rem 1.25rem; border-radius:2rem; }
.preview-actions span:first-child { background:white; color:#252a28; }
.preview-values { margin:1rem var(--edge) 3rem; max-width:35rem; }
.entrance { position:relative; display:grid; place-items:center; min-height:100vh; min-height:100svh; background:rgba(23,29,25,.24);
  padding:max(1.25rem,env(safe-area-inset-top)) max(20px,env(safe-area-inset-right)) max(1.25rem,env(safe-area-inset-bottom)) max(20px,env(safe-area-inset-left)); }
.panel { width:min(100%,32rem); min-width:0; padding:clamp(1.375rem,3.5vw,2.5rem); overflow-wrap:anywhere; border-radius:22px; border:1px solid #d6d8d1; background:#fcfcfa; background:rgba(252,252,250,.985); box-shadow:0 16px 48px #171d193b; }
.panel p { margin:0; }
.brand { font-size:1.125rem; letter-spacing:-.035em; }
.panel h1 { margin:.9rem 0 .7rem; font-size:clamp(2rem,4vw,2.7rem); letter-spacing:-.045em; line-height:1.08; }
.panel form { display:flex; flex-wrap:wrap; gap:.65rem; margin:1.5rem 0 1rem; }
.panel button { flex:1 1 9rem; min-height:46px; font:inherit; font-weight:600; padding:.65em .85em; border-radius:.65rem; border:1px solid #1c332c; background:#1c332c; color:white; cursor:pointer; }
.panel button[value=under19] { border-color:#757e78; color:#252a28; background:#fcfcfa; }
.panel button:hover { background:#29483d; }
.panel button[value=under19]:hover { background:#edeeea; }
.note, nav { font-size:.875rem; color:#515b54; }
nav { display:flex; align-items:center; gap:.35rem; margin-top:.35rem; }
nav a { display:inline-flex; align-items:center; justify-content:center; min-width:44px; min-height:44px; text-underline-offset:.18em; }
:focus-visible { outline:3px solid #254f5b; outline-offset:3px; }
@media(max-width:1023px) {
  .preview-hero { display:flex; flex-direction:column; align-items:stretch; }
  .preview-copy { order:-1; }
  .preview-hero picture, .preview-hero img { position:relative; width:100%; height:auto; mask-image:none; }
  .preview-hero picture::after { background:linear-gradient(0deg,#202222,transparent 24%); }
  .preview-headline { font-size:clamp(2.5rem,6.25vw,3rem); }
  .preview-header div { display:none; }
  .preview-header::after { content:"Menu"; }
}
@media(max-width:480px) {
  .panel form { flex-direction:column; }
  .panel button { flex:none; }
  .preview-actions { flex-wrap:wrap; }
}
@media(prefers-reduced-transparency:reduce), (prefers-contrast:more) { .panel { background:#fcfcfa; border-color:#626965; box-shadow:none; } }
@media(forced-colors:active) { .preview { display:none; } .panel { border:1px solid CanvasText; } }
`;
