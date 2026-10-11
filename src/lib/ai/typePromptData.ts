import type { TypePromptSpec } from './typePromptSpec';

/**
 * Per-Type prompt specifications for all 20 canonical inventory Types.
 * Unified Types (11 Oct 2026):
 *   - tower-lamp -> floor-lamp
 *   - luminary -> wall-panel
 */
export const TYPE_PROMPT_SPECS: readonly TypePromptSpec[] = [
    // 1. Pendant
    {
        typeId: 'pendant',
        noun: 'Pendant',
        nounPlural: 'Pendants',
        descriptionNoun: 'Luminary',
        lit: true,
        shopifyType: 'Home Decor > Pendant Lights',
        title: {
            pattern: '{Form} {Colour} {Material} Pendant Light Fixture',
            examples: [
                'Cylinder Green Talan Onyx Pendant Light Fixture',
                'Squared Cristaline Gray Onyx Pendant Light Fixture',
                'Cylinder Tehuacan Amber Onyx Pendant Light Fixture',
            ],
            mustInclude: ['form', 'colour', 'material', 'type'],
        },
        description: {
            angle: 'How it hangs as a suspended light fixture and how the illuminated stone column diffuses light downward and outward.',
            structure: [
                'One opening sentence: identify as a suspended stone luminary with its material, variety, and primary colour.',
                'One sentence describing the cylindrical or squared column form and exact height and diameter from the record.',
                'Two to three bullet points detailing ceiling canopy fitting, ambient light diffusion through the carved stone, and cord clearance.',
                'One closing sentence highlighting illumination over kitchen islands, dining bars, or entryway drop points.',
            ],
            maxWords: 90,
            facts: ['dimensions', 'form', 'material', 'colour', 'variety', 'finish'],
            useCases: [
                'Suspended above a kitchen island in a sequence of two or three',
                'Single drop pendant over an intimate corner bistro table',
                'Accent lighting over a dry bar or tasting counter',
                'Overhead focal point in an entryway or stair landing',
            ],
        },
        colours: {
            max: 3,
            note: 'Dominant colour is read on the illuminated outer column body under ambient or transmitted light.',
        },
        forbidden: [
            'lamp',
            'lamps',
            'tabletop placement',
            'floor standing',
            'recessed fixture',
            'cordless operation',
        ],
        notes: 'Suspended lighting fixture described strictly as Luminary in body copy. Verify cord drop and canopy hardware match record.',
    },

    // 2. Table Lamp
    {
        typeId: 'table-lamp',
        noun: 'Table Lamp',
        nounPlural: 'Table Lamps',
        descriptionNoun: 'Luminary',
        lit: true,
        shopifyType: 'Home Decor > Table Lamps',
        title: {
            pattern: '{Form} {Colour} {Material} Table Luminary',
            examples: [
                'Squared Open Top Green Talan Onyx Table Luminary',
                'Cylinder Tehuacan Amber Onyx Table Luminary',
                'Cube Cristaline Gray Onyx Accent Table Luminary',
            ],
            mustInclude: ['form', 'colour', 'material', 'type'],
        },
        description: {
            angle: 'How it stands on a flat surface and casts warm ambient illumination through solid translucent stone walls.',
            structure: [
                'One opening sentence: describe the standing stone luminary with its verified stone variety and dominant color.',
                'One sentence stating physical dimensions and form geometry including open or closed top if specified.',
                'Two to three bullet points outlining internal socket fitting, surface stability, and light transmission through the stone walls.',
                'One closing sentence presenting bedside, credenza, or desk placement.',
            ],
            maxWords: 95,
            facts: ['dimensions', 'form', 'top', 'material', 'colour', 'variety', 'finish'],
            useCases: [
                'Bedside nightstand for soft evening reading illumination',
                'Living room credenza or console table accent light',
                'Executive desk corner for warm ambient stone lighting',
                'Bookshelf display shelf adding depth and evening warmth',
            ],
        },
        colours: {
            max: 3,
            note: 'Dominant colour is observed on the exterior polished vertical stone faces.',
        },
        forbidden: [
            'lamp',
            'lamps',
            'ceiling mounted',
            'outdoor weatherproofing',
            'suspended fixture',
            'chandelier',
        ],
        notes: 'Client binding rule: never use the word lamp in description copy; always describe as Luminary.',
    },

    // 3. Floor Lamp
    {
        typeId: 'floor-lamp',
        noun: 'Floor Lamp',
        nounPlural: 'Floor Lamps',
        descriptionNoun: 'Luminary',
        lit: true,
        shopifyType: 'Home Decor > Floor Lamps',
        title: {
            pattern: '{Form} {Colour} {Material} Floor Luminary',
            examples: [
                'Squared Purple Green Fluorite Tall Floor Luminary',
                'Squared Open Top Red Pyramid Onyx Floor Luminary',
                'Squared Green Talan Onyx Tower Floor Luminary',
            ],
            mustInclude: ['form', 'colour', 'material', 'type'],
        },
        description: {
            angle: 'How this towering monolith anchors a room perimeter or corner while projecting a tall column of illuminated translucent stone.',
            structure: [
                'One opening sentence: identify as a freestanding tall floor luminary with its stone variety and color tone.',
                'One sentence reporting total height, footprint dimensions, and top aperture construction.',
                'Two to three bullet points covering floor base stability, vertical light diffusion, and internal electrical assembly.',
                'One closing sentence featuring architectural placement in living rooms, entry halls, or lounges.',
            ],
            maxWords: 100,
            facts: ['dimensions', 'form', 'top', 'material', 'colour', 'variety', 'finish'],
            useCases: [
                'Living room corner casting vertical ambient light against adjacent walls',
                'Grand foyer or entryway welcoming guests with full-height illumination',
                'Lounge or library flanking a reading chair or sofa',
                'Commercial reception area or executive suite corner column',
            ],
        },
        colours: {
            max: 3,
            note: 'Dominant colour is observed across the full vertical length of the standing column panels.',
        },
        forbidden: [
            'lamp',
            'lamps',
            'tabletop placement',
            'desktop light',
            'hanging fixture',
            'lightweight',
        ],
        notes: 'Tower Lamp is unified into Floor Lamp (owner decision, 11 Oct 2026). Never use the word lamp in description copy; describe as Luminary.',
    },

    // 4. Bowl
    {
        typeId: 'bowl',
        noun: 'Bowl',
        nounPlural: 'Bowls',
        descriptionNoun: null,
        lit: false,
        shopifyType: 'Home Decor > Decorative Bowls',
        title: {
            pattern: '{Size} {Colour} {Material} Decorative Bowl',
            examples: [
                'Medium Aqua Serpentine Onyx Decorative Bowl',
                'Large Blue Argentina Onyx Decorative Bowl',
                'Small White Amber Tehuacan Onyx Decorative Bowl',
            ],
            mustInclude: ['size', 'colour', 'material', 'type'],
        },
        description: {
            angle: 'How its carved rim, basin depth, and natural stone veining function as a tabletop centerpiece or decorative vessel.',
            structure: [
                'One opening sentence: present the decorative carved stone bowl with stone variety and primary coloration.',
                'One sentence stating recorded diameter, rim depth, and size tier.',
                'Two to three bullet points highlighting rim contour, interior polished hollow, and solid stone base stability.',
                'One closing sentence detailing dining table, coffee table, or credenza display.',
            ],
            maxWords: 85,
            facts: ['dimensions', 'size', 'material', 'colour', 'variety', 'finish'],
            useCases: [
                'Dining table centerpiece holding decorative spheres or botanicals',
                'Coffee table statement piece displaying natural mineral banding',
                'Entryway console catchall for daily essentials or decorative display',
                'Kitchen island accent bowl for dry organic display',
            ],
        },
        colours: {
            max: 3,
            note: 'Dominant colour is read across the interior carved basin and exterior polished bowl walls.',
        },
        forbidden: [
            'light',
            'lit',
            'luminary',
            'illumination',
            'glow',
            'inner glow',
            'translucency',
            'lamp',
            'food safe',
            'dishwasher safe',
            'microwave safe',
        ],
        notes: 'Bowls are unlit decorative stone vessels. Never mention light passing through stone, inner glow, or kitchen food certification.',
    },

    // 5. Canoe
    {
        typeId: 'canoe',
        noun: 'Canoe',
        nounPlural: 'Canoes',
        descriptionNoun: null,
        lit: false,
        shopifyType: 'Home Decor > Decorative Trays',
        title: {
            pattern: '{Size} {Colour} {Material} Canoe Decorative Tray',
            examples: [
                'Medium Pearlescent Onyx Canoe Decorative Tray',
                'Large Nacar White Onyx Elongated Canoe Tray',
                'Small White Amber Onyx Canoe Centerpiece Tray',
            ],
            mustInclude: ['size', 'colour', 'material', 'type'],
        },
        description: {
            angle: 'How its elongated, boat-like silhouette stretches across a long surface to serve as an expansive centerpiece tray.',
            structure: [
                'One opening sentence: identify as an elongated canoe vessel tray carved from solid stone with stone variety and color.',
                'One sentence detailing length, width, and low-profile height from the record.',
                'Two to three bullet points noting tapered bow contours, shallow scooped basin, and stable base.',
                'One closing sentence describing placement on long dining tables, boardroom surfaces, or buffet consoles.',
            ],
            maxWords: 85,
            facts: ['dimensions', 'size', 'material', 'colour', 'variety', 'finish'],
            useCases: [
                'Long rectangular dining table centerpiece running along the center runner',
                'Executive boardroom conference table decorative linear accent',
                'Living room oversized ottoman or low coffee table focal point',
                'Dining room sideboard or buffet credenza display tray',
            ],
        },
        colours: {
            max: 2,
            note: 'Dominant colour is read along the elongated hollow basin floor and outer tapered flanks.',
        },
        forbidden: [
            'light',
            'lit',
            'luminary',
            'glow',
            'inner glow',
            'lamp',
            'water tight',
            'floating',
            'seaworthy',
            'food contact certified',
        ],
        notes: 'Standing owner rule: canoes must always be classified under Home Decor > Decorative Trays. Unlit vessel.',
    },

    // 6. Plate
    {
        typeId: 'plate',
        noun: 'Plate',
        nounPlural: 'Plates',
        descriptionNoun: null,
        lit: false,
        shopifyType: 'Home Decor > Decorative Plates',
        title: {
            pattern: '{Size} {Colour} {Material} Decorative Plate',
            examples: [
                'Large Pearlescent Onyx Decorative Stone Plate',
                'Medium White Amber Onyx Decorative Wall Plate',
                'Large Cristaline Gray Onyx Display Plate',
            ],
            mustInclude: ['size', 'colour', 'material', 'type'],
        },
        description: {
            angle: 'How its wide, shallow circular plane presents the stone cross-sectional mineral grain either lying flat or upright in a stand.',
            structure: [
                'One opening sentence: introduce the shallow carved stone plate with its material variety and coloration.',
                'One sentence stating plate diameter and edge profile thickness.',
                'Two to three bullet points on polished planar surface, beveled outer lip, and display stand compatibility.',
                'One closing sentence highlighting shelf easel display or flat tabletop accent.',
            ],
            maxWords: 75,
            facts: ['dimensions', 'size', 'material', 'colour', 'variety', 'finish'],
            useCases: [
                'Bookcase or vitrine display resting on an upright decorative easel',
                'Console table flat tray for keys and decorative trinkets',
                'Fireplace mantel vertical display showcasing stone rings',
                'Low cocktail table flat center decorative platter',
            ],
        },
        colours: {
            max: 2,
            note: 'Dominant colour is evaluated on the expansive upper face of the plate disc.',
        },
        forbidden: [
            'light',
            'lit',
            'luminary',
            'glow',
            'inner glow',
            'eating dish',
            'dishwasher safe',
            'dinnerware',
            'microwave safe',
        ],
        notes: 'Decorative stone plate intended for display; not food-grade tableware.',
    },

    // 7. Basin
    {
        typeId: 'basin',
        noun: 'Basin',
        nounPlural: 'Basins',
        descriptionNoun: null,
        lit: false,
        shopifyType: 'Home Decor > Sinks',
        title: {
            pattern: '{Colour} {Material} Vessel Sink Basin',
            examples: [
                'Gray Concrete Countertop Vessel Sink Basin',
                'Beige Cast Concrete Bathroom Vessel Sink Basin',
                'Black Concrete Vanity Countertop Vessel Basin',
            ],
            mustInclude: ['colour', 'material', 'type'],
        },
        description: {
            angle: 'How this sculpted architectural vessel mounts onto a vanity counter to serve as a functional, tactile wash basin.',
            structure: [
                'One opening sentence: identify as an above-counter vessel sink basin with its material and tone.',
                'One sentence providing basin exterior dimensions, bowl depth, and drain aperture position.',
                'Two to three bullet points addressing interior drainage slope, sealed surface protection, and standard plumbing compatibility.',
                'One closing sentence suggesting master bathroom, powder room, or spa vanity installation.',
            ],
            maxWords: 85,
            facts: ['dimensions', 'material', 'colour', 'finish'],
            useCases: [
                'Powder room vanity countertop as a sculptural wash basin',
                'Master bathroom ensuite on a floating timber or stone counter',
                'Boutique hospitality restroom adding architectural substance',
                'Spa retreat washstation complementing minimalist fixtures',
            ],
        },
        colours: {
            max: 2,
            note: 'Dominant colour is read across the interior concave bowl and exterior perimeter walls.',
        },
        forbidden: [
            'light',
            'lit',
            'luminary',
            'glow',
            'inner glow',
            'faucet included',
            'plumbing kit included',
            'client name',
        ],
        notes: 'Personal client commission names must never appear in customer copy. Sinks are unlit plumbing fixtures.',
    },

    // 8. Rock
    {
        typeId: 'rock',
        noun: 'Rock',
        nounPlural: 'Rocks',
        descriptionNoun: null,
        lit: false,
        shopifyType: 'Home Decor > Sculptures',
        title: {
            pattern: '{Form} {Colour} {Material} Natural Decorative Rock',
            examples: [
                'Boulder Orange Cosmic Onyx Natural Decorative Rock',
                'Free Form Tehuacan Onyx Natural Decorative Rock',
                'Boulder Green Talan Onyx Landscape Accent Rock',
            ],
            mustInclude: ['form', 'colour', 'material', 'type'],
        },
        description: {
            angle: 'How this raw, uncarved natural stone monolith showcases raw quarry textures and organic geological crust.',
            structure: [
                'One opening sentence: introduce as a natural uncarved stone rock formation with its mineral variety and coloration.',
                'One sentence stating height, width, and boulder mass from the inventory record.',
                'Two to three bullet points noting natural rough-hewn exterior, organic weathering, and freestanding stability.',
                'One closing sentence recommending indoor sculptural installation or landscape garden placement.',
            ],
            maxWords: 80,
            facts: ['dimensions', 'form', 'material', 'colour', 'variety'],
            useCases: [
                'Indoor atrium or interior courtyard geological centerpiece',
                'Sculptural floor anchor in a minimalist modern living room',
                'Zen garden or xeriscape landscape rock accent',
                'Covered patio entrance flanking double doorway threshold',
            ],
        },
        colours: {
            max: 3,
            note: 'Dominant colour is read on the primary mineral face and exposed geological striations.',
        },
        forbidden: [
            'carved',
            'hand-carved',
            'sculpted',
            'turned',
            'lit',
            'light',
            'luminary',
            'glow',
            'fountain pump',
            'water basin',
        ],
        notes: 'Natural uncarved stone rocks must never be described as carved or sculpted. Fountains catalogued as rocks belong to fountain type.',
    },

    // 9. Fountain
    {
        typeId: 'fountain',
        noun: 'Fountain',
        nounPlural: 'Fountains',
        descriptionNoun: null,
        lit: false,
        shopifyType: 'Outdoor Decor > Fountains',
        title: {
            pattern: '{Form} {Colour} {Material} Water Fountain',
            examples: [
                'Boulder Green Talan Onyx Natural Water Fountain',
                'S-Shaped Yellow Travertine Outdoor Water Fountain',
                'Sphere Concrete Architectural Outdoor Water Fountain',
            ],
            mustInclude: ['form', 'colour', 'material', 'type'],
        },
        description: {
            angle: 'How the drilled and sculpted stone body directs water flow over textured natural stone surfaces for acoustic and visual serenity.',
            structure: [
                'One opening sentence: present the stone water fountain feature with its material and color palette.',
                'One sentence listing overall height, reservoir width, and sculpted form geometry.',
                'Two to three bullet points covering internal water core drilling, cascading surface textures, and basin reservoir seating.',
                'One closing sentence suggesting courtyard, patio terrace, or garden sanctuary placement.',
            ],
            maxWords: 85,
            facts: ['dimensions', 'form', 'material', 'colour', 'variety', 'finish'],
            useCases: [
                'Outdoor garden patio creating soothing cascading water sounds',
                'Courtyard focal point centered among lush landscape foliage',
                'Interior atrium water feature bringing natural elements indoors',
                'Terrace pool deck accent offering visual and acoustic serenity',
            ],
        },
        colours: {
            max: 3,
            note: 'Dominant colour is evaluated on the wet or polished surface of the water-channelling stone face.',
        },
        forbidden: [
            'pump included',
            'pump provided',
            'lit',
            'luminary',
            'glow',
            'indoor plumbing kit',
            'electrical cords included',
        ],
        notes: 'Do not promise a pump, motor, or specific water flow rate unless explicitly documented in the inventory record.',
    },

    // 10. Sculpture
    {
        typeId: 'sculpture',
        noun: 'Sculpture',
        nounPlural: 'Sculptures',
        descriptionNoun: null,
        lit: false,
        shopifyType: 'Home Decor > Sculptures',
        title: {
            pattern: '{Colour} {Material} Decorative Art Sculpture',
            examples: [
                'Green Talan Onyx Decorative Art Sculpture',
                'Black Marble Minimalist Standing Art Sculpture',
                'Tehuacan Amber Onyx Carved Standing Sculpture',
            ],
            mustInclude: ['colour', 'material', 'type'],
        },
        description: {
            angle: 'How this three-dimensional artistic carving stands as an expressive freestanding stone work of art.',
            structure: [
                'One opening sentence: identify as a carved freestanding fine art stone sculpture with its material and color tone.',
                'One sentence detailing vertical height, base dimensions, and sculpted contour.',
                'Two to three bullet points outlining three-dimensional profile, polished versus chisel textures, and base balance.',
                'One closing sentence highlighting gallery plinth, fireplace hearth, or living room display.',
            ],
            maxWords: 85,
            facts: ['dimensions', 'material', 'colour', 'variety', 'finish'],
            useCases: [
                'Dedicated pedestal or plinth in an art gallery or formal entry',
                'Living room fireplace hearth or media console sculptural anchor',
                'Executive boardroom or corner office art display',
                'Architectural niche with dedicated accent downlighting',
            ],
        },
        colours: {
            max: 3,
            note: 'Dominant colour is observed across the primary curvilinear faces of the carved composition.',
        },
        forbidden: [
            'light',
            'lit',
            'luminary',
            'glow',
            'inner glow',
            'lamp',
            'ancient relic',
            'museum artifact',
            'heirloom',
        ],
        notes: 'One hairline for every sculpture (owner decision, 11 Oct 2026). Do not invent subject motifs not in the record.',
    },

    // 11. Pillar
    {
        typeId: 'pillar',
        noun: 'Pillar',
        nounPlural: 'Pillars',
        descriptionNoun: null,
        lit: false,
        shopifyType: 'Home Decor > Sculptures',
        title: {
            pattern: '{Form} {Colour} {Material} Pedestal Pillar',
            examples: [
                'Squared Blue Calcite Standing Pedestal Pillar',
                'Cylinder Green Talan Onyx Display Pedestal Pillar',
                'Squared Tehuacan Amber Onyx Display Stand Pillar',
            ],
            mustInclude: ['form', 'colour', 'material', 'type'],
        },
        description: {
            angle: 'How this upright architectural column or pedestal commands vertical presence and elevates displayed art objects.',
            structure: [
                'One opening sentence: present the architectural stone pillar pedestal with stone variety and coloration.',
                'One sentence stating column height, top display surface area, and geometric profile.',
                'Two to three bullet points on load-bearing flat top surface, vertical shaft balance, and solid base footing.',
                'One closing sentence describing use as an art display pedestal, urn stand, or standalone architectural column.',
            ],
            maxWords: 85,
            facts: ['dimensions', 'form', 'material', 'colour', 'variety', 'finish'],
            useCases: [
                'Elevating a bronze sculpture or stone bowl in a grand foyer',
                'Flanking an entryway threshold as architectural stone column',
                'Corner display plinth holding trailing greenery or floral urn',
                'Art gallery pedestal displaying curated three-dimensional works',
            ],
        },
        colours: {
            max: 2,
            note: 'Dominant colour is read along the vertical shaft facings and polished top display plate.',
        },
        forbidden: [
            'light',
            'lit',
            'luminary',
            'glow',
            'inner glow',
            'lamp',
            'structural building column',
            'load bearing house pillar',
        ],
        notes: 'Pillars are freestanding decorative pedestals; do not describe as structural building architecture.',
    },

    // 12. Ball
    {
        typeId: 'ball',
        noun: 'Ball',
        nounPlural: 'Balls',
        descriptionNoun: null,
        lit: false,
        shopifyType: 'Home Decor > Sculptures',
        title: {
            pattern: '{Size} {Colour} {Material} Decorative Sphere Ball',
            examples: [
                'Mini Aqua Onyx Polished Decorative Sphere Ball',
                'Small Green Talan Onyx Decorative Sphere Ball',
                'Mini Pearlescent White Onyx Decorative Stone Ball',
            ],
            mustInclude: ['size', 'colour', 'material', 'type'],
        },
        description: {
            angle: 'How this polished spherical stone orb showcases continuous mineral bands and circular orbital patterns in compact form.',
            structure: [
                'One opening sentence: identify as a polished stone sphere with its stone variety and color.',
                'One sentence stating exact sphere diameter and size tier.',
                'Two bullet points describing continuous hand-polished curvature and mineral concentric banding.',
                'One closing sentence suggesting tray styling, bowl filler, or desktop curio display.',
            ],
            maxWords: 60,
            facts: ['dimensions', 'size', 'material', 'colour', 'variety', 'finish'],
            useCases: [
                'Accenting a decorative stone bowl or tray as an organic filler',
                'Desk paperweight or tactile meditation stone sphere',
                'Bookshelf curio nestled between upright book volumes',
                'Console tray vignette paired with brass or wooden elements',
            ],
        },
        colours: {
            max: 2,
            note: 'Dominant colour is read across the continuous curved circumference of the sphere.',
        },
        forbidden: [
            'light',
            'lit',
            'luminary',
            'glow',
            'inner glow',
            'lamp',
            'sports equipment',
            'toy',
            'juggling ball',
        ],
        notes: 'Compact decorative sphere. Keep description concise under 60 words.',
    },

    // 13. Bag
    {
        typeId: 'bag',
        noun: 'Bag',
        nounPlural: 'Bags',
        descriptionNoun: null,
        lit: false,
        shopifyType: 'Home Decor > Sculptures',
        title: {
            pattern: '{Colour} {Material} Pebble Stones Bag',
            examples: [
                'White Marble Polished Landscape Pebble Stones Bag',
                'Black Marble Tumbled Landscaping Pebble Stones Bag',
                'White Natural Marble Decorative Ground Pebble Bag',
            ],
            mustInclude: ['colour', 'material', 'type'],
        },
        description: {
            angle: 'How these assorted natural tumbled stone pebbles provide tactile ground cover or textural filler for landscape and container planters.',
            structure: [
                'One opening sentence: describe as a sack of sorted natural tumbled stone pebbles with material and color.',
                'One sentence stating pebble grade size and total bag volume from the record.',
                'Two bullet points detailing smooth water-worn texture, natural stone durability, and bulk consistency.',
                'One closing sentence recommending planter topping, water feature bed, or walkway landscaping.',
            ],
            maxWords: 60,
            facts: ['quantity', 'material', 'colour', 'finish'],
            useCases: [
                'Top dressing for potted specimen plants and indoor trees',
                'Substrate gravel for tabletop fountains or garden water features',
                'Vase and terrarium base anchoring botanical stems',
                'Landscape walkway border or dry garden stone bed',
            ],
        },
        colours: {
            max: 2,
            note: 'Dominant colour is read across the general assortment of stone pebbles in the bag.',
        },
        forbidden: [
            'artisanal',
            'craftsmanship',
            'hand-carved',
            'sculpted',
            'light',
            'lit',
            'luminary',
            'glow',
            'single stone',
        ],
        notes: 'Bulk bags of tumbled stones. Never mention individual craftsmanship, hand-carving, or lighting.',
    },

    // 14. Wall Panel
    {
        typeId: 'wall-panel',
        noun: 'Wall Panel',
        nounPlural: 'Wall Panels',
        descriptionNoun: null,
        lit: true,
        shopifyType: 'Home Decor > Wall Panels',
        title: {
            pattern: '{Form} {Colour} {Material} Backlit Wall Panel',
            examples: [
                'Rectangular Emperor Onyx Backlit Wall Panel',
                'Pair Free Form Zebra Onyx Backlit Wall Panel Pair',
                'Rectangular Red Pyramid Onyx Backlit Wall Panel',
            ],
            mustInclude: ['form', 'colour', 'material', 'type'],
        },
        description: {
            angle: 'How this slab of translucent stone mounts flush to a wall and radiates dramatic diffused light when backlit.',
            structure: [
                'One opening sentence: identify as a backlit wall-mounted stone luminary panel with its stone variety and color.',
                'One sentence stating vertical height, width, thickness, and single slab or paired configuration.',
                'Two to three bullet points explaining backlighting illumination diffusion, edge profile finish, and wall mounting cleat.',
                'One closing sentence highlighting residential feature wall, foyer, or commercial hospitality installation.',
            ],
            maxWords: 95,
            facts: ['dimensions', 'form', 'material', 'colour', 'variety', 'finish'],
            useCases: [
                'Dining room or living room backlit feature wall statement',
                'Executive boardroom feature panel behind conference seating',
                'Hospitality reception or hotel lobby illuminated backdrop',
                'Master bedroom wall accent providing ambient evening glow',
            ],
        },
        colours: {
            max: 3,
            note: 'Dominant colour is evaluated across the broad face of the stone slab under direct backlighting.',
        },
        forbidden: [
            'tabletop placement',
            'floor standing',
            'portable',
            'battery operated',
            'painted subject',
            'animal painting',
        ],
        notes: 'Luminary is unified into Wall Panel (owner decision, 11 Oct 2026). Every wall panel is backlit and lit.',
    },

    // 15. Painted Wall Panel
    {
        typeId: 'painted-wall-panel',
        noun: 'Painted Wall Panel',
        nounPlural: 'Painted Wall Panels',
        descriptionNoun: null,
        lit: false,
        shopifyType: 'Home Decor > Wall Panels',
        title: {
            pattern: '{Colour} {Material} Painted Art Wall Panel',
            examples: [
                'White Amber Tehuacan Onyx Painted Art Wall Panel',
                'Yellow Tehuacan Onyx Painted Fine Art Wall Panel',
                'Nacar Pearlescent Onyx Painted Art Wall Panel',
            ],
            mustInclude: ['colour', 'material', 'type'],
        },
        description: {
            angle: 'How the fine painted figurative scene merges with the natural stone veining of a polished wall slab.',
            structure: [
                'One opening sentence: present the painted stone wall art panel with its stone variety and primary coloration.',
                'One sentence providing exact frame or slab height, width, and thickness from the record.',
                'Two to three bullet points detailing artist-painted composition, mineral background integration, and wall hanging hardware.',
                'One closing sentence suggesting gallery wall, study, or living room placement.',
            ],
            maxWords: 85,
            facts: ['dimensions', 'material', 'colour', 'variety', 'finish'],
            useCases: [
                'Great room gallery wall focal point above a wide console',
                'Private study or executive library wall art statement',
                'Lodge or mountain retreat living area above stone mantle',
                'Formal entryway welcoming guests with painted stone art',
            ],
        },
        colours: {
            max: 3,
            note: 'Dominant colour is read from the stone slab background surrounding the painted composition.',
        },
        forbidden: [
            'lit',
            'backlit',
            'luminary',
            'glow',
            'horse',
            'elk',
            'deer',
            'moose',
            'bear',
            'bobcat',
            'animal name',
            'specific creature',
        ],
        notes: 'Rule: forbidden to name the painted animal or figure; focus strictly on the panel as stone fine art. One hairline for all painted panels.',
    },

    // 16. Mirror
    {
        typeId: 'mirror',
        noun: 'Mirror',
        nounPlural: 'Mirrors',
        descriptionNoun: null,
        lit: false,
        shopifyType: 'Home Decor > Mirrors',
        title: {
            pattern: '{Form} {Colour} {Material} Wall Accent Mirror',
            examples: [
                'Rectangular Amber Onyx Framed Wall Accent Mirror',
                'Round Aqua Serpentine Onyx Framed Wall Mirror',
                'Squared Pink Serpentine Onyx Accent Wall Mirror',
            ],
            mustInclude: ['form', 'colour', 'material', 'type'],
        },
        description: {
            angle: 'How the carved natural stone frame surrounds high-clarity mirror glass to deliver functional reflection within organic stone borders.',
            structure: [
                'One opening sentence: identify as a framed wall mirror with its stone frame variety and color.',
                'One sentence giving overall frame dimensions, glass aperture size, and frame geometry.',
                'Two to three bullet points highlighting stone frame edge profile, mirror silvering clarity, and reinforced mounting brackets.',
                'One closing sentence describing powder room vanity, hallway, or bedroom dressing placement.',
            ],
            maxWords: 85,
            facts: ['dimensions', 'form', 'material', 'colour', 'variety', 'finish'],
            useCases: [
                'Powder room vanity mirror above an artisanal wash basin',
                'Entryway hall mirror reflecting light and offering departure check',
                'Master bedroom dressing area as an organic statement mirror',
                'Living room wall reflecting outdoor landscape or window light',
            ],
        },
        colours: {
            max: 3,
            note: 'Dominant colour is evaluated on the perimeter carved stone frame border.',
        },
        forbidden: [
            'light',
            'lit',
            'luminary',
            'glow',
            'inner glow',
            'lamp',
            'unframed',
            'plastic backing',
            'client name',
        ],
        notes: 'Stone-framed mirrors. Disregard client names in legacy records (e.g., Laura McNabb).',
    },

    // 17. Wine Rack
    {
        typeId: 'wine-rack',
        noun: 'Wine Rack',
        nounPlural: 'Wine Racks',
        descriptionNoun: null,
        lit: false,
        shopifyType: 'Home Decor > Wine Racks',
        title: {
            pattern: '{Holes} {Colour} {Material} Rustic Wine Rack',
            examples: [
                '6 Holes Pink Zebra Onyx Freestanding Wine Rack',
                '4 Holes Green Talan Onyx Rustic Counter Wine Rack',
                '8 Holes Orange Onyx Rustic Freestanding Wine Rack',
            ],
            mustInclude: ['colour', 'material', 'type'],
        },
        description: {
            angle: 'How the core-drilled circular bottle openings in solid raw-edge stone store and present wine bottles securely.',
            structure: [
                'One opening sentence: present the rustic stone wine rack stating verified hole count, stone variety, and coloration.',
                'One sentence stating overall height, depth, and footprint from the inventory record.',
                'Two to three bullet points detailing drilled bottle diameter, horizontal resting angle, and solid stone base stability.',
                'One closing sentence suggesting kitchen counter, wet bar credenza, or wine cellar tasting table display.',
            ],
            maxWords: 85,
            facts: ['dimensions', 'holes', 'material', 'colour', 'variety', 'finish'],
            useCases: [
                'Home wet bar credenza displaying curated reserve vintages',
                'Kitchen island countertop holding everyday wine selections',
                'Dedicated wine tasting cellar or tasting room table anchor',
                'Dining room sideboard accent combining storage with raw stone',
            ],
        },
        colours: {
            max: 2,
            note: 'Dominant colour is read on the front drilled face and natural rough stone flanks.',
        },
        forbidden: [
            'light',
            'lit',
            'luminary',
            'glow',
            'refrigerated',
            'temperature controlled',
            'hanging rack',
            'wall mounted rack',
        ],
        notes: 'Never state bottle capacity unless exact hole count is recorded. Wine racks are freestanding raw-edge stone.',
    },

    // 18. Table
    {
        typeId: 'table',
        noun: 'Table',
        nounPlural: 'Tables',
        descriptionNoun: null,
        lit: false,
        shopifyType: 'Home Decor > Tables',
        title: {
            pattern: '{Form} {Colour} {Material} Low Coffee Table',
            examples: [
                'Diamond Cristaline Amber Onyx Low Coffee Table',
                'Round White Ice Onyx Living Room Cocktail Table',
                'Free Form Green Gray Onyx Accent Coffee Table',
            ],
            mustInclude: ['form', 'colour', 'material', 'type'],
        },
        description: {
            angle: 'How its polished stone tabletop and sculptural base ground a seating arrangement with substantial stone presence.',
            structure: [
                'One opening sentence: describe as a solid stone table with stone variety, color palette, and geometric shape.',
                'One sentence stating tabletop dimensions, surface height, and top profile thickness.',
                'Two to three bullet points covering tabletop surface finish, pedestal base support, and floor weight distribution.',
                'One closing sentence featuring living room central lounge, conversation grouping, or salon styling.',
            ],
            maxWords: 85,
            facts: ['dimensions', 'form', 'material', 'colour', 'variety', 'finish'],
            useCases: [
                'Living room seating area central low cocktail table',
                'Formal sitting lounge anchor between facing club armchairs',
                'Executive salon conversation grouping center table',
                'Sunroom or covered veranda lounge seating focal point',
            ],
        },
        colours: {
            max: 3,
            note: 'Dominant colour is read across the polished horizontal tabletop slab.',
        },
        forbidden: [
            'light',
            'lit',
            'luminary',
            'glow',
            'inner glow',
            'folding table',
            'extendable leaf',
            'dining banquet table',
        ],
        notes: 'Low coffee and cocktail tables. Verify whether single-piece monolithic carving or two-piece base and top in record.',
    },

    // 19. Couch
    {
        typeId: 'couch',
        noun: 'Couch',
        nounPlural: 'Couches',
        descriptionNoun: null,
        lit: false,
        shopifyType: 'Home Decor > Sculptures',
        title: {
            pattern: '{Form} {Colour} {Material} Sculptural Stone Couch',
            examples: [
                'V-Shaped Tehuacan Amber Onyx Carved Stone Couch',
                'V-Shaped Brown Cream Onyx Solid Stone Couch',
                'V-Shaped Carved Onyx Architectural Seating Couch',
            ],
            mustInclude: ['form', 'colour', 'material', 'type'],
        },
        description: {
            angle: 'How this monumental architectural stone seating sculpture combines ergonomic form with monolithic carved stone.',
            structure: [
                'One opening sentence: identify as a sculptural stone seating form carved from solid stone with variety and color.',
                'One sentence reporting overall back height, seating width, and depth dimensions from the record.',
                'Two to three bullet points outlining sculpted back contour, monolithic stone stability, and honed seating surface.',
                'One closing sentence suggesting dramatic atrium, luxury spa lounge, or gallery courtyard placement.',
            ],
            maxWords: 85,
            facts: ['dimensions', 'form', 'material', 'colour', 'variety', 'finish'],
            useCases: [
                'Luxury spa sanctuary or bathhouse sculpted stone resting bench',
                'Architectural courtyard or atrium sculptural seating statement',
                'Private gallery space providing monolithic carved seating',
                'Covered veranda loggia offering weather-resistant stone benching',
            ],
        },
        colours: {
            max: 3,
            note: 'Dominant colour is evaluated across the curved carved seat and back rest contours.',
        },
        forbidden: [
            'light',
            'lit',
            'luminary',
            'upholstered',
            'fabric',
            'leather',
            'cushions included',
            'folding sofa bed',
        ],
        notes: 'OWNER decision: Shopify product type mapped to Home Decor > Sculptures because Shopify taxonomy lacks stone seating furniture.',
    },

    // 20. Bar
    {
        typeId: 'bar',
        noun: 'Bar',
        nounPlural: 'Bars',
        descriptionNoun: null,
        lit: false,
        shopifyType: 'Home Decor > Tables',
        title: {
            pattern: '{Form} {Colour} {Material} Freestanding Wet Bar',
            examples: [
                'L-Shaped Aqua Onyx Freestanding Stone Wet Bar',
                'L-Shaped Green Talan Onyx Architectural Bar Counter',
                'L-Shaped Tehuacan Amber Onyx Hospitality Wet Bar',
            ],
            mustInclude: ['form', 'colour', 'material', 'type'],
        },
        description: {
            angle: 'How this freestanding stone service counter anchors entertainment spaces with expansive serving surface and substantial stone presence.',
            structure: [
                'One opening sentence: present the freestanding stone bar counter with its stone variety and color tone.',
                'One sentence stating counter height, length of service return, and depth from the record.',
                'Two to three bullet points describing polished service surface, front facade stone detailing, and bartender prep clearance.',
                'One closing sentence recommending luxury entertainment lounge, outdoor pavilion, or hospitality suite installation.',
            ],
            maxWords: 90,
            facts: ['dimensions', 'form', 'material', 'colour', 'variety', 'finish'],
            useCases: [
                'Executive entertainment lounge or clubroom service focal point',
                'Covered outdoor pavilion or pool cabana cocktail bar counter',
                'Residential game room or home theater hospitality serving station',
                'Boutique hotel tasting room or private dining service bar',
            ],
        },
        colours: {
            max: 2,
            note: 'Dominant colour is observed across the broad upper bar top and primary front stone facing.',
        },
        forbidden: [
            'light',
            'lit',
            'luminary',
            'refrigeration included',
            'barstools included',
            'plumbing taps included',
            'beverage cooler',
        ],
        notes: 'OWNER decision: Shopify product type mapped to Home Decor > Tables for freestanding stone bar counters.',
    },
];
