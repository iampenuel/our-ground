import {hrsaRequiredHeaders} from '../backend/hrsa-import.mjs';
export const baseRow={
 'BPHC Assigned Number':'BPS-H80-999990','Health Center Number':'H80TEST999', 'Health Center Name':'Synthetic import regression organization',
 'Site Name':'Synthetic import regression clinic','Site Address':'1 Test Street','Site City':'Boston','Site State Abbreviation':'MA','Site Postal Code':'02108-1234',
 'Site Telephone Number':'617-555-0100','Site Web Address':'example.invalid/clinic','Site Status Description':'Active',
 'Health Center Type Description':'Service Delivery Site','Health Center Service Delivery Site Location Setting Description':'Other Clinic Type','Health Center Location Type Description':'Permanent',
 'Geocoding Artifact Address Primary X Coordinate':'-71.0589','Geocoding Artifact Address Primary Y Coordinate':'42.3601','Data Warehouse Record Create Date':'11/05/2026'
};
export function csv(rows,headers=hrsaRequiredHeaders){const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';return headers.map(quote).join(',')+'\r\n'+rows.map(row=>headers.map(h=>quote(row[h])).join(',')).join('\r\n');}
