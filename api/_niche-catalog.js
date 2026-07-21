// api/_niche-catalog.js
// Single source of truth for the self-serve signup wizard's business-type
// catalog: id, display label, one-line example (picker card copy), and a
// starter service menu ({name, duration minutes, price string}[]).
//
// The first 6 entries (nails/lashes/hair/brows/spa/barber) are copied
// verbatim from supabase/migrations/002_seed_service_presets.sql so
// existing behaviour for those niches is unchanged. The manual/n8n path
// (add-client.sql, Workflow B2) still calls seed_service_presets() directly
// and does not read this file — this catalog only drives the self-serve
// wizard (start.html + api/signup.js).
//
// 'other' has no preset menu: the wizard starts the services step with one
// blank row and the business's own typed-in category label is sent as the
// niche instead of the literal id 'other'.
//
// Mirrored (presentation-only) as a JS object literal at the top of
// start.html's <script> so the wizard doesn't need a network round-trip to
// render the picker/prefill. Keep the two in sync when editing.

const CATEGORIES = [
  {
    id: 'nails',
    label: 'Nails',
    example: 'Gel, acrylic, manicures',
    services: [
      { name: 'Gel overlay', duration: 75, price: 'R250' },
      { name: 'Acrylic full set', duration: 120, price: 'R350' },
      { name: 'Fills', duration: 75, price: 'R250' },
      { name: 'Manicure', duration: 45, price: 'R180' },
      { name: 'Pedicure', duration: 60, price: 'R220' },
    ],
  },
  {
    id: 'lashes',
    label: 'Lashes',
    example: 'Classic, hybrid, volume sets',
    services: [
      { name: 'Classic set', duration: 120, price: 'R365' },
      { name: 'Hybrid set', duration: 135, price: 'R450' },
      { name: 'Volume set', duration: 150, price: 'R550' },
      { name: 'Lash fill', duration: 75, price: 'R300' },
    ],
  },
  {
    id: 'hair',
    label: 'Hair',
    example: 'Cuts, colour, styling',
    services: [
      { name: 'Cut & style', duration: 60, price: 'R280' },
      { name: 'Colour', duration: 150, price: 'R750' },
      { name: 'Treatment', duration: 45, price: 'R250' },
      { name: 'Blow-wave', duration: 45, price: 'R180' },
    ],
  },
  {
    id: 'brows',
    label: 'Brows',
    example: 'Shaping, tinting, lamination',
    services: [
      { name: 'Shape & tint', duration: 30, price: 'R180' },
      { name: 'Lamination', duration: 60, price: 'R350' },
      { name: 'Microblading', duration: 120, price: 'R1200' },
    ],
  },
  {
    id: 'spa',
    label: 'Spa & beauty',
    example: 'Massage, facials, treatments',
    services: [
      { name: 'Full body massage', duration: 60, price: 'R450' },
      { name: 'Facial', duration: 60, price: 'R400' },
      { name: 'Mani + pedi combo', duration: 105, price: 'R380' },
    ],
  },
  {
    id: 'barber',
    label: 'Barber',
    example: 'Cuts, beard trims',
    services: [
      { name: 'Cut', duration: 30, price: 'R150' },
      { name: 'Cut & beard', duration: 45, price: 'R220' },
      { name: 'Beard trim', duration: 20, price: 'R100' },
    ],
  },
  {
    id: 'makeup',
    label: 'Makeup artist',
    example: 'Events, bridal, everyday glam',
    services: [
      { name: 'Everyday glam', duration: 60, price: 'R350' },
      { name: 'Event / party makeup', duration: 75, price: 'R450' },
      { name: 'Bridal trial', duration: 90, price: 'R650' },
      { name: 'Bridal day-of', duration: 120, price: 'R1200' },
    ],
  },
  {
    id: 'fitness',
    label: 'Fitness & personal training',
    example: '1-on-1 sessions, small classes',
    services: [
      { name: '1-on-1 session', duration: 60, price: 'R350' },
      { name: 'Assessment & program setup', duration: 60, price: 'R400' },
      { name: 'Small group session', duration: 45, price: 'R180' },
      { name: 'Online coaching check-in', duration: 30, price: 'R150' },
    ],
  },
  {
    id: 'cleaning',
    label: 'Cleaning services',
    example: 'Homes, offices, move-outs',
    services: [
      { name: 'Standard home clean', duration: 120, price: 'R450' },
      { name: 'Deep clean', duration: 240, price: 'R850' },
      { name: 'Move-in / move-out clean', duration: 240, price: 'R950' },
      { name: 'Office clean', duration: 120, price: 'R500' },
    ],
  },
  {
    id: 'petgrooming',
    label: 'Pet grooming',
    example: 'Wash, cut, nail trims',
    services: [
      { name: 'Wash & blow-dry', duration: 45, price: 'R200' },
      { name: 'Full groom', duration: 90, price: 'R400' },
      { name: 'Nail trim', duration: 15, price: 'R80' },
      { name: 'De-shed treatment', duration: 60, price: 'R280' },
    ],
  },
  {
    id: 'photography',
    label: 'Photography',
    example: 'Portraits, events, studio shoots',
    services: [
      { name: 'Mini portrait session', duration: 30, price: 'R650' },
      { name: 'Standard session', duration: 60, price: 'R1200' },
      { name: 'Event coverage (per hour)', duration: 60, price: 'R1500' },
      { name: 'Studio family shoot', duration: 90, price: 'R1800' },
    ],
  },
  {
    id: 'tutoring',
    label: 'Tutoring & coaching',
    example: '1-on-1 and group sessions',
    services: [
      { name: 'Single session', duration: 60, price: 'R250' },
      { name: 'Exam prep intensive', duration: 90, price: 'R350' },
      { name: 'Assessment consult', duration: 45, price: 'R200' },
      { name: 'Group study session', duration: 60, price: 'R150' },
    ],
  },
  {
    id: 'other',
    label: 'Something else',
    example: 'Tell us what you do',
    services: [],
  },
];

// `tip` is the one thing we tell this owner to do next, based on what they said
// they wanted. Used on the signup success screen and in the welcome email —
// the goal step is otherwise just a question we never answer.
const GOALS = [
  {
    id: 'more_bookings',
    label: 'Get more bookings',
    tip: 'Put your page link in your Instagram bio and WhatsApp status — that\'s where most first bookings come from.',
  },
  {
    id: 'less_whatsapp',
    label: 'Stop the WhatsApp back-and-forth',
    tip: 'Next time someone asks "what times do you have?", send your page link instead. Bookings land in your dashboard on their own.',
  },
  {
    id: 'fewer_noshows',
    label: 'Cut down no-shows',
    tip: 'Clients get a confirmation email the moment they book — the single biggest thing that keeps them turning up.',
  },
  {
    id: 'look_professional',
    label: 'Look more professional online',
    tip: 'Add your logo and a banner photo under More → Branding in your dashboard. Two minutes, and the page starts feeling like yours.',
  },
];

function findGoal(id) {
  return GOALS.find((g) => g.id === String(id || '').trim()) || null;
}

function findCategory(id) {
  return CATEGORIES.find((c) => c.id === String(id || '').toLowerCase()) || null;
}

module.exports = { CATEGORIES, GOALS, findCategory, findGoal };
