const rules = {
    'invalid': {
        'amenity': ['parking', 'bench', 'bicycle_parking', 'parking_entrance', 'post_box', 'waste_basket', 'bicycle_rental', 'drinking_water'],
        'leisure': ['garden'],
        'highway': ['service', 'footway', 'bus_stop', 'path'],
        'type': ['route'],
        'power': ['line', 'substation'],
        'information': ['board'],
        'man_made': ['survey_point']
    },
    'invisible': {
        'type': ['route'],
        'amenity': ['parking', 'bench', 'bicycle_parking', 'parking_entrance', 'post_box', 'waste_basket', 'bicycle_rental', 'drinking_water'],
        'leisure': [],
        'highway': [],
        'power': ['line'],
        'information': ['board'],
        'man_made': ['survey_point']
    }
}

function match(tags, property) {
    const types = rules[property]
    for (const key in types) {
        if (key in tags && types[key].includes(tags[key])) {
            return true
        }
    }
    return false
}

module.exports = { match }
