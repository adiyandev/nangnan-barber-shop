export default async function handler(req, res) {
  const key = process.env.SERPAPI_KEY;
  if (!key) return res.status(500).json({ error: 'Missing SERPAPI_KEY' });

  const photo = typeof req.query?.photo === 'string' ? req.query.photo : '';

  // Proxy Google-hosted images through our domain.
  if (photo) {
    try {
      const imageUrl = decodeURIComponent(photo);
      if (!imageUrl.startsWith('https://lh')) return res.status(400).send('Invalid photo URL');
      const response = await fetch(imageUrl);
      if (!response.ok) return res.status(response.status).send('Unable to load photo');
      const buffer = Buffer.from(await response.arrayBuffer());
      res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(200).send(buffer);
    } catch {
      return res.status(500).send('Unable to load photo');
    }
  }

  try {
    // Find the Google Maps listing and get its data_id.
    const searchParams = new URLSearchParams({
      engine: 'google_maps',
      type: 'search',
      q: 'NangNan Barber Shop and Salon, Rayong, Thailand',
      hl: 'en',
      api_key: key
    });
    const searchResponse = await fetch(`https://serpapi.com/search.json?${searchParams}`);
    if (!searchResponse.ok) return res.status(searchResponse.status).json({ error: 'SerpApi Maps search failed' });

    const searchData = await searchResponse.json();
    const results = searchData.local_results || [];
    const place = results.find((item) => /nangnan/i.test(item.title || '')) || results[0];
    if (!place?.data_id) return res.status(404).json({ error: 'NangNan could not be found on Google Maps' });

    // Google Maps Photos returns 20 photos per page. Follow pagination until
    // there is no next_page_token, so the gallery receives every available page.
    const photos = [];
    let nextPageToken = '';
    const seenTokens = new Set();
    const maxPages = 100;

    for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
      const params = new URLSearchParams({
        engine: 'google_maps_photos',
        data_id: place.data_id,
        hl: 'en',
        api_key: key
      });
      if (nextPageToken) params.set('next_page_token', nextPageToken);

      const photoResponse = await fetch(`https://serpapi.com/search.json?${params}`);
      if (!photoResponse.ok) return res.status(photoResponse.status).json({ error: 'SerpApi Photos request failed' });

      const photoData = await photoResponse.json();
      for (const item of photoData.photos || []) {
        if (item.image) {
          photos.push({
            name: item.image,
            thumbnail: item.thumbnail || item.image,
            width: null,
            height: null,
            attributions: [],
            mapsUri: place.link || null
          });
        }
      }

      const token = photoData.serpapi_pagination?.next_page_token;
      if (!token || seenTokens.has(token)) break;
      seenTokens.add(token);
      nextPageToken = token;
    }

    const uniquePhotos = [...new Map(photos.map((item) => [item.name, item])).values()];

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      placeId: place.place_id || null,
      dataId: place.data_id,
      placeName: place.title || 'NangNan Barber Shop and Salon',
      photos: uniquePhotos,
      total: uniquePhotos.length,
      source: 'Google Maps via SerpApi'
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to load Google Maps photos' });
  }
}
