const fs = require('fs')
const path = require('path')
const DOMParser = require('xmldom').DOMParser
const osmtogeojson = require('osmtogeojson')
const AnkiExport = require('anki-apkg-export').default

const render = require('./lib/render.js')
const { transform, scale, invertYAxe, inside } = require('./lib/transform.js')
const { match } = require('./config/filter.js')

const options = require('./config/options.js')

const parseArgs = require('minimist')
const featureTypes = ['roads', 'places']
const opts = {
    boolean: featureTypes,
    default: {
        roads: true,
        places: true
    }
}
const args = parseArgs(process.argv.slice(2), opts)
const includedFeatureTypes = featureTypes.filter(t => args[t])

let outputArg = args.o
if (!outputArg) {
    if (!fs.existsSync('output')) {
        fs.mkdirSync('output')
    }
    outputArg = 'output/map.apkg'
}

function boundsAround(point) {
    const r = options.mapContextRadius
    return {
        minlon: point[0] - r,
        maxlon: point[0] + r,
        minlat: point[1] - r,
        maxlat: point[1] + r
    }
}

const roadWords = ['Way', 'Street', 'Road', 'Drive', 'Boulevard', 'Lane']
function featureType(f) {
    if (f.type == 'LineString') {
        for (const roadWord of roadWords) {
            if (f.properties.name.includes(roadWord)) {
                return 'roads'
            }
        }
    }
    return 'places'
}

function valid(f) {
    if (!f.originalReprpoint || !f.properties.name) {
        return false
    }
    // Anything that has just a number for a name probably isn't important
    if (!isNaN(Number(f.properties.name))) {
        return false
    }
    if (f.properties.name.toLowerCase().startsWith('nameless')) {
        return false
    }
    if (f.type == 'LineString' && featureType(f) != 'roads') {
        return false
    }
    return !match(f.properties, 'invalid')
}

function addCard(deck, map, back, i) {
    const fname = `map${i}.png`
    return new Promise((resolve, reject) => {
        render(map, options.mapSize, options.mapSize, options.mapDetail).then(buf => {
            console.log(`${i}: ${back}`)
            deck.addMedia(fname, buf)
            deck.addCard(`<img src="${fname}" />`, back)
            resolve()
        }).catch(reject)
    })
}

async function generate(source, deck, i) {
    const file = fs.readFileSync(path.resolve(source), { encoding: 'utf-8' })
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(file, "text/xml")
    const boundEl = xmlDoc.getElementsByTagName('bounds')[0]
    const bounds = {
        minlat: boundEl.getAttribute('minlat'),
        maxlat: boundEl.getAttribute('maxlat'),
        minlon: boundEl.getAttribute('minlon'),
        maxlon: boundEl.getAttribute('maxlon')
    }

    const minSize = 2 * options.mapContextRadius
    const latRange = bounds.maxlat - bounds.minlat
    const lonRange = bounds.maxlon - bounds.minlon
    if (latRange < minSize || lonRange < minSize) {
        console.log(`Map file ${source} is too small for context radius ${options.mapContextRadius}. Use a bigger map or reduce mapContextRadius in config/options.js.`)
        return i
    }
    const original = osmtogeojson(xmlDoc)
    const map = transform(original, bounds)

    for (const f of map.features) {
        if (!valid(f)) {
            continue
        }
        if (!includedFeatureTypes.includes(featureType(f))) {
            continue
        }
        const zoomed = boundsAround(f.originalReprpoint)
        if (!inside(bounds, zoomed)) {
            continue
        }

        // Center the map around this feature
        const realName = f.properties.name
        const sameNameFeatures = []
        for (f2 of map.features) {
            if (f2.originalCoordinates) {
                f2.coordinates = scale(f2.originalCoordinates, zoomed, map.granularity)
            }
            if (f2.originalReprpoint) {
                f2.reprpoint = scale(f2.originalReprpoint, zoomed, map.granularity)
            }
            if (f2.properties.name == realName) {
                f2.properties.name = ''
                sameNameFeatures.push(f2)
            }
        }
        invertYAxe(map)

        // Obscure the feature
        f.properties.name = '???'
        f.properties.highlight = true

        // Create the card
        try {
            i++
            await addCard(deck, map, realName, i)
        } catch (err) {
            i--
        }

        // Reset
        f.properties.name = realName
        for (const f2 of sameNameFeatures) {
            f2.properties.name = realName
        }
        f.properties.highlight = false
    }
    return i
}

async function makeDeck(sources, name, destination) {
    console.log('Initializing deck...')
    let apkg = new AnkiExport(name)

    let count = 0
    for (const source of sources) {
        count = await generate(source, apkg, count)
    }

    if (count == 0) {
        console.log('No cards generated.')
    } else {
        const zip = await apkg.save()
        fs.writeFileSync(path.resolve(destination), zip, 'binary');
        console.log(`Package has been generated: ${destination} (${count} cards)`);
    }
}

makeDeck(args._, options.deckName, outputArg)
