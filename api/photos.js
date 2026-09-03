export default async function handler(req, res) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return res.status(500).json({ error: 'Missing GOOGLE_MAPS_API_KEY' });

  const photo = typeof req.query?.photo === 'string' ? req.query.photo : '';

  if (photo) {
    if (!photo.startsWith('places/')) return res.status(400).send('Invalid photo');
    const url = `https://places.googleapis.com/v1/${photo}/media?maxWidthPx=1600&maxHeightPx=1200&key=${encodeURIComponent(key)}`;
    const response = await fetch(url);
    if (!response.ok) return res.status(response.status).send('Unable to load photo');
    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(buffer);
  }

  const search = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.photos'
    },
    body: JSON.stringify({
      textQuery: 'NangNan Barber Shop and Salon, Rayong, Thailand',
      languageCode: 'en',
      maxResultCount: 1
    })
  });

  if (!search.ok) return res.status(search.status).json({ error: 'Google Places search failed' });
  const data = await search.json();
  const place = data.places?.[0];
  if (!place) return res.status(404).json({ error: 'NangNan could not be found' });

  const photos = (place.photos || []).map((p) => ({
    name: p.name,
    width: p.widthPx,
    height: p.heightPx,
    attributions: p.authorAttributions || [],
    mapsUri: p.googleMapsUri || null
  }));

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    placeId: place.id,
    placeName: place.displayName?.text || 'NangNan Barber Shop and Salon',
    photos
  });
}
