import type {SupportResult} from './support-model.ts';
export type MappedStatus = 'available' | 'disabled' | 'error';
/** Availability describes a completed source query; a successful zero is not an outage. */
export function supportSummary(items:SupportResult[], context:{food:boolean;location?:string;directoryUnavailable:boolean;mappedStatus:MappedStatus;demo:boolean;filtered:boolean;radius?:number}) {
  const directory=items.filter(item=>item.kind==='directory').length,mapped=items.length-directory;
  const near=context.location?' near '+context.location:'';
  if(context.demo)return `${items.length} fictional demonstration ${items.length===1?'record':'records'}.`;
  if(context.filtered&&!items.length)return 'No loaded results match this filter.';
  if(context.food){
    if(directory)return `${directory} food-support ${directory===1?'record':'records'}${near}${mapped?` · ${mapped} mapped ${mapped===1?'lead':'leads'}`:''}.`;
    if(mapped)return `${mapped} mapped food-support ${mapped===1?'lead':'leads'}${near}.`;
    if(context.directoryUnavailable||context.mappedStatus==='error')return (!context.directoryUnavailable&&context.radius?`No directory food-support listings found within ${context.radius} miles${near}. `:'')+'Food search is partly unavailable. Try the referral services below.';
    return context.radius?`No food-support listings found within ${context.radius} miles${near}. Try a wider distance or the referral services below.`:`Find food support through the referral services below${near}.`;
  }
  return `${items.length} matching ${items.length===1?'record':'records'}${near}${context.directoryUnavailable||context.mappedStatus==='error'?' · some sources unavailable':''}.`;
}
export function sourceAvailability(context:{food:boolean;directoryUnavailable:boolean;mappedStatus:MappedStatus}) {
  const parts:string[]=[];
  if(context.directoryUnavailable)parts.push('Directory records are temporarily unavailable.');
  if(context.mappedStatus==='error')parts.push('We couldn’t reach the mapped places service right now.');
  if(context.mappedStatus==='disabled')parts.push('Mapped supplements are not enabled for this preview.');
  if(!parts.length)parts.push(context.food?'Directory records and mapped food-support leads were checked.':'Directory and mapped sources were checked.');
  return parts.join(' ');
}
