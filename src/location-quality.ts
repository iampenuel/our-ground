import type { LocationQuality } from '../shared/location-search.ts';
import { sourceWebsite } from '../shared/place-evidence.ts';

/** Presentation only: provider confidence and reference similarity are never combined or shown as a percentage. */
export function locationQualityPresentation(quality: LocationQuality | undefined) {
  if (!quality) return null;
  const providerArea = quality.source === 'geoapify' ? quality.provider?.resultType : undefined;
  const area = quality.precision === 'state' ? 'state' : quality.precision === 'postcode' ? 'postal area' : providerArea === 'county' ? 'county' : ['suburb','district'].includes(providerArea??'') ? 'area' : 'city';
  const fallbackArea = quality.precision === 'state' ? 'state' : quality.precision === 'city' && area === 'city' ? 'city' : 'area';
  const label = quality.kind === 'city_fallback' ? `Search this ${fallbackArea} instead`
    : quality.kind === 'canonical_correction' ? `Suggested ${area} correction`
    : quality.kind === 'canonical_exact' ? `${area === 'city' ? 'City' : area === 'state' ? 'State' : 'Postal area'} reference`
    : quality.kind === 'uncertain' ? 'Check this location'
    : quality.precision === 'building' ? 'Address match'
    : quality.precision === 'street' ? 'Street match'
    : quality.precision === 'city' ? area === 'county' ? 'County match' : area === 'area' ? 'Area match' : 'City match'
    : quality.precision === 'state' ? 'State match'
    : quality.precision === 'postcode' ? 'Postal area match' : 'Location match';
  const coordinateLabel = quality.coordinateSource === 'geoapify' ? 'Coordinates: Geoapify' : quality.coordinateSource === 'reference' ? 'Coordinates: geographic reference' : '';
  const representative = quality.source === 'reference' || ['city', 'state', 'postcode'].includes(quality.precision);
  const scope = representative ? `Uses a representative ${area} point. This does not confirm a street address.` : '';
  const url = sourceWebsite(quality.reference?.sourceUrl);
  return {
    label, coordinateLabel, explanation: quality.explanation, sourceName: quality.sourceName,
    scope, sourceUrl: url?.startsWith('https://') ? url : null,
    announcement: [label, coordinateLabel, representative ? `Representative ${area} point, not a confirmed street address.` : ''].filter(Boolean).join('. ')
  };
}
