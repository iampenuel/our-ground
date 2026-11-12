import {adultHelpDemoPath, demoEntrance} from './age-page.ts';
import {demoLinks, previewScene} from './adult-help-preview.ts';

const cancel: [string, string] = ['/', 'Cancel demonstration'];
const finish: [string, string] = ['/', 'Finish adult assistance demo'];

function scene(action: string): {title: string; body: string} | undefined {
  switch (action) {
    case 'intro': return {
      title: 'Adult handoff demonstration',
      body: '<p>An adult helping someone could independently verify their eligibility before accessing Our Ground. This demonstration shows that process without collecting identity information.</p>' +
        demoLinks(['start', 'Start adult handoff demo'], cancel),
    };
    case 'start': return {
      title: 'Simulated verification',
      body: '<p>Choose the outcome to see how the handoff could respond.</p>' +
        demoLinks(['success', 'Simulate verification success'], ['failure', 'Simulate verification failure'], cancel),
    };
    case 'failure': return {
      title: 'Simulation unsuccessful',
      body: '<p>The simulated check did not pass. Access to the real website remains restricted for an under-19 visitor.</p>' +
        demoLinks(['start', 'Try the simulation again'], cancel),
    };
    case 'success': return {
      title: 'Simulation successful — Adult assistance preview',
      body: '<p>Explore fictional ways an adult could find support or help others.</p>' +
        demoLinks(['find', 'Find Support'], ['give', 'Give Support'], finish),
    };
    default: {
      const preview = previewScene(action);
      return preview && {title: preview.title, body: preview.body + demoLinks(finish)};
    }
  }
}

export function adultHelpDemo(method: string, pathname: string): Response | null {
  if (pathname !== adultHelpDemoPath && !pathname.startsWith(adultHelpDemoPath + '/')) return null;
  const action = pathname === adultHelpDemoPath ? 'intro' : pathname.slice(adultHelpDemoPath.length + 1);
  const demo = scene(action);
  if (!demo) return null;
  if (method !== 'GET' && method !== 'HEAD') {
    return new Response(null, {status: 405, headers: {Allow: 'GET, HEAD', 'Cache-Control': 'no-store'}});
  }
  return demoEntrance(demo.title, demo.body);
}
