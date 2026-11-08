/** Provider credit stays plain text; required vendor names link only to fixed official destinations. */
export function renderLocationCredit(container:HTMLElement,value:string,tabIndex=0) {
  const doc=container.ownerDocument,nodes:Node[]=[];
  const targets:Record<string,string>={Geoapify:'https://www.geoapify.com/','OpenStreetMap contributors':'https://www.openstreetmap.org/copyright','U.S. Census Bureau':'https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html'};
  let cursor=0;
  for(const match of value.matchAll(/Geoapify|OpenStreetMap contributors|U\.S\. Census Bureau/g)) {
    if(match.index>cursor)nodes.push(doc.createTextNode(value.slice(cursor,match.index)));
    const anchor=doc.createElement('a');anchor.href=targets[match[0]];anchor.target='_blank';anchor.rel='noopener noreferrer';anchor.tabIndex=tabIndex;anchor.textContent=match[0];nodes.push(anchor);cursor=match.index+match[0].length;
  }
  if(cursor<value.length)nodes.push(doc.createTextNode(value.slice(cursor)));
  container.replaceChildren(...nodes);
}
