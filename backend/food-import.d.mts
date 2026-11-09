export interface NormalizedFoodRecord {
 record_id:string;source_updated_at:string;name:string;organization_name:string;street:string;city:string;state:string;postal_code:string;latitude:number;longitude:number;phone:string|null;website:string|null;eligibility_text:string|null;description:string;summary:string;cost_summary:string|null;hours:Array<{weekday:number;opens_at:string;closes_at:string;notes:string|null;sequence:number}>;organization_id:string;service_id:string;location_id:string;hash:string;snapshot:Record<string,unknown>;
}
export interface ReviewedFoodSource {id:string;name:string;url:string;authority:string;license:string;attribution:string;download:string;metadata?:string;state:string}
export interface NormalizedFoodDataset {source:ReviewedFoodSource;checksum:string;source_updated_at:string;records:NormalizedFoodRecord[];duplicate_coordinate_evidence?:NormalizedFoodRecord[];coordinate_candidates?:NormalizedFoodRecord[];coordinate_validation?:{raw_checksum:string;policy:string;reference_fingerprint:string;[key:string]:unknown};excluded:Array<{record_id:string;reason:string;source_record_ids?:string[];duplicate_of?:string}>;summary:Record<string,unknown>}
export const FOOD_SOURCES:Readonly<Record<string,ReviewedFoodSource>>;
export function downloadFoodSnapshot(id:string,options?:{fetcher?:typeof fetch;signal?:AbortSignal}):Promise<unknown>;
export function normalizeFoodSnapshot(id:string,input:unknown):NormalizedFoodDataset;
export function importFood(sql:unknown,dataset:NormalizedFoodDataset,options?:{apply?:boolean;fullSnapshot?:boolean}):Promise<Record<string,unknown>>;
export function normalizeOsmFoodExtract(input:unknown):Array<Record<string,unknown>>;
export function hash(value:string|Uint8Array):string;
export function foodUuid(source:string,kind:string,id:string):string;
export function foodWebsite(value:unknown):string|null;
export function foodPhone(value:unknown):string|null;

export const FOOD_COORDINATE_POLICY:string;
export function foodAddressKey(street:string,postal:string):string;
export function validateFoodCoordinates(dataset:NormalizedFoodDataset,references:Array<{city:string;state:string;reference_id:string;latitude:number;longitude:number}>):NormalizedFoodDataset;
export function validateFoodGeography(sql:unknown,dataset:NormalizedFoodDataset):Promise<NormalizedFoodDataset>;
