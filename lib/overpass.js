const fs = require('fs')
const fetch = require('node-fetch');
const {stringify} = require('querystring')
const {DOMParser, XMLSerializer} = require('xmldom')

const endpoint = 'https://overpass-api.de/api/interpreter'

const parser = new DOMParser();
const serializer = new XMLSerializer()

async function mapBounds(b, js) {
    const query = `
    (
        node(${b.minlat},${b.minlon},${b.maxlat},${b.maxlon});
        <;
    );
    out meta;
    `
    const url = endpoint + '?' + stringify({data: query})
    const res = await fetch(url)
    const text = await res.text()
    
    // Add a node with the bounding box because Overpass doesn't
    const xmlDoc = parser.parseFromString(text,'text/xml')
    const boundsNode = xmlDoc.createElement('bounds')
    for (const a of ['minlat', 'maxlat', 'minlon', 'maxlon']) {
        boundsNode.setAttribute(a, b[a])
    }
    xmlDoc.getElementsByTagName('osm')[0].appendChild(boundsNode)
    if (js) {
        return xmlDoc
    } else {
        return serializer.serializeToString(xmlDoc)
    }
}

module.exports = { mapBounds }
