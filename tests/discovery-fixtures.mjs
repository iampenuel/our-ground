// Deterministic test fixtures only. None of these places/contacts are real.
export const testEnv = {
  GOOGLE_DISCOVERY_ENABLED: 'true', GOOGLE_DISCOVERY_LIVE_APPROVED: 'true', GOOGLE_DISCOVERY_PROJECT_ID: 'mock-test-project',
  GOOGLE_GEOCODING_API_KEY: 'not-a-real-geocode-key', GOOGLE_PLACES_API_KEY: 'not-a-real-places-key',
  GOOGLE_DISCOVERY_TERMS_URL: 'https://example.com/terms', GOOGLE_DISCOVERY_PRIVACY_URL: 'https://example.com/privacy'
};
export const towns = {
  Harrisburg: [40.2732, -76.8867], Philadelphia: [39.9526, -75.1636], Middletown: [40.1998, -76.7311]
};
export function geocode(city = 'Harrisburg', state = 'PA') {
  const [lat,lng] = towns[city] ?? towns.Harrisburg;
  return { place_id: 'mock_location_'+city, formatted_address: city+', '+state+', USA', types: ['locality'],
    address_components: [{ short_name: state, types: ['administrative_area_level_1'] }, { short_name: 'US', types: ['country'] }], geometry: { location: { lat,lng } } };
}
export function googlePlace(overrides = {}) {
  return { id: 'mock_place_pantry', displayName: { text: 'Mock Food Pantry — test fixture, do not visit' },
    formattedAddress: 'Fictional test address, Harrisburg, PA', addressComponents: [{ shortText: 'PA', types: ['administrative_area_level_1'] }, { shortText: 'US', types: ['country'] }],
    location: { latitude: towns.Harrisburg[0], longitude: towns.Harrisburg[1] }, types: ['point_of_interest','establishment'], primaryType: 'non_profit_organization', businessStatus: 'OPERATIONAL',
    googleMapsUri: 'https://www.google.com/maps/place/?q=place_id:mock_place_pantry', attributions: [{ provider: 'Mock attribution', providerUri: 'https://example.com/source' }], ...overrides };
}
