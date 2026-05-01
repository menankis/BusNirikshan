/**
 * Haversine formula — returns the great-circle distance between two
 * lat/lng points in **kilometres**.
 *
 * @param {number} lat1  - Latitude of point 1 (degrees)
 * @param {number} lon1  - Longitude of point 1 (degrees)
 * @param {number} lat2  - Latitude of point 2 (degrees)
 * @param {number} lon2  - Longitude of point 2 (degrees)
 * @returns {number}     Distance in km
 */
function getDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = { getDistanceKm };
