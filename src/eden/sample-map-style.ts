import type { StyleSpecification } from 'maplibre-gl';
type Center = { latitude: number; longitude: number };
type Region = { type: 'Feature'; properties: { kind: 'park' | 'water' | 'block' }; geometry: { type: 'Polygon'; coordinates: number[][][] } };
type Road = { type: 'Feature'; properties: { kind: 'minor' | 'avenue' }; geometry: { type: 'LineString'; coordinates: number[][] } };

/** Invented geometry measured from a sample area center. It is not street data,
 * routing information or a depiction of the named city's actual neighborhoods.
 */
export function edenSampleMapData(center: Center) {
  const point = (x: number, y: number) => [center.longitude + x / (69 * Math.cos(center.latitude * Math.PI / 180)), center.latitude + y / 69];
  const polygon = (kind: Region['properties']['kind'], coordinates: number[][]): Region => ({ type: 'Feature', properties: { kind }, geometry: { type: 'Polygon', coordinates: [coordinates.map(([x,y]) => point(x,y))] } });
  const regions: Region[] = [];
  const parks = [
    [[-12,8],[-8,8],[-7,12],[-10,14],[-13,12],[-12,8]],
    [[5,2],[9,2],[10,6],[8,8],[5,6],[5,2]],
    [[-9,-12],[-5,-12],[-4,-8],[-7,-6],[-10,-8],[-9,-12]],
    [[12,-7],[17,-7],[18,-3],[15,-1],[12,-3],[12,-7]],
  ];
  for (const park of parks) regions.push(polygon('park', park));
  const river = (y: number) => -2.8 + Math.sin(y / 5) * 1.1 + Math.sin(y / 2.4) * .25;
  const shore = Array.from({ length: 41 }, (_, i) => -30 + i * 1.5);
  regions.push(polygon('water', [...shore.map(y => [river(y) - .48, y]), ...[...shore].reverse().map(y => [river(y) + .48, y]), [river(-30) - .48, -30]]));
  for (let x = -22; x <= 22; x += 3) {
    for (let y = -22; y <= 22; y += 3) {
      if (Math.abs(x - river(y)) < 2 || parks.some(park => x > Math.min(...park.map(p => p[0])) - 1 && x < Math.max(...park.map(p => p[0])) + 1 && y > Math.min(...park.map(p => p[1])) - 1 && y < Math.max(...park.map(p => p[1])) + 1)) continue;
      regions.push(polygon('block', [[x+.35,y+.35],[x+1.1,y+.35],[x+1.1,y+1.3],[x+.35,y+1.3],[x+.35,y+.35]]));
      regions.push(polygon('block', [[x+1.4,y+.35],[x+2.25,y+.35],[x+2.25,y+1.3],[x+1.4,y+1.3],[x+1.4,y+.35]]));
      regions.push(polygon('block', [[x+.35,y+1.6],[x+2.25,y+1.6],[x+2.25,y+2.25],[x+.35,y+2.25],[x+.35,y+1.6]]));
    }
  }
  const roads: Road[] = [];
  const line = (kind: Road['properties']['kind'], coordinates: number[][]): Road => ({ type: 'Feature', properties: { kind }, geometry: { type: 'LineString', coordinates: coordinates.map(([x,y]) => point(x,y)) } });
  for (let offset = -25; offset <= 25; offset += 3) {
    roads.push(line('minor', [[-30,offset],[30,offset]]));
    roads.push(line('minor', [[offset,-30],[offset,30]]));
  }
  for (const offset of [-10, 2, 14]) {
    roads.push(line('avenue', Array.from({ length: 17 }, (_, i) => { const x = -32 + i * 4; return [x, offset + Math.sin(x / 7) * .7]; })));
  }
  roads.push(line('avenue', Array.from({ length: 17 }, (_, i) => { const y = -32 + i * 4; return [7 + Math.sin(y / 8), y]; })));
  return {
    regions: { type: 'FeatureCollection' as const, features: regions },
    roads: { type: 'FeatureCollection' as const, features: roads },
  };
}
export function edenSampleMapStyle(center: Center): StyleSpecification {
  const data = edenSampleMapData(center);
  return {
    version: 8,
    sources: { 'sample-regions': { type: 'geojson', data: data.regions }, 'sample-roads': { type: 'geojson', data: data.roads } },
    layers: [
      { id: 'sample-background', type: 'background', paint: { 'background-color': '#eaece2' } },
      { id: 'sample-blocks', type: 'fill', source: 'sample-regions', filter: ['==',['get','kind'],'block'], paint: { 'fill-color': '#ddded4', 'fill-opacity': .6 } },
      { id: 'sample-parks', type: 'fill', source: 'sample-regions', filter: ['==',['get','kind'],'park'], paint: { 'fill-color': '#ccd8bf', 'fill-outline-color': '#becdb0' } },
      { id: 'sample-water', type: 'fill', source: 'sample-regions', filter: ['==',['get','kind'],'water'], paint: { 'fill-color': '#b8d0d5', 'fill-outline-color': '#a8c3ca' } },
      { id: 'sample-streets', type: 'line', source: 'sample-roads', filter: ['==',['get','kind'],'minor'], layout: { 'line-cap': 'round' }, paint: { 'line-color': '#f8f7ef', 'line-width': ['interpolate',['linear'],['zoom'],7,.6,10,1.8,13,6,16,16] } },
      { id: 'sample-avenue-border', type: 'line', source: 'sample-roads', filter: ['==',['get','kind'],'avenue'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#d1c9b4', 'line-width': ['interpolate',['linear'],['zoom'],7,1.5,10,4.5,13,10,16,24] } },
      { id: 'sample-avenues', type: 'line', source: 'sample-roads', filter: ['==',['get','kind'],'avenue'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fffaf0', 'line-width': ['interpolate',['linear'],['zoom'],7,.8,10,2.7,13,7,16,20] } },
    ],
  };
}
