const fs = require('fs')
const osmtogeojson = require('osmtogeojson')
const AnkiExport = require('anki-apkg-export').default

const { mapBounds } = require('./lib/overpass.js')
const render = require('./lib/render.js')
const { transform, inside, invertYAxe } = require('./lib/transform.js')
const { generate, save } = require('./lib/photos.js')

const options = require('./config/options.js')
const prompt = 'Where was this photo taken?'
const args = require('minimist')(process.argv.slice(2))
let outputArg = args.o
if (!outputArg) {
    if (!fs.existsSync('output')) {
        fs.mkdirSync('output')
    }
    outputArg = 'output/geotag.apkg'
}

let useCache = true
let cache = []

async function mapAround(lat, lon) {
    const r = options.mapContextRadius
    const bounds = {
        minlat: lat - r,
        maxlat: lat + r,
        minlon: lon - r,
        maxlon: lon + r
    }
    let map
    if (useCache) {
        // Avoid hitting the API repeatedly for nearby locations
        let hit = false
        for (const c of cache) {
            if (inside(c.bounds, bounds)) {
                hit = true
                map = transform(osmtogeojson(c.map), bounds)
                break
            }
        }
        if (!hit) {
            const wideBounds = {
                minlat: lat - 2*r,
                maxlat: lat + 2*r,
                minlon: lon - 2*r,
                maxlon: lon + 2*r
            }
            const osm = await mapBounds(wideBounds, true)
            cache.push({
                bounds: wideBounds,
                map: osm
            })
            map = transform(osmtogeojson(osm), bounds)
        }
    } else {
        const osm = await mapBounds(bounds, true)
        map = transform(osmtogeojson(osm), bounds)
    }
    invertYAxe(map)
    const image = await render(map, options.mapSize, options.mapSize, options.mapDetail, true)
    return image
}

async function geotagCard(exif, image, deck, count) {
    if (!exif || !('latitude' in exif) || !('longitude' in exif)) {
        return 'Unable to find geotag'
    }

    const frontName = count + '-front.png'
    const backName = count + '-back.png'

    const buf = await mapAround(exif.latitude, exif.longitude)
    deck.addMedia(frontName, image)
    deck.addMedia(backName, buf)
    deck.addCard(`${prompt}<br><img src="${frontName}" />`, `<img src="${backName}" />`)
}

console.log('Initializing deck...')
const apkg = new AnkiExport(options.deckName)
generate(geotagCard, apkg, args._).then(count => {
    save(deck, outputArg, count)
})