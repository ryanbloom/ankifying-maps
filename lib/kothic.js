// This code has been modified from the original to work with node-canvas.

/*
 (c) 2013 - 2019, Darafei Praliaskouski, Vladimir Agafonkin, Maksim Gurtovenko, Stephan Brandt
 Kothic JS is a full-featured JavaScript map rendering engine using HTML5 Canvas.
 http://github.com/kothic/kothic-js
*/

const { createCanvas, loadImage } = require('canvas')
var Kothic = {

    render: function (canvas, data, zoom, options) {
        var styles = (options && options.styles) || [];

        MapCSS.locales = (options && options.locales) || [];

        var width = canvas.width,
            height = canvas.height;

        var ctx = canvas.getContext('2d');
        ctx.scale(1, 1);

        var granularity = data.granularity,
            ws = width / granularity, hs = height / granularity,
            collisionBuffer = new Kothic.CollisionBuffer(height, width);


        // setup layer styles
        var layers = Kothic.style.populateLayers(data.features, zoom, styles),
            layerIds = Kothic.getLayerIds(layers);

        // render the map
        Kothic.style.setStyles(ctx, Kothic.style.defaultCanvasStyles);

        Kothic._renderBackground(ctx, width, height, zoom, styles);
        Kothic._renderGeometryFeatures(layerIds, layers, ctx, ws, hs, granularity);
        Kothic._renderTextAndIcons(layerIds, layers, ctx, ws, hs, collisionBuffer);
    },

    _renderCollisions: function (ctx, node) {
        var i, len, a;
        if (node.leaf) {
            for (i = 0, len = node.children.length; i < len; i++) {
                ctx.strokeStyle = 'red';
                ctx.lineWidth = 1;
                a = node.children[i];
                ctx.strokeRect(Math.round(a[0]), Math.round(a[1]), Math.round(a[2] - a[0]), Math.round(a[3] - a[1]));
            }
        } else {
            for (i = 0, len = node.children.length; i < len; i++) {
                this._renderCollisions(ctx, node.children[i]);
            }
        }
    },

    getLayerIds: function (layers) {
        return Object.keys(layers).sort(function (a, b) {
            return parseInt(a, 10) - parseInt(b, 10);
        });
    },

    _renderBackground: function (ctx, width, height, zoom, styles) {
        var style = MapCSS.restyle(styles, {}, {}, zoom, 'canvas', 'canvas');

        var fillRect = function () {
            ctx.fillRect(-1, -1, width + 1, height + 1);
        };

        for (var i in style) {
            Kothic.polygon.fill(ctx, style[i], fillRect);
        }
    },

    _renderGeometryFeatures: function (layerIds, layers, ctx, ws, hs, granularity) {
        var layersToRender = {},
            i, j, len, features, style, queue, bgQueue;

        for (i = 0; i < layerIds.length; i++) {
            features = layers[layerIds[i]];

            bgQueue = layersToRender._bg = layersToRender._bg || {};
            queue = layersToRender[layerIds[i]] = layersToRender[layerIds[i]] || {};

            for (j = 0, len = features.length; j < len; j++) {
                style = features[j].style;

                if ('fill-color' in style || 'fill-image' in style) {
                    if (style['fill-position'] === 'background') {
                        bgQueue.polygons = bgQueue.polygons || [];
                        bgQueue.polygons.push(features[j]);
                    } else {
                        queue.polygons = queue.polygons || [];
                        queue.polygons.push(features[j]);
                    }
                }

                if ('casing-width' in style) {
                    queue.casings = queue.casings || [];
                    queue.casings.push(features[j]);
                }

                if ('width' in style) {
                    queue.lines = queue.lines || [];
                    queue.lines.push(features[j]);
                }
            }
        }

        layerIds = ['_bg'].concat(layerIds);

        for (i = 0; i < layerIds.length; i++) {
            queue = layersToRender[layerIds[i]];
            if (!queue)
                continue;

            if (queue.polygons) {
                for (j = 0, len = queue.polygons.length; j < len; j++) {
                    Kothic.polygon.render(ctx, queue.polygons[j], queue.polygons[j + 1], ws, hs, granularity);
                }
            }
            if (queue.casings) {
                ctx.lineCap = 'butt';
                for (j = 0, len = queue.casings.length; j < len; j++) {
                    Kothic.line.renderCasing(ctx, queue.casings[j], queue.casings[j + 1], ws, hs, granularity);
                }
            }
            if (queue.lines) {
                ctx.lineCap = 'round';
                for (j = 0, len = queue.lines.length; j < len; j++) {
                    Kothic.line.render(ctx, queue.lines[j], queue.lines[j + 1], ws, hs, granularity);
                }
            }
        }
    },

    _renderTextAndIcons: function (layerIds, layers, ctx, ws, hs, collisionBuffer) {
        //TODO: Move to the features detector
        var j, style, i,
            passes = [];

        for (i = 0; i < layerIds.length; i++) {
            var features = layers[layerIds[i]],
                featuresLen = features.length;

            // render icons without text
            for (j = featuresLen - 1; j >= 0; j--) {
                style = features[j].style;
                if (style.hasOwnProperty('icon-image') && !style.text) {
                    Kothic.texticons.render(ctx, features[j], collisionBuffer, ws, hs, false, true);
                }
            }

            // render text on features without icons
            for (j = featuresLen - 1; j >= 0; j--) {
                style = features[j].style;
                if (!style.hasOwnProperty('icon-image') && style.text) {
                    Kothic.texticons.render(ctx, features[j], collisionBuffer, ws, hs, true, false);
                }
            }

            // for features with both icon and text, render both or neither
            for (j = featuresLen - 1; j >= 0; j--) {
                style = features[j].style;
                if (style.hasOwnProperty('icon-image') && style.text) {
                    Kothic.texticons.render(ctx, features[j], collisionBuffer, ws, hs, true, true);
                }
            }

            // render shields with text
            for (j = featuresLen - 1; j >= 0; j--) {
                style = features[j].style;
                if (style['shield-text']) {
                    Kothic.shields.render(ctx, features[j], collisionBuffer, ws, hs);
                }
            }
        }

        return passes;
    }
};

Kothic.line = {

    renderCasing: function (ctx, feature, nextFeature, ws, hs, granularity) {
        var style = feature.style,
            nextStyle = nextFeature && nextFeature.style;

        if (!this.pathOpened) {
            this.pathOpened = true;
            ctx.beginPath();
        }

        Kothic.path(ctx, feature, style["casing-dashes"] || style.dashes, false, ws, hs, granularity);

        if (nextFeature &&
                nextStyle.width === style.width &&
                nextStyle['casing-width'] === style['casing-width'] &&
                nextStyle['casing-color'] === style['casing-color'] &&
                nextStyle['casing-dashes'] === style['casing-dashes'] &&
                nextStyle['casing-opacity'] === style['casing-opacity']) {
            return;
        }

        Kothic.style.setStyles(ctx, {
            lineWidth: 2 * style["casing-width"] + (style.hasOwnProperty("width") ? style.width : 0),
            strokeStyle: style["casing-color"] || "#000000",
            lineCap: style["casing-linecap"] || style.linecap || "butt",
            lineJoin: style["casing-linejoin"] || style.linejoin || "round",
            globalAlpha: style["casing-opacity"] || 1
        });

        ctx.stroke();
        this.pathOpened = false;
    },

    render: function (ctx, feature, nextFeature, ws, hs, granularity) {
        var style = feature.style,
            nextStyle = nextFeature && nextFeature.style;

        if (!this.pathOpened) {
            this.pathOpened = true;
            ctx.beginPath();
        }

        Kothic.path(ctx, feature, style.dashes, false, ws, hs, granularity);

        if (nextFeature &&
                nextStyle.width === style.width &&
                nextStyle.color === style.color &&
                nextStyle.image === style.image &&
                nextStyle.opacity === style.opacity) {
            return;
        }

        if ('color' in style || !('image' in style)) {
            var t_width = style.width || 1,
                t_linejoin = "round",
                t_linecap = "round";

            if (t_width <= 2) {
                t_linejoin = "miter";
                t_linecap = "butt";
            }
            Kothic.style.setStyles(ctx, {
                lineWidth: t_width,
                strokeStyle: style.color || '#000000',
                lineCap: style.linecap || t_linecap,
                lineJoin: style.linejoin || t_linejoin,
                globalAlpha: style.opacity || 1,
                miterLimit: 4
            });
            ctx.stroke();
        }


        if ('image' in style) {
            // second pass fills with texture
            var image = MapCSS.getImage(style.image);

            if (image) {
                Kothic.style.setStyles(ctx, {
                    strokeStyle: ctx.createPattern(image, 'repeat') || "#000000",
                    lineWidth: style.width || 1,
                    lineCap: style.linecap || "round",
                    lineJoin: style.linejoin || "round",
                    globalAlpha: style.opacity || 1
                });

                ctx.stroke();
            }
        }
        this.pathOpened = false;
    },

    pathOpened: false
};

Kothic.path = (function () {
    // check if the point is on the tile boundary
    // returns bitmask of affected tile boundaries
    function isTileBoundary(p, size) {
        var r = 0;
        if (p[0] === 0)
            r |= 1;
        else if (p[0] === size)
            r |= 2;
        if (p[1] === 0)
            r |= 4;
        else if (p[1] === size)
            r |= 8;
        return r;
    }

    /* check if 2 points are both on the same tile boundary
     *
     * If points of the object are on the same tile boundary it is assumed
     * that the object is cut here and would originally continue beyond the
     * tile borders.
     *
     * This does not catch the case where the object is indeed exactly
     * on the tile boundaries, but this case can't properly be detected here.
     */
    function checkSameBoundary(p, q, size) {
        var bp = isTileBoundary(p, size);
        if (!bp)
            return 0;

        return (bp & isTileBoundary(q, size));
    }

    return function (ctx, feature, dashes, fill, ws, hs, granularity) {
        var type = feature.type,
            coords = feature.coordinates;

        if (type === "Polygon") {
            coords = [coords];
            type = "MultiPolygon";
        } else if (type === "LineString") {
            coords = [coords];
            type = "MultiLineString";
        }

        var i, j, k,
            points,
            len = coords.length,
            len2, pointsLen,
            prevPoint, point, screenPoint,
            dx, dy, dist;

        if (type === "MultiPolygon") {
            for (i = 0; i < len; i++) {
                for (k = 0, len2 = coords[i].length; k < len2; k++) {
                    points = coords[i][k];
                    pointsLen = points.length;
                    prevPoint = points[0];

                    for (j = 0; j <= pointsLen; j++) {
                        point = points[j] || points[0];
                        screenPoint = Kothic.geom.transformPoint(point, ws, hs);

                        if (j === 0) {
                            ctx.moveTo(screenPoint[0], screenPoint[1]);
                            if (dashes)
                                ctx.setLineDash(dashes);
                            else
                                ctx.setLineDash([]);
                        } else if (!fill && checkSameBoundary(point, prevPoint, granularity)) {
                            ctx.moveTo(screenPoint[0], screenPoint[1]);
                        } else {
                            ctx.lineTo(screenPoint[0], screenPoint[1]);
                        }
                        prevPoint = point;
                    }
                }
            }
        } else if (type === "MultiLineString") {
            var pad = 50, // how many pixels to draw out of the tile to avoid path edges when lines crosses tile borders
                skip = 2; // do not draw line segments shorter than this

            for (i = 0; i < len; i++) {
                points = coords[i];
                pointsLen = points.length;

                for (j = 0; j < pointsLen; j++) {
                    point = points[j];

                    // continue path off the tile by some amount to fix path edges between tiles
                    if ((j === 0 || j === pointsLen - 1) && isTileBoundary(point, granularity)) {
                        k = j;
                        do {
                            k = j ? k - 1 : k + 1;
                            if (k < 0 || k >= pointsLen)
                                break;
                            prevPoint = points[k];

                            dx = point[0] - prevPoint[0];
                            dy = point[1] - prevPoint[1];
                            dist = Math.sqrt(dx * dx + dy * dy);
                        } while (dist <= skip);

                        // all points are so close to each other that it doesn't make sense to
                        // draw the line beyond the tile border, simply skip the entire line from
                        // here
                        if (k < 0 || k >= pointsLen)
                            break;

                        point[0] = point[0] + pad * dx / dist;
                        point[1] = point[1] + pad * dy / dist;
                    }
                    screenPoint = Kothic.geom.transformPoint(point, ws, hs);

                    if (j === 0) {
                        ctx.moveTo(screenPoint[0], screenPoint[1]);
                        if (dashes)
                            ctx.setLineDash(dashes);
                        else
                            ctx.setLineDash([]);
                    } else {
                        ctx.lineTo(screenPoint[0], screenPoint[1]);
                    }
                }
            }
        }
    };
}());

Kothic.polygon = {
    render: function (ctx, feature, nextFeature, ws, hs, granularity) {
        var style = feature.style,
            nextStyle = nextFeature && nextFeature.style;

        if (!this.pathOpened) {
            this.pathOpened = true;
            ctx.beginPath();
        }

        Kothic.path(ctx, feature, false, true, ws, hs, granularity);

        if (nextFeature &&
                (nextStyle['fill-color'] === style['fill-color']) &&
                (nextStyle['fill-image'] === style['fill-image']) &&
                (nextStyle['fill-opacity'] === style['fill-opacity'])) {
            return;
        }

        this.fill(ctx, style);

        this.pathOpened = false;
    },

    fill: function (ctx, style, fillFn) {
        var opacity = style["fill-opacity"] || style.opacity, image;

        if (style.hasOwnProperty('fill-color')) {
            // first pass fills with solid color
            Kothic.style.setStyles(ctx, {
                fillStyle: style["fill-color"] || "#000000",
                globalAlpha: opacity || 1
            });
            if (fillFn) {
                fillFn();
            } else {
                ctx.fill();
            }
        }

        if (style.hasOwnProperty('fill-image')) {
            // second pass fills with texture
            image = MapCSS.getImage(style['fill-image']);
            if (image) {
                Kothic.style.setStyles(ctx, {
                    fillStyle: ctx.createPattern(image, 'repeat'),
                    globalAlpha: opacity || 1
                });
                if (fillFn) {
                    fillFn();
                } else {
                    ctx.fill();
                }
            }
        }
    }
};

Kothic.shields = {
    render: function (ctx, feature, collides, ws, hs) {
        var style = feature.style, reprPoint = Kothic.geom.getReprPoint(feature),
            point, img, len = 0, found = false, i, sgn;

        if (!reprPoint) {
            return;
        }

        point = Kothic.geom.transformPoint(reprPoint, ws, hs);

        if (style["shield-image"]) {
            img = MapCSS.getImage(style["icon-image"]);

            if (!img) {
                return;
            }
        }

        Kothic.style.setStyles(ctx, {
            font: Kothic.style.getFontString(style["shield-font-family"] || style["font-family"], style["shield-font-size"] || style["font-size"], style),
            fillStyle: style["shield-text-color"] || "#000000",
            globalAlpha: style["shield-text-opacity"] || style.opacity || 1,
            textAlign: 'center',
            textBaseline: 'middle'
        });

        var text = String(style['shield-text']),
                textWidth = ctx.measureText(text).width,
                letterWidth = textWidth / text.length,
                collisionWidth = textWidth + 2,
                collisionHeight = letterWidth * 1.8;

        if (feature.type === 'LineString') {
            len = Kothic.geom.getPolyLength(feature.coordinates);

            if (Math.max(collisionHeight / hs, collisionWidth / ws) > len) {
                return;
            }

            for (i = 0, sgn = 1; i < len / 2; i += Math.max(len / 30, collisionHeight / ws), sgn *= -1) {
                reprPoint = Kothic.geom.getAngleAndCoordsAtLength(feature.coordinates, len / 2 + sgn * i, 0);
                if (!reprPoint) {
                    break;
                }

                reprPoint = [reprPoint[1], reprPoint[2]];

                point = Kothic.geom.transformPoint(reprPoint, ws, hs);
                if (img && (style["allow-overlap"] !== "true") &&
                        collides.checkPointWH(point, img.width, img.height, feature.kothicId)) {
                    continue;
                }
                if ((style["allow-overlap"] !== "true") &&
                        collides.checkPointWH(point, collisionWidth, collisionHeight, feature.kothicId)) {
                    continue;
                }
                found = true;
                break;
            }
        }

        if (!found) {
            return;
        }

        if (style["shield-casing-width"]) {
            Kothic.style.setStyles(ctx, {
                fillStyle: style["shield-casing-color"] || "#000000",
                globalAlpha: style["shield-casing-opacity"] || style.opacity || 1
            });
            var p = style["shield-casing-width"] + (style["shield-frame-width"] || 0);
            ctx.fillRect(point[0] - collisionWidth / 2 - p,
                    point[1] - collisionHeight / 2 - p,
                    collisionWidth + 2 * p,
                    collisionHeight + 2 * p);
        }

        if (style["shield-frame-width"]) {
            Kothic.style.setStyles(ctx, {
                fillStyle: style["shield-frame-color"] || "#000000",
                globalAlpha: style["shield-frame-opacity"] || style.opacity || 1
            });
            ctx.fillRect(point[0] - collisionWidth / 2 - style["shield-frame-width"],
                    point[1] - collisionHeight / 2 - style["shield-frame-width"],
                    collisionWidth + 2 * style["shield-frame-width"],
                    collisionHeight + 2 * style["shield-frame-width"]);
        }

        if (style["shield-color"]) {
            Kothic.style.setStyles(ctx, {
                fillStyle: style["shield-color"] || "#000000",
                globalAlpha: style["shield-opacity"] || style.opacity || 1
            });
            ctx.fillRect(point[0] - collisionWidth / 2,
                    point[1] - collisionHeight / 2,
                    collisionWidth,
                    collisionHeight);
        }

        if (img) {
            ctx.drawImage(img,
                Math.floor(point[0] - img.width / 2),
                Math.floor(point[1] - img.height / 2));
        }
        Kothic.style.setStyles(ctx, {
            fillStyle: style["shield-text-color"] || "#000000",
            globalAlpha: style["shield-text-opacity"] || style.opacity || 1
        });

        ctx.fillText(text, point[0], Math.ceil(point[1]));
        if (img) {
            collides.addPointWH(point, img.width, img.height, 0, feature.kothicId);
        }

        collides.addPointWH(point, collisionHeight, collisionWidth,
                (parseFloat(style["shield-casing-width"]) || 0) + (parseFloat(style["shield-frame-width"]) || 0) + (parseFloat(style["-x-mapnik-min-distance"]) || 30), feature.kothicId);

    }
};

Kothic.textOnPath = (function () {

    function getWidth(ctx, text) {
        return ctx.measureText(text).width;
    }

    function getTextCenter(axy, textWidth) {
        return [axy[1] + 0.5 * Math.cos(axy[0]) * textWidth,
            axy[2] + 0.5 * Math.sin(axy[0]) * textWidth];
    }

    function getCollisionParams(textWidth, axy, pxoffset) {
        var textHeight = textWidth * 1.5,
            cos = Math.abs(Math.cos(axy[0])),
            sin = Math.abs(Math.sin(axy[0])),
            w = cos * textWidth + sin * textHeight,
            h = sin * textWidth + cos * textHeight;

        return [getTextCenter(axy, textWidth + 2 * (pxoffset || 0)), w, h, 0];
    }

    function checkCollision(collisions, ctx, text, axy, letterWidth) {
        var textWidth = getWidth(ctx, text);

        for (var i = 0; i < textWidth; i += letterWidth) {
            if (collisions.checkPointWH.apply(collisions, getCollisionParams(letterWidth, axy, i))) {
                return true;
            }
        }
        return false;
    }

    function addCollision(collisions, ctx, text, axy, letterWidth) {
        var textWidth = getWidth(ctx, text),
            params = [];

        for (var i = 0; i < textWidth; i += letterWidth) {
            params.push(getCollisionParams(letterWidth, axy, i));
        }
        collisions.addPoints(params);
    }

    function renderText(ctx, axy, halo) {
        var text = axy[4],
            textCenter = getTextCenter(axy, getWidth(ctx, text));

        ctx.translate(textCenter[0], textCenter[1]);
        ctx.rotate(axy[0]);
        ctx[halo ? 'strokeText' : 'fillText'](text, 0, 0);
        ctx.rotate(-axy[0]);
        ctx.translate(-textCenter[0], -textCenter[1]);
    }

    // Kothic.textOnPath
    return function (ctx, points, text, halo, collisions) {
        var textWidth = ctx.measureText(text).width,
        textLen = text.length,
        pathLen = Kothic.geom.getPolyLength(points);
        
        if (pathLen < textWidth) {
            if (text == '???') {
                throw 'Not enough room'
            }
            return;  // if label won't fit - don't try to
        }
        
        var avgLetterWidth = getWidth(ctx, 'a');
        
        var letter,
        widthUsed,
        prevAngle,
        positions,
        solution = 0,
        flipCount,
        flipped = false,
        axy,
        letterWidth,
        i,
        maxAngle = Math.PI / 6;
        
        // iterating solutions - start from center or from one of the ends
        while (solution < 2) { //TODO change to for?
            widthUsed = solution ? getWidth(ctx, text.charAt(0)) : (pathLen - textWidth) / 2; // ???
            flipCount = 0;
            prevAngle = null;
            positions = [];

            // iterating label letter by letter (should be fixed to support ligatures/CJK, ok for Cyrillic/latin)
            for (i = 0; i < textLen; i++) {
                letter = text.charAt(i);
                letterWidth = getWidth(ctx, letter);
                axy = Kothic.geom.getAngleAndCoordsAtLength(points, widthUsed, letterWidth);

                // if cannot fit letter - restart with next solution
                if (widthUsed >= pathLen || !axy) {
                    solution++;
                    positions = [];
                    if (flipped) {  // if label was flipped, flip it back
                        points.reverse();
                        flipped = false;
                    }
                    break;
                }

                if (!prevAngle) {
                    prevAngle = axy[0];
                }

                // if label collisions with another, restart it from here
                if (checkCollision(collisions, ctx, letter, axy, avgLetterWidth) || Math.abs(prevAngle - axy[0]) > maxAngle) {
                    widthUsed += letterWidth;
                    i = -1;
                    positions = [];
                    flipCount = 0;
                    continue;
                }

                while (letterWidth < axy[3] && i < textLen) { // try adding following letters to current, until line changes its direction
                    i++;
                    letter += text.charAt(i);
                    letterWidth = getWidth(ctx, letter);
                    if (checkCollision(collisions, ctx, letter, axy, avgLetterWidth)) {
                        i = 0;
                        widthUsed += letterWidth;
                        positions = [];
                        flipCount = 0;
                        letter = text.charAt(i);
                        letterWidth = getWidth(ctx, letter);
                        axy = Kothic.geom.getAngleAndCoordsAtLength(points, widthUsed, letterWidth);
                        break;
                    }
                    if (letterWidth >= axy[3]) {
                        i--;
                        letter = letter.slice(0, -1);
                        letterWidth = getWidth(ctx, letter);
                        break;
                    }
                }

                if (!axy) {
                    continue;
                }

                if ((axy[0] > (Math.PI / 2)) || (axy[0] < (-Math.PI / 2))) { // if current letters cluster was upside-down, count it
                    flipCount += letter.length;
                }

                prevAngle = axy[0];
                axy.push(letter);
                positions.push(axy);
                widthUsed += letterWidth;
            } //for

            if (flipCount > textLen / 2) { // if more than half of the text is upside down, flip it and restart
                points.reverse();
                positions = [];

                if (flipped) { // if it was flipped twice - restart with other start point solution
                    solution++;
                    points.reverse();
                    flipped = false;
                } else {
                    flipped = true;
                }
            }

            if (solution >= 2) {
                if (text == '???') {
                    throw 'Not enough room'
                }
                return;
            }
            
            if (positions.length > 0) {
                break;
            }
        } //while

        var posLen = positions.length;

        let rendered = false

        // Render halo
        for (i = 0; halo && (i < posLen); i++) {
            renderText(ctx, positions[i], true);
        }

        // Render the actual text
        for (i = 0; i < posLen; i++) {
            axy = positions[i];
            renderText(ctx, axy);
            addCollision(collisions, ctx, axy[4], axy, avgLetterWidth);
            rendered = true
        }
    };
}());

Kothic.texticons = {

    render: function (ctx, feature, collides, ws, hs, renderText, renderIcon) {
        var style = feature.style, img, point, w, h;

        if (renderIcon || (renderText && feature.type !== 'LineString')) {
            var reprPoint = Kothic.geom.getReprPoint(feature);
            if (!reprPoint) {
                return;
            }
            point = Kothic.geom.transformPoint(reprPoint, ws, hs);
        }

        if (renderIcon) {
            img = MapCSS.getImage(style['icon-image']);
            if (!img) { return; }

            w = img.width;
            h = img.height;

            if (style['icon-width'] || style['icon-height']){
                if (style['icon-width']) {
                    w = style['icon-width'];
                    h = img.height * w / img.width;
                }
                if (style['icon-height']) {
                    h = style['icon-height'];
                    if (!style['icon-width']) {
                        w = img.width * h / img.height;
                    }
                }
            }
            if ((style['allow-overlap'] !== 'true') &&
                    collides.checkPointWH(point, w, h, feature.kothicId)) {
                return;
            }
        }

        var text = String(style.text).trim();

        if (renderText && text) {
            Kothic.style.setStyles(ctx, {
                lineWidth: style['text-halo-radius'] * 2,
                font: Kothic.style.getFontString(style['font-family'], style['font-size'], style)
            });

            var halo = (style.hasOwnProperty('text-halo-radius'));

            Kothic.style.setStyles(ctx, {
                fillStyle: style['text-color'] || '#000000',
                strokeStyle: style['text-halo-color'] || '#ffffff',
                globalAlpha: style['text-opacity'] || style.opacity || 1,
                textAlign: 'center',
                textBaseline: 'middle'
            });

            if (style['text-transform'] === 'uppercase')
                text = text.toUpperCase();
            else if (style['text-transform'] === 'lowercase')
                text = text.toLowerCase();
            else if (style['text-transform'] === 'capitalize')
                text = text.replace(/(^|\s)\S/g, function(ch) { return ch.toUpperCase(); });

            if (feature.type === 'Polygon' || feature.type === 'Point') {
                var textWidth = ctx.measureText(text).width,
                        letterWidth = textWidth / text.length,
                        collisionWidth = textWidth,
                        collisionHeight = letterWidth * 2.5,
                        offset = style['text-offset'] || 0;

                if ((style['text-allow-overlap'] !== 'true') &&
                        collides.checkPointWH([point[0], point[1] + offset], collisionWidth, collisionHeight, feature.kothicId)) {
                    return;
                }

                if (halo) {
                    ctx.strokeText(text, point[0], point[1] + offset);
                }
                ctx.fillText(text, point[0], point[1] + offset);

                var padding = style['-x-kot-min-distance'] || 20;
                collides.addPointWH([point[0], point[1] + offset], collisionWidth, collisionHeight, padding, feature.kothicId);

            } else if (feature.type === 'LineString') {

                var points = Kothic.geom.transformPoints(feature.coordinates, ws, hs);
                Kothic.textOnPath(ctx, points, text, halo, collides);
            }
        }

        if (renderIcon) {
            ctx.drawImage(img,
                    Math.floor(point[0] - w / 2),
                    Math.floor(point[1] - h / 2), w, h);

            var padding2 = parseFloat(style['-x-kot-min-distance']) || 0;
            collides.addPointWH(point, w, h, padding2, feature.kothicId);
        }
    }
};

var MapCSS = {
    styles: {},
    availableStyles: [],
    images: {},
    locales: [],
    presence_tags: [],
    value_tags: [],
    cache: {},
    debug: {hit: 0, miss: 0},
    renderQueue: [],
    imagesLoaded: false,

    onError: function () {
    },

    onImagesLoad: function () {
        MapCSS.imagesLoaded = true;
        MapCSS.renderQueue.forEach(function(renderCall) {
            renderCall();
        });
        MapCSS.renderQueue = [];
    },

    /**
     * Incalidate styles cache
     */
    invalidateCache: function () {
        this.cache = {};
    },

    e_min: function (/*...*/) {
        return Math.min.apply(null, arguments);
    },

    e_max: function (/*...*/) {
        return Math.max.apply(null, arguments);
    },

    e_any: function (/*...*/) {
        var i;

        for (i = 0; i < arguments.length; i++) {
            if (typeof(arguments[i]) !== 'undefined' && arguments[i] !== '') {
                return arguments[i];
            }
        }

        return '';
    },

    e_num: function (arg) {
        if (!isNaN(parseFloat(arg))) {
            return parseFloat(arg);
        } else {
            return '';
        }
    },

    e_str: function (arg) {
        return arg;
    },

    e_int: function (arg) {
        return parseInt(arg, 10);
    },

    e_tag: function (obj, tag) {
        if (obj.hasOwnProperty(tag) && obj[tag] !== null) {
            return tag;
        } else {
            return '';
        }
    },

    e_prop: function (obj, tag) {
        if (obj.hasOwnProperty(tag) && obj[tag] !== null) {
            return obj[tag];
        } else {
            return '';
        }
    },

    e_sqrt: function (arg) {
        return Math.sqrt(arg);
    },

    e_boolean: function (arg, if_exp, else_exp) {
        if (typeof(if_exp) === 'undefined') {
            if_exp = 'true';
        }

        if (typeof(else_exp) === 'undefined') {
            else_exp = 'false';
        }

        if (arg === '0' || arg === 'false' || arg === '') {
            return else_exp;
        } else {
            return if_exp;
        }
    },

    e_metric: function (arg) {
        if (/\d\s*mm$/.test(arg)) {
            return 1000 * parseInt(arg, 10);
        } else if (/\d\s*cm$/.test(arg)) {
            return 100 * parseInt(arg, 10);
        } else if (/\d\s*dm$/.test(arg)) {
            return 10 * parseInt(arg, 10);
        } else if (/\d\s*km$/.test(arg)) {
            return 0.001 * parseInt(arg, 10);
        } else if (/\d\s*in$/.test(arg)) {
            return 0.0254 * parseInt(arg, 10);
        } else if (/\d\s*ft$/.test(arg)) {
            return 0.3048 * parseInt(arg, 10);
        } else {
            return parseInt(arg, 10);
        }
    },

    e_zmetric: function (arg) {
        return MapCSS.e_metric(arg);
    },

    e_localize: function (tags, text) {
        var locales = MapCSS.locales, i, tag;

        for (i = 0; i < locales.length; i++) {
            tag = text + ':' + locales[i];
            if (tags[tag]) {
                return tags[tag];
            }
        }

        return tags[text];
    },

    e_join: function () {
        if (arguments.length === 2 && Object.prototype.toString.call(arguments[1]) === '[object Array]') {
            return arguments[1].join(arguments[0]);
        } else {
            var tagString = "";

            for (var i = 1; i < arguments.length; i++)
                tagString = tagString.concat(arguments[0]).concat(arguments[i]);

            return tagString.substr(arguments[0].length);
        }
    },

    e_split: function (sep, text) {
        return text.split(sep);
    },

    e_get: function(arr, index) {
        if (Object.prototype.toString.call(arr) !== '[object Array]')
            return "";

        if (!/^[0-9]+$/.test(index) || index >= arr.length())
            return "";

        return arr[index];
    },

    e_set: function(arr, index, text) {
        if (Object.prototype.toString.call(arr) !== '[object Array]')
            return [];

        if (!/^[0-9]+$/.test(index))
            return [];

        arr[index] = text;

        return arr;
    },

    e_count: function(arr) {
        if (Object.prototype.toString.call(arr) !== '[object Array]')
            return 0;

        return arr.length();
    },

    e_list: function() {
        return arguments;
    },

    e_append: function(lst, v) {
        if (Object.prototype.toString.call(lst) !== '[object Array]')
            return [];

        lst.push(v);

        return lst;
    },

    e_contains: function(lst, v) {
        if (Object.prototype.toString.call(lst) !== '[object Array]')
            return false;

        return (lst.indexOf(v) >= 0);
    },

    e_sort: function(lst) {
        if (Object.prototype.toString.call(lst) !== '[object Array]')
            return [];

        lst.sort();

        return lst;
    },

    e_reverse: function(lst) {
        if (Object.prototype.toString.call(lst) !== '[object Array]')
            return [];

        lst.reverse();

        return lst;
    },

    loadStyle: function (style, restyle, sprite_images, external_images, presence_tags, value_tags) {
        var i;
        sprite_images = sprite_images || {};
        external_images = external_images || [];

        if (presence_tags) {
            for (i = 0; i < presence_tags.length; i++) {
                if (this.presence_tags.indexOf(presence_tags[i]) < 0) {
                    this.presence_tags.push(presence_tags[i]);
                }
            }
        }

        if (value_tags) {
            for (i = 0; i < value_tags.length; i++) {
                if (this.value_tags.indexOf(value_tags[i]) < 0) {
                    this.value_tags.push(value_tags[i]);
                }
            }
        }

        MapCSS.styles[style] = {
            restyle: restyle,
            images: sprite_images,
            external_images: external_images,
            textures: {},
            sprite_loaded: Object.keys(sprite_images).length === 0,
            external_images_loaded: !external_images.length
        };

        MapCSS.availableStyles.push(style);
    },

    /**
     * Call MapCSS.onImagesLoad callback if all sprite and external
     * images was loaded
     */
    _onImagesLoad: function (style) {
        if (MapCSS.styles[style].external_images_loaded &&
                MapCSS.styles[style].sprite_loaded) {
            MapCSS.onImagesLoad();
        }
    },

    preloadSpriteImage: function (style, url) {
        var images = MapCSS.styles[style].images
       delete MapCSS.styles[style].images;

        loadImage(url).then(img => {
            var image;
            for (image in images) {
                if (images.hasOwnProperty(image)) {
                    images[image].sprite = img;
                    MapCSS.images[image] = images[image];
                }
            }
            MapCSS.styles[style].sprite_loaded = true;
            MapCSS._onImagesLoad(style);
        }).catch(MapCSS.onError)
    },

    preloadExternalImages: function (style, urlPrefix) {
        var external_images = MapCSS.styles[style].external_images;
        delete MapCSS.styles[style].external_images;

        urlPrefix = urlPrefix || '';
        var len = external_images.length, loaded = 0, i;

        function loadImage(url) {
            var img = new Image();
            img.onload = function () {
                loaded++;
                MapCSS.images[url] = {
                    sprite: img,
                    height: img.height,
                    width: img.width,
                    offset: 0
                };
                if (loaded === len) {
                    MapCSS.styles[style].external_images_loaded = true;
                    MapCSS._onImagesLoad(style);
                }
            };
            img.onerror = function () {
                loaded++;
                if (loaded === len) {
                    MapCSS.styles[style].external_images_loaded = true;
                    MapCSS._onImagesLoad(style);
                }
            };
            img.src = url;
        }

        for (i = 0; i < len; i++) {
            loadImage(urlPrefix + external_images[i]);
        }
    },

    getImage: function (ref) {
        var img = MapCSS.images[ref];

        if (img && img.sprite) {
            var canvas = createCanvas(img.width, img.height)

            canvas.getContext('2d').drawImage(img.sprite,
                    0, img.offset, img.width, img.height,
                    0, 0, img.width, img.height);

            img = MapCSS.images[ref] = canvas;
        }

        return img;
    },

    getTagKeys: function (tags, zoom, type, selector) {
        var keys = [], i;
        for (i = 0; i < this.presence_tags.length; i++) {
            if (tags.hasOwnProperty(this.presence_tags[i])) {
                keys.push(this.presence_tags[i]);
            }
        }

        for (i = 0; i < this.value_tags.length; i++) {
            if (tags.hasOwnProperty(this.value_tags[i])) {
                keys.push(this.value_tags[i] + ':' + tags[this.value_tags[i]]);
            }
        }

        return [zoom, type, selector, keys.join(':')].join(':');
    },

    restyle: function (styleNames, tags, zoom, type, selector) {
        var i, key = this.getTagKeys(tags, zoom, type, selector), actions = this.cache[key] || {};

        if (!this.cache.hasOwnProperty(key)) {
            this.debug.miss += 1;
            for (i = 0; i < styleNames.length; i++) {
                actions = MapCSS.styles[styleNames[i]].restyle(actions, tags, zoom, type, selector);
            }
            this.cache[key] = actions;
        } else {
            this.debug.hit += 1;
        }

        return actions;
    }
};

Kothic.style = {

    defaultCanvasStyles: {
        strokeStyle: 'rgba(0,0,0,0.5)',
        fillStyle: 'rgba(0,0,0,0.5)',
        lineWidth: 1,
        lineCap: 'round',
        lineJoin: 'round',
        textAlign: 'center',
        textBaseline: 'middle'
    },

    populateLayers: function (features, zoom, styles) {
        var layers = {},
            i, len, feature, layerId, layerStyle;

        var styledFeatures = Kothic.style.styleFeatures(features, zoom, styles);

        for (i = 0, len = styledFeatures.length; i < len; i++) {
            feature = styledFeatures[i];
            layerStyle = feature.style['-x-mapnik-layer'];
            layerId = !layerStyle ? feature.properties.layer || 0 :
                layerStyle === 'top' ? 10000 : -10000;

            layers[layerId] = layers[layerId] || [];
            layers[layerId].push(feature);
        }

        return layers;
    },

    getStyle: function (feature, zoom, styleNames) {
        var shape = feature.type,
            type, selector;
        if (shape === 'LineString' || shape === 'MultiLineString') {
            type = 'way';
            selector = 'line';
        } else if (shape === 'Polygon' || shape === 'MultiPolygon') {
            type = 'way';
            selector = 'area';
        } else if (shape === 'Point' || shape === 'MultiPoint') {
            type = 'node';
            selector = 'node';
        }

        return MapCSS.restyle(styleNames, feature.properties !== null ? feature.properties : [], zoom, type, selector);
    },

    styleFeatures: function (features, zoom, styleNames) {
        var styledFeatures = [],
            i, j, len, feature, style, restyledFeature, k;

        for (i = 0, len = features.length; i < len; i++) {
            feature = features[i];
            style = this.getStyle(feature, zoom, styleNames);

            for (j in style) {
                if (j === 'default') {
                    restyledFeature = feature;
                } else {
                    restyledFeature = {};
                    for (k in feature) {
                        restyledFeature[k] = feature[k];
                    }
                }

                restyledFeature.kothicId = i + 1;
                restyledFeature.style = style[j];
                restyledFeature.zIndex = style[j]['z-index'] || 0;
                restyledFeature.sortKey = (style[j]['fill-color'] || '') + (style[j].color || '');
                styledFeatures.push(restyledFeature);
            }
        }

        styledFeatures.sort(function (a, b) {
            return a.zIndex !== b.zIndex ? a.zIndex - b.zIndex :
                   a.sortKey < b.sortKey ? -1 :
                   a.sortKey > b.sortKey ? 1 : 0;
        });

        return styledFeatures;
    },

    getFontString: function (name, size, st) {
        name = name || '';
        size = size || 9;

        var family = name ? name + ', ' : '';

        name = name.toLowerCase();

        var styles = [];
        if (st['font-style'] === 'italic' || st['font-style'] === 'oblique') {
            styles.push(st['font-style']);
        }
        if (st['font-variant'] === 'small-caps') {
            styles.push(st['font-variant']);
        }
        if (st['font-weight'] === 'bold') {
            styles.push(st['font-weight']);
        }

        styles.push(size + 'px');

        if (name.indexOf('serif') !== -1 && name.indexOf('sans-serif') === -1) {
            family += 'Georgia, serif';
        } else {
            family += '"Helvetica Neue", Arial, Helvetica, sans-serif';
        }
        styles.push(family);

        return styles.join(' ');
    },

    setStyles: function (ctx, styles) {
        var i;
        for (i in styles) {
            if (styles.hasOwnProperty(i)) {
                ctx[i] = styles[i];
            }
        }
    }
};

Kothic.CollisionBuffer = function (height, width) {
    this.buffer = rbush();
    this.height = height;
    this.width = width;
};

Kothic.CollisionBuffer.prototype = {
    addPointWH: function (point, w, h, d, id) {
        this.buffer.insert(this.getBoxFromPoint(point, w, h, d, id));
    },

    addPoints: function (params) {
        var points = [];
        for (var i = 0, len = params.length; i < len; i++) {
            points.push(this.getBoxFromPoint.apply(this, params[i]));
        }
        this.buffer.load(points);
    },

    checkBox: function (b, id) {
        var result = this.buffer.search(b),
            i, len;

        if (b[0] < 0 || b[1] < 0 || b[2] > this.width || b[3] > this.height) { return true; }

        for (i = 0, len = result.length; i < len; i++) {
            // if it's the same object (only different styles), don't detect collision
            if (id !== result[i][4]) {
                return true;
            }
        }

        return false;
    },

    checkPointWH: function (point, w, h, id) {
        return this.checkBox(this.getBoxFromPoint(point, w, h, 0), id);
    },

    getBoxFromPoint: function (point, w, h, d, id) {
        var dx = w / 2 + d,
            dy = h / 2 + d;

        return [
            point[0] - dx,
            point[1] - dy,
            point[0] + dx,
            point[1] + dy,
            id
        ];
    }
};

Kothic.geom = {
    transformPoint: function (point, ws, hs) {
        return [ws * point[0], hs * point[1]];
    },

    transformPoints: function (points, ws, hs) {
        var transformed = [], i, len;
        for (i = 0, len = points.length; i < len; i++) {
            transformed.push(this.transformPoint(points[i], ws, hs));
        }
        return transformed;
    },

    getReprPoint: function (feature) {
        var point, len;
        switch (feature.type) {
        case 'Point':
            point = feature.coordinates;
            break;
        case 'Polygon':
            point = feature.reprpoint;
            break;
        case 'LineString':
            len = Kothic.geom.getPolyLength(feature.coordinates);
            point = Kothic.geom.getAngleAndCoordsAtLength(feature.coordinates, len / 2, 0);
            point = [point[1], point[2]];
            break;
        case 'GeometryCollection':
            //TODO: Disassemble geometry collection
            return;
        case 'MultiPoint':
            //TODO: Disassemble multi point
            return;
        case 'MultiPolygon':
            point = feature.reprpoint;
            break;
        case 'MultiLineString':
            //TODO: Disassemble geometry collection
            return;
        }
        return point;
    },

    getPolyLength: function (points) {
        var pointsLen = points.length,
                c, pc, i,
                dx, dy,
                len = 0;

        for (i = 1; i < pointsLen; i++) {
            c = points[i];
            pc = points[i - 1];
            dx = pc[0] - c[0];
            dy = pc[1] - c[1];
            len += Math.sqrt(dx * dx + dy * dy);
        }
        return len;
    },

    getAngleAndCoordsAtLength: function (points, dist, width) {
        var pointsLen = points.length,
            dx, dy, x, y,
            i, c, pc,
            len = 0,
            segLen = 0,
            angle, partLen, sameseg = true,
            gotxy = false;

        width = width || 0; // by default we think that a letter is 0 px wide

        for (i = 1; i < pointsLen; i++) {
            if (gotxy) {
                sameseg = false;
            }

            c = points[i];
            pc = points[i - 1];

            dx = c[0] - pc[0];
            dy = c[1] - pc[1];
            segLen = Math.sqrt(dx * dx + dy * dy);

            if (!gotxy && len + segLen >= dist) {
                partLen = dist - len;
                x = pc[0] + dx * partLen / segLen;
                y = pc[1] + dy * partLen / segLen;

                gotxy = true;
            }

            if (gotxy && len + segLen >= dist + width) {
                partLen = dist + width - len;
                dx = pc[0] + dx * partLen / segLen;
                dy = pc[1] + dy * partLen / segLen;
                angle = Math.atan2(dy - y, dx - x);

                if (sameseg) {
                    return [angle, x, y, segLen - partLen];
                } else {
                    return [angle, x, y, 0];
                }
            }

            len += segLen;
        }
    }
};

/*
 (c) 2013, Vladimir Agafonkin
 RBush, a JavaScript library for high-performance 2D spatial indexing of points and rectangles.
 https://github.com/mourner/rbush
*/

function rbush(maxEntries, format) {

    // jshint newcap: false, validthis: true
    if (!(this instanceof rbush)) { return new rbush(maxEntries, format); }

    this._maxEntries = Math.max(4, maxEntries || 9);
    this._minEntries = Math.max(2, Math.ceil(this._maxEntries * 0.4));

    this._initFormat(format);

    this.clear();
}

rbush.prototype = {

    search: function (bbox) {

        var node = this.data,
            result = [];

        if (!this._intersects(bbox, node.bbox)) { return result; }

        var nodesToSearch = [],
            i, len, child, childBBox;

        while (node) {
            for (i = 0, len = node.children.length; i < len; i++) {
                child = node.children[i];
                childBBox = node.leaf ? this._toBBox(child) : child.bbox;

                if (this._intersects(bbox, childBBox)) {
                    (node.leaf ? result : nodesToSearch).push(child);
                }
            }

            node = nodesToSearch.pop();
        }

        return result;
    },

    load: function (data) {
        if (!(data && data.length)) { return this; }

        if (data.length < this._minEntries) {
            for (var i = 0, len = data.length; i < len; i++) {
                this.insert(data[i]);
            }
            return this;
        }

        // recursively build the tree with the given data from stratch using OMT algorithm
        var node = this._build(data.slice(), 0);
        this._calcBBoxes(node, true);

        if (!this.data.children.length) {
            // save as is if tree is empty
            this.data = node;

        } else if (this.data.height === node.height) {
            // split root if trees have the same height
            this._splitRoot(this.data, node);

        } else {
            if (this.data.height < node.height) {
                // swap trees if inserted one is bigger
                var tmpNode = this.data;
                this.data = node;
                node = tmpNode;
            }

            // insert the small tree into the large tree at appropriate level
            this._insert(node, this.data.height - node.height - 1, true);
        }

        return this;
    },

    insert: function (item) {
        if (item) {
            this._insert(item, this.data.height - 1);
        }
        return this;
    },

    clear: function () {
        this.data = {
            children: [],
            leaf: true,
            bbox: this._infinite(),
            height: 1
        };
        return this;
    },

    remove: function (item) {
        if (!item) { return this; }

        var node = this.data,
            bbox = this._toBBox(item),
            path = [],
            indexes = [],
            i, parent, index, goingUp;

        // depth-first iterative tree traversal
        while (node || path.length) {

            if (!node) { // go up
                node = path.pop();
                parent = path[path.length - 1];
                i = indexes.pop();
                goingUp = true;
            }

            if (node.leaf) { // check current node
                index = node.children.indexOf(item);

                if (index !== -1) {
                    // item found, remove the item and condense tree upwards
                    node.children.splice(index, 1);
                    path.push(node);
                    this._condense(path);
                    return this;
                }
            }

            if (!goingUp && !node.leaf && this._intersects(bbox, node.bbox)) { // go down
                path.push(node);
                indexes.push(i);
                i = 0;
                parent = node;
                node = node.children[0];

            } else if (parent) { // go right
                i++;
                node = parent.children[i];
                goingUp = false;

            } else { // nothing found
                node = null;
            }
        }

        return this;
    },

    toJSON: function () { return this.data; },

    fromJSON: function (data) {
        this.data = data;
        return this;
    },

    _build: function (items, level, height) {

        var N = items.length,
            M = this._maxEntries;

        if (N <= M) {
            return {
                children: items,
                leaf: true,
                height: 1
            };
        }

        if (!level) {
            // target height of the bulk-loaded tree
            height = Math.ceil(Math.log(N) / Math.log(M));

            // target number of root entries to maximize storage utilization
            M = Math.ceil(N / Math.pow(M, height - 1));

            items.sort(this._compareMinX);
        }

        // TODO eliminate recursion?

        var node = {
            children: [],
            height: height
        };

        var N1 = Math.ceil(N / M) * Math.ceil(Math.sqrt(M)),
            N2 = Math.ceil(N / M),
            compare = level % 2 === 1 ? this._compareMinX : this._compareMinY,
            i, j, slice, sliceLen, childNode;

        // split the items into M mostly square tiles
        for (i = 0; i < N; i += N1) {
            slice = items.slice(i, i + N1).sort(compare);

            for (j = 0, sliceLen = slice.length; j < sliceLen; j += N2) {
                // pack each entry recursively
                childNode = this._build(slice.slice(j, j + N2), level + 1, height - 1);
                node.children.push(childNode);
            }
        }

        return node;
    },

    _chooseSubtree: function (bbox, node, level, path) {

        var i, len, child, targetNode, area, enlargement, minArea, minEnlargement;

        while (true) {
            path.push(node);

            if (node.leaf || path.length - 1 === level) { break; }

            minArea = minEnlargement = Infinity;

            for (i = 0, len = node.children.length; i < len; i++) {
                child = node.children[i];
                area = this._area(child.bbox);
                enlargement = this._enlargedArea(bbox, child.bbox) - area;

                // choose entry with the least area enlargement
                if (enlargement < minEnlargement) {
                    minEnlargement = enlargement;
                    minArea = area < minArea ? area : minArea;
                    targetNode = child;

                } else if (enlargement === minEnlargement) {
                    // otherwise choose one with the smallest area
                    if (area < minArea) {
                        minArea = area;
                        targetNode = child;
                    }
                }
            }

            node = targetNode;
        }

        return node;
    },

    _insert: function (item, level, isNode, root) {

        var bbox = isNode ? item.bbox : this._toBBox(item),
            insertPath = [];

        // find the best node for accommodating the item, saving all nodes along the path too
        var node = this._chooseSubtree(bbox, root || this.data, level, insertPath),
            splitOccured;

        // put the item into the node
        node.children.push(item);
        this._extend(node.bbox, bbox);

        // split on node overflow; propagate upwards if necessary
        do {
            splitOccured = false;
            if (insertPath[level].children.length > this._maxEntries) {
                this._split(insertPath, level);
                splitOccured = true;
                level--;
            }
        } while (level >= 0 && splitOccured);

        // adjust bboxes along the insertion path
        this._adjustParentBBoxes(bbox, insertPath, level);
    },

    // split overflowed node into two
    _split: function (insertPath, level) {

        var node = insertPath[level],
            M = node.children.length,
            m = this._minEntries;

        this._chooseSplitAxis(node, m, M);

        var newNode = {
            children: node.children.splice(this._chooseSplitIndex(node, m, M)),
            height: node.height
        };

        if (node.leaf) {
            newNode.leaf = true;
        }

        this._calcBBoxes(node);
        this._calcBBoxes(newNode);

        if (level) {
            insertPath[level - 1].children.push(newNode);
        } else {
            this._splitRoot(node, newNode);
        }
    },

    _splitRoot: function (node, newNode) {
        // split root node
        this.data = {};
        this.data.children = [node, newNode];
        this.data.height = node.height + 1;
        this._calcBBoxes(this.data);
    },

    _chooseSplitIndex: function (node, m, M) {

        var i, bbox1, bbox2, overlap, area, minOverlap, minArea, index;

        minOverlap = minArea = Infinity;

        for (i = m; i <= M - m; i++) {
            bbox1 = this._distBBox(node, 0, i);
            bbox2 = this._distBBox(node, i, M);

            overlap = this._intersectionArea(bbox1, bbox2);
            area = this._area(bbox1) + this._area(bbox2);

            // choose distribution with minimum overlap
            if (overlap < minOverlap) {
                minOverlap = overlap;
                index = i;

                minArea = area < minArea ? area : minArea;

            } else if (overlap === minOverlap) {
                // otherwise choose distribution with minimum area
                if (area < minArea) {
                    minArea = area;
                    index = i;
                }
            }
        }

        return index;
    },

    // sorts node children by the best axis for split
    _chooseSplitAxis: function (node, m, M) {

        var compareMinX = node.leaf ? this._compareMinX : this._compareNodeMinX,
            compareMinY = node.leaf ? this._compareMinY : this._compareNodeMinY,
            xMargin = this._allDistMargin(node, m, M, compareMinX),
            yMargin = this._allDistMargin(node, m, M, compareMinY);

        // if total distributions margin value is minimal for x, sort by minX,
        // otherwise it's already sorted by minY

        if (xMargin < yMargin) {
            node.children.sort(compareMinX);
        }
    },

    // total margin of all possible split distributions where each node is at least m full
    _allDistMargin: function (node, m, M, compare) {

        node.children.sort(compare);

        var leftBBox = this._distBBox(node, 0, m),
            rightBBox = this._distBBox(node, M - m, M),
            margin = this._margin(leftBBox) + this._margin(rightBBox),
            i, child;

        for (i = m; i < M - m; i++) {
            child = node.children[i];
            this._extend(leftBBox, node.leaf ? this._toBBox(child) : child.bbox);
            margin += this._margin(leftBBox);
        }

        for (i = M - m - 1; i >= 0; i--) {
            child = node.children[i];
            this._extend(rightBBox, node.leaf ? this._toBBox(child) : child.bbox);
            margin += this._margin(rightBBox);
        }

        return margin;
    },

    // min bounding rectangle of node children from k to p-1
    _distBBox: function (node, k, p) {
        var bbox = this._infinite();

        for (var i = k, child; i < p; i++) {
            child = node.children[i];
            this._extend(bbox, node.leaf ? this._toBBox(child) : child.bbox);
        }

        return bbox;
    },

    _calcBBoxes: function (node, recursive) {
        // TODO eliminate recursion
        node.bbox = this._infinite();

        for (var i = 0, len = node.children.length, child; i < len; i++) {
            child = node.children[i];

            if (node.leaf) {
                this._extend(node.bbox, this._toBBox(child));
            } else {
                if (recursive) {
                    this._calcBBoxes(child, recursive);
                }
                this._extend(node.bbox, child.bbox);
            }
        }
    },

    _adjustParentBBoxes: function (bbox, path, level) {
        // adjust bboxes along the given tree path
        for (var i = level; i >= 0; i--) {
            this._extend(path[i].bbox, bbox);
        }
    },

    _condense: function (path) {
        // go through the path, removing empty nodes and updating bboxes
        for (var i = path.length - 1, parent; i >= 0; i--) {
            if (i > 0 && path[i].children.length === 0) {
                parent = path[i - 1].children;
                parent.splice(parent.indexOf(path[i]), 1);
            } else {
                this._calcBBoxes(path[i]);
            }
        }
    },

    _intersects: function (a, b) {
        return b[0] <= a[2] &&
               b[1] <= a[3] &&
               b[2] >= a[0] &&
               b[3] >= a[1];
    },

    _extend: function (a, b) {
        a[0] = Math.min(a[0], b[0]);
        a[1] = Math.min(a[1], b[1]);
        a[2] = Math.max(a[2], b[2]);
        a[3] = Math.max(a[3], b[3]);
        return a;
    },

    _area:   function (a) { return (a[2] - a[0]) * (a[3] - a[1]); },
    _margin: function (a) { return (a[2] - a[0]) + (a[3] - a[1]); },

    _enlargedArea: function (a, b) {
        return (Math.max(b[2], a[2]) - Math.min(b[0], a[0])) *
               (Math.max(b[3], a[3]) - Math.min(b[1], a[1]));
    },

    _intersectionArea: function (a, b) {
        var minX = Math.max(a[0], b[0]),
            minY = Math.max(a[1], b[1]),
            maxX = Math.min(a[2], b[2]),
            maxY = Math.min(a[3], b[3]);

        return Math.max(0, maxX - minX) *
               Math.max(0, maxY - minY);
    },

    _infinite: function () { return [Infinity, Infinity, -Infinity, -Infinity]; },

    _compareNodeMinX: function (a, b) { return a.bbox[0] - b.bbox[0]; },
    _compareNodeMinY: function (a, b) { return a.bbox[1] - b.bbox[1]; },

    _initFormat: function (format) {
        // data format (minX, minY, maxX, maxY accessors)
        format = format || ['[0]', '[1]', '[2]', '[3]'];

        // uses eval-type function compilation instead of just accepting a toBBox function
        // because the algorithms are very sensitive to sorting functions performance,
        // so they should be dead simple and without inner calls

        // jshint evil: true

        var compareArr = ['return a', ' - b', ';'];

        this._compareMinX = new Function('a', 'b', compareArr.join(format[0]));
        this._compareMinY = new Function('a', 'b', compareArr.join(format[1]));

        this._toBBox = new Function('a', 'return [a' + format.join(', a') + '];');
    }
};

if (typeof module !== 'undefined') {
    module.exports = {
        Kothic,
        MapCSS
    }
}