# Ankifying maps

Automatically generate [Anki](https://apps.ankiweb.net) flashcards about
local geography.

## Setup

First make sure you have [Node.js](https://nodejs.org/en/) installed.

```bash
git clone https://github.com/ryanbloom/ankifying-maps.git
cd ankifying-maps
npm install
```

## Usage
There are three scripts for generating different types of flashcards.

### Geotag
Use GPS metadata in photos to generate prompts about the location of
the camera. The front will contain the photo, and the back will contain
a map of the surrounding area.

```bash
node geotag.js source1.jpeg source2.jpeg [...]
```

Sources can be individual image files or glob patterns.
### Compass
Use compass metadata in photos to generate prompts about the
orientation of the camera. The front will contain the photo, and the
back will contain a compass showing which way is north.

```bash
node compass.js source1.jpeg source2.jpeg [...]
```

Sources can be individual image files or glob patterns.
### Map

Generate prompts to fill in missing buildings and streets on
OpenStreetMap. The front will contain a map with a feature highlighted,
and the back will contain the name of the feature.

```bash
node map.js map1.osm map2.osm [...]
```

You can get an `.osm` file by using the Export button on
[OpenStreetMap](https://openstreetmap.org). Note that features near the
edge of the exported region (within `options.mapContextRadius`) will be
excluded.

Map features are identified as either roads or places. By default, cards will be
generated for both. You can change this by passing `--places=false` or
`--roads=false`.
