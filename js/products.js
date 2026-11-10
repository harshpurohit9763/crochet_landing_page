window.FINGO = {
  config: {
    // Your number with country code and no plus sign, for example 919876543210.
    // Left empty, WhatsApp asks the customer who to send the message to.
    whatsapp: '',
    instagram: 'https://instagram.com/'
  },
  categories: [
    { id: 'all', label: 'Everything' },
    { id: 'keychains', label: 'Keychains' },
    { id: 'hair', label: 'Hair' },
    { id: 'jewellery', label: 'Jewellery' },
    { id: 'bags', label: 'Bags and baby' },
    { id: 'home', label: 'Home' }
  ],
  // Set price to a number to show it, or leave it null to confirm on WhatsApp.
  products: [
    { id: 'daisy', name: 'Daisy keychain', cat: 'keychains', price: null },
    { id: 'rosebangle', name: 'Rose and moss bangles', cat: 'jewellery', price: null },
    { id: 'cupcake', name: 'Cupcake keychain', cat: 'keychains', price: null },
    { id: 'gajra', name: 'Jasmine gajra', cat: 'hair', price: null },
    { id: 'backpack', name: 'Sunflower backpack', cat: 'bags', price: null },
    { id: 'cherry', name: 'Cherry keychain', cat: 'keychains', price: null },
    { id: 'bow', name: 'Big red bow', cat: 'hair', price: null },
    { id: 'stem', name: 'Forever sunflower stem', cat: 'home', price: null },
    { id: 'icecream', name: 'Ice cream keychain', cat: 'keychains', price: null },
    { id: 'sunbangle', name: 'Sunflower bangles', cat: 'jewellery', price: null },
    { id: 'rose', name: 'Rose keychain', cat: 'keychains', price: null },
    { id: 'bluebow', name: 'Blue braid bow', cat: 'hair', price: null },
    { id: 'curtain', name: 'Sunflower curtain tie', cat: 'home', price: null },
    { id: 'sunflower', name: 'Sunflower keychain', cat: 'keychains', price: null },
    { id: 'bowpink', name: 'Coral bow keychain', cat: 'keychains', price: null },
    { id: 'tulipclip', name: 'Tulip hair clip', cat: 'hair', price: null },
    { id: 'scrunchie', name: 'Jasmine scrunchie', cat: 'hair', price: null },
    { id: 'earrings', name: 'Pink hoop earrings', cat: 'jewellery', price: null },
    { id: 'necklace', name: 'Cowrie shell necklace', cat: 'jewellery', price: null },
    { id: 'tote', name: 'Tote with flower square', cat: 'bags', price: null },
    { id: 'basket', name: 'Rope bag with charms', cat: 'bags', price: null },
    { id: 'frock', name: 'Baby frock', cat: 'bags', price: null },
    { id: 'spiral', name: 'Indigo spiral hanging', cat: 'home', price: null }
  ],
  festive: [
    { id: 'f-diya', name: 'Lotus diya holder', img: 'img/photo/a_diya.webp' },
    { id: 'f-tealight', name: 'Water lily tealights', img: 'img/cut/tealight.webp', sticker: true },
    { id: 'f-bappa1', name: 'Marigold garland for Bappa', img: 'img/photo/a_bappa1.webp' },
    { id: 'f-toran', name: 'Red blossom toran', img: 'img/photo/a_toran.webp' },
    { id: 'f-lotus', name: 'Pink lotus centrepiece', img: 'img/photo/a_lotus.webp' },
    { id: 'f-rose', name: 'Rose garlands', img: 'img/photo/a_rose.webp' },
    { id: 'f-peacock', name: 'Peacock feather hanging', img: 'img/photo/a_peacock.webp' },
    { id: 'f-bappa2', name: 'Orange blossom mala', img: 'img/photo/a_bappa2.webp' },
    { id: 'f-bappa3', name: 'Red flower mala', img: 'img/photo/a_bappa3.webp' }
  ],
  featured: [
    { id: 'cherry', line: 'Cherry on top', c: '#C8102E', t: '#FFE9DC' },
    { id: 'daisy', line: 'Oopsie daisy', c: '#15301C', t: '#FFD84D' },
    { id: 'cupcake', line: 'Sweet tooth', c: '#F58FB4', t: '#4A1230' },
    { id: 'sunflower', line: 'Hello sunshine', c: '#F4A90F', t: '#3C1A08' },
    { id: 'rose', line: 'Rosy days', c: '#A80F4E', t: '#FFD9E6' }
  ],
  pins: [
    { img: 'img/photo/p_bangle.webp', cap: 'Stacked bangles', r: '-4deg', z: 2, col: '1 / span 4', row: '1 / span 9' },
    { img: 'img/photo/p_gajra.webp', cap: 'Jasmine gajra', r: '3deg', z: 3, col: '5 / span 3', row: '2 / span 7' },
    { img: 'img/photo/p_frock.webp', cap: 'Baby frock', r: '-2deg', z: 2, col: '8 / span 5', row: '1 / span 8' },
    { img: 'img/photo/p_bow.webp', cap: 'Blue braid bow', r: '2.5deg', z: 4, col: '2 / span 3', row: '10 / span 7' },
    { img: 'img/photo/p_tote.webp', cap: 'Market tote', r: '-3deg', z: 3, col: '5 / span 4', row: '9 / span 9' },
    { img: 'img/photo/p_tulip.webp', cap: 'Tulip clip', r: '4deg', z: 4, col: '9 / span 4', row: '10 / span 8' }
  ]
};
FINGO.products.forEach(function (p) { p.img = 'img/product/' + p.id + '.webp'; });
FINGO.byId = {};
FINGO.products.concat(FINGO.festive).forEach(function (p) { FINGO.byId[p.id] = p; });
