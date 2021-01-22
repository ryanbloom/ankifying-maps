function scaleOne(coord, min, max, size) {
    const range = max - min
    return (coord - min) / range * size
}

function scale(coords, bounds, size) {
    if (Array.isArray(coords[0])) {
        return coords.map(v => scale(v, bounds, size))
    } else {
        return [
            scaleOne(coords[0], bounds.minlon, bounds.maxlon, size),
            scaleOne(coords[1], bounds.minlat, bounds.maxlat, size)
        ]
    }
}

function almostFlatten(coords) {
    if (!Array.isArray(coords[0])) {
        return [coords]
    }
    let flat = []
    for (const c of coords) {
        if (Array.isArray(c[0])) {
            flat = flat.concat(almostFlatten(c))
        } else {
            flat.push(c)
        }
    }
    return flat
}

function reprpoint(c) {
    if (!Array.isArray(c[0])) {
        return c
    }
    const coords = almostFlatten(c)
    var minX = Number.MAX_VALUE
    var minY = Number.MAX_VALUE
    var maxX = -Number.MAX_VALUE
    var maxY = -Number.MAX_VALUE
    for (const c of coords) {
        if (c[0] > maxX) {
            maxX = c[0]
        }
        if (c[0] < minX) {
            minX = c[0]
        }
        if (c[1] < minY) {
            minY = c[1]
        }
        if (c[1] > maxY) {
            maxY = c[1]
        }
    }
    return [(maxX/2 + minX/2), (maxY+minY)/2]
}

// Adapted from the example on http://kothic.org.
function invertYAxe(data) {
    var type, coordinates, tileSize = data.granularity, i, j, k, l, feature;
    for (i = 0; i < data.features.length; i++) {
        feature = data.features[i];
        coordinates = feature.coordinates;
        type = data.features[i].type;
        if (type == 'Point') {
            coordinates[1] = tileSize - coordinates[1];
        } else if (type == 'MultiPoint' || type == 'LineString') {
            for (j = 0; j < coordinates.length; j++) {
                coordinates[j][1] = tileSize - coordinates[j][1];
            }
        } else if (type == 'MultiLineString' || type == 'Polygon') {
            for (k = 0; k < coordinates.length; k++) {
                for (j = 0; j < coordinates[k].length; j++) {
                    coordinates[k][j][1] = tileSize - coordinates[k][j][1];
                }
            }
        } else if (type == 'MultiPolygon') {
            for (l = 0; l < coordinates.length; l++) {
                for (k = 0; k < coordinates[l].length; k++) {
                    for (j = 0; j < coordinates[l][k].length; j++) {
                        coordinates[l][k][j][1] = tileSize - coordinates[l][k][j][1];
                    }
                }
            }
        }

        if ('reprpoint' in feature) {
            feature.reprpoint[1] = tileSize - feature.reprpoint[1];
        }
    }
}

function transform(original, bounds) {
    original.granularity = 600 // map size
    bounds.latrange = bounds.maxlat - bounds.minlat
    bounds.lonrange = bounds.maxlon - bounds.minlon

    for (const feature of original.features) {
        feature.type = feature.geometry.type
        feature.originalCoordinates = feature.geometry.coordinates
        if (feature.originalCoordinates) {
            const calculatedReprpoint = reprpoint(feature.originalCoordinates)
            if ('reprpoint' in feature.geometry) {
                console.log(feature.properties.name)
                console.log(`Calculated: ${calculatedReprpoint}`)
                console.log(`Original: ${feature.geometry.reprpoint}`)
                feature.originalReprpoint = feature.geometry.reprpoint
            } else {
                feature.originalReprpoint = calculatedReprpoint
            }
        }
        feature.coordinates = scale(feature.originalCoordinates, bounds, original.granularity)
        if (feature.coordinates) {
            feature.reprpoint = reprpoint(feature.coordinates)
        }
        feature.name = feature.properties.name
        delete feature.geometry
        delete feature.id
        for (const prop of ['timestamp', 'version', 'changeset', 'user', 'uid', 'id', 'survey:date', 'survey:date', 'survey:id', 'is_in:state']) {
            delete feature.properties[prop]
        }
    }
    return original
}

function inside(outer, inner) {
    return inner.minlat > outer.minlat && inner.maxlat < outer.maxlat
        && inner.minlon > outer.minlon && inner.maxlon < outer.maxlon
}

module.exports = {
    transform,
    scale,
    invertYAxe,
    inside
}