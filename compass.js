const fs = require('fs')
const sharp = require('sharp');
const xmldom = require('xmldom')
const AnkiExport = require('anki-apkg-export').default

const { generate, save } = require('./lib/photos.js')

const options = require('./config/options.js')
const prompt = 'Which way is north?'
const args = require('minimist')(process.argv.slice(2))
let outputArg = args.o
if (!outputArg) {
    if (!fs.existsSync('output')) {
        fs.mkdirSync('output')
    }
    outputArg = 'output/compass.apkg'
}

const svgdata = fs.readFileSync('./img/compass.svg', { encoding: 'utf-8' })
const doc = new xmldom.DOMParser().parseFromString(svgdata, 'text/xml');
const paths = doc.getElementsByTagName('path')

function compass(angle) {
    const transformString = `rotate(${angle} 250 250)`

    for (let i = 0; i < paths.length; i++) {
        paths.item(i).setAttribute('transform', transformString);
    }
    const ser = new xmldom.XMLSerializer().serializeToString(doc)

    return sharp(Buffer.from(ser)).toBuffer()
}

async function compassCard(exif, image, deck, count) {
    if (!exif || !('GPSDestBearing' in exif)) {
        return 'Unable to find compass bearing'
    }

    const frontName = count + '-front.png'
    const backName = count + '-back.png'

    const buf = await compass(-1 * exif.GPSDestBearing)
    deck.addMedia(frontName, image)
    deck.addMedia(backName, buf)
    deck.addCard(`${prompt}<br><img src="${frontName}" />`, `<img src="${backName}" />`)
}

console.log('Initializing deck...')
const apkg = new AnkiExport(options.deckName)
generate(compassCard, apkg, args._).then(count => {
    save(apkg, outputArg, count)
}).catch(console.log)