// UK counties → local news feed. Most use BBC Local RSS; a few use a dedicated
// local paper (Reach plc `?service=rss`). Reach entries also carry a `reach`
// base URL so we can pull a TOWN-specific feed (`/all-about/<town>?service=rss`)
// when the user's location resolves to a town in that county.
const ENG = (slug) => `https://feeds.bbci.co.uk/news/england/${slug}/rss.xml`;
const NAT = (slug) => `https://feeds.bbci.co.uk/news/${slug}/rss.xml`;

// Fallback when a location can't be resolved to a known county.
export const DEFAULT_FEED = 'https://feeds.bbci.co.uk/news/uk/rss.xml';

// KentOnline publishes per-area papers; map Kent towns (slugified) to the closest
// one so the KentOnline half of the feed narrows to the user's town. Unmapped
// towns fall back to KentOnline's county-wide feed.
const KO = (paper) => `https://www.kentonline.co.uk/_api/rss/${paper}_news_feed.xml`;
const KENT_TOWN_FEEDS = {
  ashford: KO('kentish_express'),
  canterbury: KO('kentish_gazette'),
  whitstable: KO('kentish_gazette'),
  'herne-bay': KO('kentish_gazette'),
  dartford: KO('dartford_messenger'),
  gravesend: KO('gravesend_messenger'),
  folkestone: KO('folkestone_express'),
  hythe: KO('folkestone_express'),
  maidstone: KO('kent_messenger'),
  medway: KO('medway_messenger'),
  chatham: KO('medway_messenger'),
  gillingham: KO('medway_messenger'),
  rochester: KO('medway_messenger'),
  strood: KO('medway_messenger'),
  sittingbourne: KO('sittingbourne_messenger'),
  faversham: KO('sittingbourne_messenger'),
  margate: KO('thanet_extra'),
  ramsgate: KO('thanet_extra'),
  broadstairs: KO('thanet_extra'),
  deal: KO('east_kent_mercury'),
  sandwich: KO('east_kent_mercury'),
  dover: KO('east_kent_mercury'),
};

// [id, label, county-wide feed, reachBase?]
const ROWS = [
  ['bedfordshire', 'Bedfordshire', ENG('beds_bucks_and_herts')],
  ['berkshire', 'Berkshire', ENG('berkshire')],
  ['bristol', 'Bristol', 'https://www.bristolpost.co.uk/news/?service=rss', 'https://www.bristolpost.co.uk'],
  ['buckinghamshire', 'Buckinghamshire', ENG('beds_bucks_and_herts')],
  ['cambridgeshire', 'Cambridgeshire', ENG('cambridgeshire')],
  ['cheshire', 'Cheshire', ENG('manchester')],
  ['cornwall', 'Cornwall', 'https://www.cornwalllive.com/news/?service=rss', 'https://www.cornwalllive.com'],
  ['county-durham', 'County Durham', ENG('tees')],
  ['cumbria', 'Cumbria', ENG('cumbria')],
  ['derbyshire', 'Derbyshire', ENG('derbyshire')],
  ['devon', 'Devon', 'https://www.devonlive.com/news/?service=rss', 'https://www.devonlive.com'],
  ['dorset', 'Dorset', ENG('dorset')],
  ['east-riding-of-yorkshire', 'East Riding of Yorkshire', ENG('hull_and_east_yorkshire')],
  ['east-sussex', 'East Sussex', ENG('sussex')],
  ['essex', 'Essex', ENG('essex')],
  ['gloucestershire', 'Gloucestershire', ENG('gloucestershire')],
  ['greater-london', 'Greater London', ENG('london')],
  ['greater-manchester', 'Greater Manchester', 'https://www.manchestereveningnews.co.uk/news/?service=rss', 'https://www.manchestereveningnews.co.uk'],
  ['hampshire', 'Hampshire', ENG('hampshire')],
  ['herefordshire', 'Herefordshire', ENG('hereford_and_worcester')],
  ['hertfordshire', 'Hertfordshire', ENG('beds_bucks_and_herts')],
  ['isle-of-wight', 'Isle of Wight', ENG('hampshire')],
  // Kent pulls from two local outlets — Kent Live (Reach, also drives town feeds)
  // and KentOnline (KM Media). The 5th element is extra outlet feed(s) merged in.
  [
    'kent',
    'Kent',
    'https://www.kentlive.news/news/kent-news/?service=rss',
    'https://www.kentlive.news',
    ['https://www.kentonline.co.uk/_api/rss/kent_online_news_feed.xml'],
    KENT_TOWN_FEEDS,
  ],
  ['lancashire', 'Lancashire', ENG('lancashire')],
  ['leicestershire', 'Leicestershire', ENG('leicester')],
  ['lincolnshire', 'Lincolnshire', ENG('lincolnshire')],
  ['merseyside', 'Merseyside', 'https://www.liverpoolecho.co.uk/news/?service=rss', 'https://www.liverpoolecho.co.uk'],
  ['norfolk', 'Norfolk', ENG('norfolk')],
  ['north-yorkshire', 'North Yorkshire', ENG('north_yorkshire')],
  ['northamptonshire', 'Northamptonshire', ENG('northamptonshire')],
  ['northumberland', 'Northumberland', ENG('tyne')],
  ['nottinghamshire', 'Nottinghamshire', ENG('nottingham')],
  ['oxfordshire', 'Oxfordshire', ENG('oxford')],
  ['rutland', 'Rutland', ENG('leicester')],
  ['shropshire', 'Shropshire', ENG('shropshire')],
  ['somerset', 'Somerset', ENG('somerset')],
  ['south-yorkshire', 'South Yorkshire', ENG('south_yorkshire')],
  ['staffordshire', 'Staffordshire', ENG('stoke_and_staffordshire')],
  ['suffolk', 'Suffolk', ENG('suffolk')],
  ['surrey', 'Surrey', ENG('surrey')],
  ['tyne-and-wear', 'Tyne and Wear', 'https://www.chroniclelive.co.uk/news/?service=rss', 'https://www.chroniclelive.co.uk'],
  ['warwickshire', 'Warwickshire', ENG('coventry_and_warwickshire')],
  ['west-midlands', 'West Midlands', 'https://www.birminghammail.co.uk/news/?service=rss', 'https://www.birminghammail.co.uk'],
  ['west-sussex', 'West Sussex', ENG('sussex')],
  ['west-yorkshire', 'West Yorkshire', ENG('west_yorkshire')],
  ['wiltshire', 'Wiltshire', ENG('wiltshire')],
  ['worcestershire', 'Worcestershire', ENG('hereford_and_worcester')],
  ['scotland', 'Scotland', NAT('scotland')],
  ['wales', 'Wales', NAT('wales')],
  ['northern-ireland', 'Northern Ireland', NAT('northern_ireland')],
];

export const UK_REGIONS = ROWS.reduce((acc, [id, label, feed, reach, extraFeeds, townFeeds]) => {
  acc[id] = { label, feed, reach, extraFeeds: extraFeeds ?? [], townFeeds: townFeeds ?? {} };
  return acc;
}, {});
