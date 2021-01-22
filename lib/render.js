const path = require('path')
const { createCanvas } = require('canvas')

const {Kothic, MapCSS} = require('./kothic.js')
const mapStyle = require('./mapstyle.js')
MapCSS.loadStyle('osmosnimki', mapStyle.restyle, mapStyle.sprite_images, mapStyle.external_images, mapStyle.presence_tags, mapStyle.value_tags)
MapCSS.preloadExternalImages('osmosnimki')
MapCSS.preloadSpriteImage('osmosnimki', path.join(__dirname, '../img/osmosnimki.png'))

const options = require('../config/options.js')

function render(map, w, h, detail, marker) {
    const canvas = createCanvas(w, h)
    return new Promise((resolve, reject) => {
        function actuallyRender() {
            try {
                Kothic.render(canvas, map, detail, {
                    styles: ['osmosnimki']
                })
                if (marker) {
                    const ctx = canvas.getContext('2d')
                    ctx.beginPath()
                    ctx.ellipse(w/2, h/2, options.markerRadius, options.markerRadius, 0, 0, 2*Math.PI)
                    ctx.fillStyle = 'red'
                    ctx.fill()
                }
                resolve(canvas.toBuffer())
            } catch (err) {
                reject(err)
            }
        }
        if (MapCSS.imagesLoaded) {
            actuallyRender()
        } else {
            MapCSS.renderQueue.push(actuallyRender)
        }
    })
}

module.exports = render
