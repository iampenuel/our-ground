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
.panel {
  width:min(100%,26.25rem);
  min-width:0;
  padding:clamp(1.25rem,5.5vw,1.875rem);
  overflow-wrap:anywhere;
  border:1px solid #d6d8d1;
  border-radius:10px;
  background:#fcfcfa;
  box-shadow:0 8px 28px #171d192e;
  font-size:.9375rem;
}
.panel p { margin:0; }
.panel .brand { font-size:.9375rem; letter-spacing:-.02em; }
.panel h1 {
  margin:.625rem 0 .5rem;
  font-size:2rem;
  letter-spacing:-.035em;
  line-height:1.125;
}
.panel form {
  display:flex;
  flex-wrap:wrap;
  gap:.5rem;
  margin:1.125rem 0 .75rem;
}
.panel button {
  flex:1 1 10em;
  min-width:0;
  min-height:44px;
  padding:.625em .75em;
  border:1px solid #1c332c;
  border-radius:6px;
  background:#1c332c;
  color:white;
  font:600 .875rem/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  cursor:pointer;
}
.panel button[value=under19] { border-color:#757e78; color:#252a28; background:#fcfcfa; }
.panel button:hover { background:#29483d; }
.panel button[value=under19]:hover { background:#edeeea; }
.note, nav { font-size:.8125rem; color:#515b54; }
nav { display:flex; flex-wrap:wrap; align-items:center; gap:.25rem; margin-top:.25rem; }
nav a { display:inline-flex; align-items:center; min-width:44px; min-height:44px; text-underline-offset:.18em; }
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
  .panel button { flex-basis:100%; }
  .preview-actions { flex-wrap:wrap; }
}
@media(prefers-reduced-transparency:reduce), (prefers-contrast:more) { .panel { background:#fcfcfa; border-color:#626965; box-shadow:none; } }
@media(forced-colors:active) { .preview { display:none; } .panel { border:1px solid CanvasText; } }
`;
