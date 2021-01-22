const fs = require('fs')
const path = require('path')
const glob = require('glob')
const sharp = require('sharp');
const exifr = require('exifr')
const convert = require('heic-convert')
const options = require('../config/options.js')

async function generate(generator, deck, patterns) {
    let count = 0
    for (const pattern of patterns) {
        const files = glob.sync(pattern)
        for (const fname of files) {
            const fpath = path.resolve(fname)
            let frontFile = fs.readFileSync(fpath)
            const exif = await exifr.parse(frontFile)

            if (fname.toLowerCase().endsWith('.heic')) {
                // Sharp and Anki can't handle HEIC files, so we use this package to convert it first
                frontFile = await convert({
                    buffer: frontFile,
                    format: 'JPEG',
                    quality: 1
                })
            }

            // If the image is really large, scale it down to a reasonable size
            const frontSharp = sharp(frontFile)
            const m = await frontSharp.metadata()
            if (m.width > m.height && m.width > options.maxImageSize) {
                frontFile = await frontSharp.resize({ width: options.maxImageSize }).toBuffer()
            }
            if (m.height > m.width && m.height > options.maxImageSize) {
                frontFile = await frontSharp.resize({ height: options.maxImageSize }).toBuffer()
            }

            const err = await generator(exif, frontFile, deck, count)
            if (err) {
                console.log(`${err} in file ${fpath}. Skipping.`)
            } else {
                console.log(`Generated card from ${fpath}`)
                count += 1
            }
        }
    }
    return count
}

async function save(deck, location, count) {
    const zip = await deck.save()
    fs.writeFileSync(path.resolve(location), zip, 'binary');
    console.log(`Package has been generated: ${location} (${count} cards)`);
}

module.exports = {
    generate,
    save
}