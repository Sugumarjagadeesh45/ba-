//  const express = require('express');
// const router = express.Router();
// const axios = require('axios');
// const rateLimit = require('express-rate-limit');
// require('dotenv').config();

// // Rate limiting to prevent abuse
// const apiLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // limit each IP to 100 requests per windowMs
//   message: {
//     success: false,
//     error: 'Too many requests, please try again later.'
//   }
// });

// // Apply rate limiting to all routes
// router.use(apiLimiter);

// // Helper function to decode Google's polyline format
// const decodePolyline = (encoded) => {
//   if (!encoded) return [];
  
//   let points = [];
//   let index = 0, len = encoded.length;
//   let lat = 0, lng = 0;

//   while (index < len) {
//     let b, shift = 0, result = 0;
//     do {
//       b = encoded.charCodeAt(index++) - 63;
//       result |= (b & 0x1f) << shift;
//       shift += 5;
//     } while (b >= 0x20);
//     let dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
//     lat += dlat;

//     shift = 0;
//     result = 0;
//     do {
//       b = encoded.charCodeAt(index++) - 63;
//       result |= (b & 0x1f) << shift;
//       shift += 5;
//     } while (b >= 0x20);
//     let dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
//     lng += dlng;

//     points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
//   }
//   return points;
// };

// // ✅ Google Routes API endpoint
// router.post('/calculate-route', async (req, res) => {
//   try {
//     const { origin, destination, vehicleType = 'DRIVE' } = req.body;
    
//     console.log('🗺️ Route calculation requested:', {
//       origin,
//       destination,
//       vehicleType
//     });
    
//     if (!origin || !destination || !origin.latitude || !origin.longitude || 
//         !destination.latitude || !destination.longitude) {
//       return res.status(400).json({ 
//         success: false, 
//         error: 'Valid origin and destination coordinates are required' 
//       });
//     }

//     const googleApiKey = process.env.GOOGLE_API_KEY;
    
//     if (!googleApiKey) {
//       return res.status(500).json({
//         success: false,
//         error: 'Google API key not configured'
//       });
//     }
    
//     // Google Routes API (newer and better than Directions API)
//     const googleUrl = 'https://routes.googleapis.com/directions/v2:computeRoutes';
    
//     const requestBody = {
//       origin: {
//         location: {
//           latLng: {
//             latitude: origin.latitude,
//             longitude: origin.longitude
//           }
//         }
//       },
//       destination: {
//         location: {
//           latLng: {
//             latitude: destination.latitude,
//             longitude: destination.longitude
//           }
//         }
//       },
//       travelMode: vehicleType,
//       routingPreference: "TRAFFIC_AWARE",
//       computeAlternativeRoutes: false,
//       routeModifiers: {
//         avoidTolls: false,
//         avoidHighways: false,
//         avoidFerries: false
//       },
//       languageCode: "en-US",
//       units: "METRIC"
//     };

//     console.log('📡 Calling Google Routes API...');
    
//     const response = await axios.post(googleUrl, requestBody, {
//       headers: {
//         'Content-Type': 'application/json',
//         'X-Goog-Api-Key': googleApiKey,
//         'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline'
//       },
//       timeout: 10000
//     });

//     if (response.data.routes && response.data.routes.length > 0) {
//       const route = response.data.routes[0];
      
//       // Decode the polyline
//       const coords = decodePolyline(route.polyline?.encodedPolyline);
      
//       const currentDistance = route.distanceMeters ? (route.distanceMeters / 1000).toFixed(2) : '0.00';
//       const currentTime = route.duration ? Math.round(parseInt(route.duration) / 60) : 0;
      
//       console.log(`✅ Google Route calculated: ${currentDistance} km, ${currentTime} mins`);
      
//       res.json({
//         success: true,
//         data: {
//           coords: coords.length > 0 ? coords : [origin, destination],
//           distance: currentDistance,
//           time: currentTime,
//           polyline: route.polyline?.encodedPolyline,
//           duration: route.duration || '0s'
//         }
//       });
//     } else {
//       throw new Error('No routes found from Google API');
//     }
    
//   } catch (error) {
//     console.error('❌ Google Routes API error:', error.response?.data || error.message);
    
//     // Return fallback data for development
//     const { origin, destination } = req.body;
//     if (origin && destination) {
//       console.log('🔄 Using fallback straight-line calculation');
//       const fallbackCoords = [origin, destination];
//       const fallbackDistance = calculateStraightLineDistance(origin, destination);
//       const fallbackTime = Math.round(fallbackDistance * 3); // 3 mins per km
      
//       res.json({
//         success: true,
//         data: {
//           coords: fallbackCoords,
//           distance: fallbackDistance.toFixed(2),
//           time: fallbackTime,
//           polyline: null,
//           duration: `${fallbackTime * 60}s`,
//           isFallback: true
//         }
//       });
//     } else {
//       res.status(500).json({
//         success: false,
//         error: 'Failed to calculate route',
//         details: error.message
//       });
//     }
//   }
// });

// // ✅ Google Places Autocomplete endpoint
// router.get('/autocomplete', async (req, res) => {
//   try {
//     const { query } = req.query;
    
//     console.log('🔍 Places autocomplete requested:', query);
    
//     if (!query || query.length < 2) {
//       return res.json({
//         success: true,
//         data: []
//       });
//     }

//     const googleApiKey = process.env.GOOGLE_API_KEY;
    
//     if (!googleApiKey) {
//       return res.json({
//         success: true,
//         data: []
//       });
//     }
    
//     const googleUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${googleApiKey}&components=country:in&language=en`;
    
//     const response = await axios.get(googleUrl, { timeout: 5000 });
    
//     if (response.data.status === 'OK' && response.data.predictions) {
//       const suggestions = response.data.predictions.map(prediction => ({
//         id: prediction.place_id,
//         name: prediction.structured_formatting?.main_text || prediction.description,
//         address: prediction.description,
//         lat: null,
//         lon: null,
//         type: 'place',
//         placeId: prediction.place_id
//       }));
      
//       console.log(`✅ Found ${suggestions.length} suggestions for: "${query}"`);
      
//       res.json({
//         success: true,
//         data: suggestions
//       });
//     } else {
//       console.log(`⚠️ No suggestions found for: "${query}"`);
//       res.json({
//         success: true,
//         data: []
//       });
//     }
    
//   } catch (error) {
//     console.error('❌ Google Places Autocomplete error:', error.message);
//     res.json({
//       success: true,
//       data: []
//     });
//   }
// });

// // ✅ Get Place Details for coordinates
// router.get('/place-details/:placeId', async (req, res) => {
//   try {
//     const { placeId } = req.params;
    
//     console.log('📍 Fetching place details for:', placeId);
    
//     const googleApiKey = process.env.GOOGLE_API_KEY;
    
//     if (!googleApiKey) {
//       return res.json({
//         success: true,
//         data: {
//           lat: null,
//           lon: null,
//           name: 'Unknown location',
//           address: 'Location details unavailable'
//         }
//       });
//     }
    
//     const googleUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${googleApiKey}&fields=geometry,name,formatted_address`;
    
//     const response = await axios.get(googleUrl, { timeout: 5000 });
    
//     if (response.data.status === 'OK' && response.data.result) {
//       const place = response.data.result;
//       const lat = place.geometry?.location?.lat;
//       const lon = place.geometry?.location?.lng;
      
//       console.log(`✅ Place details found: ${place.name}, Lat: ${lat}, Lon: ${lon}`);
      
//       res.json({
//         success: true,
//         data: {
//           lat: lat || null,
//           lon: lon || null,
//           name: place.name,
//           address: place.formatted_address
//         }
//       });
//     } else {
//       console.log(`⚠️ Place details not found for: ${placeId}`);
//       res.status(404).json({
//         success: false,
//         error: 'Place not found'
//       });
//     }
    
//   } catch (error) {
//     console.error('❌ Google Place Details error:', error.message);
//     res.status(500).json({
//       success: false,
//       error: 'Failed to get place details'
//     });
//   }
// });

// // ✅ Google Reverse Geocoding endpoint
// router.get('/reverse-geocode', async (req, res) => {
//   try {
//     const { lat, lon } = req.query;
    
//     console.log(`📍 Reverse geocoding: ${lat}, ${lon}`);
    
//     if (!lat || !lon) {
//       return res.status(400).json({
//         success: false,
//         error: 'Latitude and longitude are required'
//       });
//     }

//     const googleApiKey = process.env.GOOGLE_API_KEY;
    
//     if (!googleApiKey) {
//       return res.json({
//         success: true,
//         data: {
//           address: `Location (${parseFloat(lat).toFixed(4)}, ${parseFloat(lon).toFixed(4)})`
//         }
//       });
//     }
    
//     const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${googleApiKey}`;
    
//     const response = await axios.get(googleUrl, { timeout: 5000 });
    
//     if (response.data.status === 'OK' && response.data.results.length > 0) {
//       const address = response.data.results[0].formatted_address;
//       console.log(`✅ Reverse geocode successful: ${address.substring(0, 50)}...`);
      
//       res.json({
//         success: true,
//         data: {
//           address: address,
//           fullData: response.data.results[0]
//         }
//       });
//     } else {
//       console.log(`⚠️ No reverse geocode results for: ${lat}, ${lon}`);
//       res.json({
//         success: true,
//         data: {
//           address: `Location (${parseFloat(lat).toFixed(4)}, ${parseFloat(lon).toFixed(4)})`
//         }
//       });
//     }
    
//   } catch (error) {
//     console.error('❌ Google Reverse Geocoding error:', error.message);
//     res.json({
//       success: true,
//       data: {
//         address: `Location (${parseFloat(req.query.lat).toFixed(4)}, ${parseFloat(req.query.lon).toFixed(4)})`
//       }
//     });
//   }
// });

// // ✅ Batch fetch place details (for multiple suggestions)
// router.post('/batch-place-details', async (req, res) => {
//   try {
//     const { placeIds } = req.body;
    
//     if (!Array.isArray(placeIds) || placeIds.length === 0) {
//       return res.json({
//         success: true,
//         data: []
//       });
//     }
    
//     const googleApiKey = process.env.GOOGLE_API_KEY;
    
//     if (!googleApiKey) {
//       return res.json({
//         success: true,
//         data: []
//       });
//     }
    
//     // Limit to first 5 places to avoid too many requests
//     const limitedPlaceIds = placeIds.slice(0, 5);
    
//     const placeDetails = await Promise.all(
//       limitedPlaceIds.map(async (placeId) => {
//         try {
//           const googleUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${googleApiKey}&fields=geometry,name`;
//           const response = await axios.get(googleUrl, { timeout: 3000 });
          
//           if (response.data.status === 'OK' && response.data.result) {
//             const place = response.data.result;
//             return {
//               placeId,
//               lat: place.geometry?.location?.lat || null,
//               lon: place.geometry?.location?.lng || null,
//               name: place.name
//             };
//           }
//         } catch (error) {
//           console.error(`Error fetching place ${placeId}:`, error.message);
//         }
//         return null;
//       })
//     );
    
//     const validDetails = placeDetails.filter(item => item !== null);
    
//     res.json({
//       success: true,
//       data: validDetails
//     });
    
//   } catch (error) {
//     console.error('❌ Batch place details error:', error.message);
//     res.json({
//       success: true,
//       data: []
//     });
//   }
// });

// // ✅ Health check endpoint
// router.get('/health', (req, res) => {
//   res.json({
//     success: true,
//     message: 'Route API is working',
//     googleApiKey: process.env.GOOGLE_API_KEY ? 'Configured' : 'Not configured',
//     timestamp: new Date().toISOString(),
//     endpoints: [
//       'POST /api/routes/calculate-route',
//       'GET /api/routes/autocomplete',
//       'GET /api/routes/place-details/:placeId',
//       'GET /api/routes/reverse-geocode',
//       'POST /api/routes/batch-place-details'
//     ]
//   });
// });

// // Helper function to calculate straight-line distance
// const calculateStraightLineDistance = (origin, destination) => {
//   const R = 6371; // Earth's radius in km
//   const dLat = (destination.latitude - origin.latitude) * Math.PI / 180;
//   const dLon = (destination.longitude - origin.longitude) * Math.PI / 180;
//   const a = 
//     Math.sin(dLat/2) * Math.sin(dLat/2) +
//     Math.cos(origin.latitude * Math.PI / 180) * Math.cos(destination.latitude * Math.PI / 180) * 
//     Math.sin(dLon/2) * Math.sin(dLon/2);
//   const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
//   const distance = R * c;
//   return distance;
// };

// module.exports = router;











const express = require("express");
const axios = require("axios");
const router = express.Router();

const getOSRMUrl = () => {

  let url = process.env.OSRM_URL || "https://router.project-osrm.org";


  if (process.env.NODE_ENV === "development") {
    const isAndroidEmulator = process.env.PLATFORM === "android"; // set manually if needed
    if (isAndroidEmulator) {
      url = "http://10.0.2.2:5001"; // Android emulator maps host 5001
    } else {
      url = "http://localhost:5000"; // iOS simulator or local Node.js
    }
  }
  return url;
};



// 🚖 GET route from OSRM
router.get("/route", async (req, res) => {
  try {
    const { startLat, startLng, endLat, endLng } = req.query;

    if (!startLat || !startLng || !endLat || !endLng) {
      return res.status(400).json({ error: "Missing coordinates" });
    }

    const OSRM_URL = getOSRMUrl();
    const url = `${OSRM_URL}/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;

    console.log("🔗 OSRM request URL:", url);

    const headers = {};
    // headers['Authorization'] = `Bearer ${process.env.OSRM_API_KEY}`; // optional for hosted OSRM

    const response = await axios.get(url, { headers });

    if (response.data.code !== "Ok") {
      console.error("🚨 OSRM returned error:", response.data);
      return res.status(500).json({ error: "OSRM route not found", details: response.data });
    }

    res.json(response.data.routes[0]); // return only the first route
  } catch (err) {
    if (err.response) {
      console.error("🚨 OSRM backend error:", err.response.status, err.response.data);
      return res.status(err.response.status).json({ error: err.response.data });
    }
    console.error("🚨 OSRM request failed:", err.message);
    res.status(500).json({ error: "OSRM service unavailable" });
  }
});

module.exports = router;
