const CURATED_SOURCE = 'curated-germany-v1';

const TOPIC_ALIASES = {
  sports: ['sports', 'sport', 'soccer', 'football', 'fussball', 'formula1', 'motorsport'],
  finance: ['finance', 'business', 'money', 'markets', 'wirtschaft', 'boerse', 'economy'],
  news: ['news', 'politics', 'world', 'nachrichten', 'general'],
  tech: ['tech', 'technology', 'digital', 'it', 'software', 'ai', 'ki', 'security'],
  automotive: ['automotive', 'auto', 'cars', 'motoring', 'mobility'],
  lifestyle: ['lifestyle', 'fashion', 'celebrity', 'home', 'living', 'health'],
  cooking: ['cooking', 'food', 'recipe', 'recipes', 'essen', 'cuisine'],
  travel: ['travel', 'tourism', 'reisen', 'holiday', 'vacation'],
};

function p(name, url, topic, options = {}) {
  return {
    name,
    url,
    reason: `Curated Germany ${topic} publisher candidate with display inventory potential`,
    ...options,
  };
}

const GERMANY_CURATED_PUBLISHERS = {
  sports: [
    p('Sport1', 'https://www.sport1.de/', 'sports'),
    p('Ran', 'https://www.ran.de/sports', 'sports'),
    p('Sport.de', 'https://www.sport.de/', 'sports'),
    p('Eurosport DE', 'https://www.eurosport.de/', 'sports'),
    p('Welt Sport', 'https://www.welt.de/sport/', 'sports'),
    p('Focus Sport', 'https://www.focus.de/sport/', 'sports'),
    p('NTV Sport', 'https://www.n-tv.de/sport/', 'sports'),
    p('Motorsport Magazin', 'https://www.motorsport-magazin.com/', 'sports'),
    p('Transfermarkt', 'https://www.transfermarkt.de/', 'sports'),
    p('Sport Bild', 'https://sportbild.bild.de/', 'sports'),
  ],
  finance: [
    p('Manager Magazin', 'https://www.manager-magazin.de/', 'finance'),
    p('Finanzen.net', 'https://www.finanzen.net/', 'finance'),
    p('ARIVA News', 'https://www.ariva.de/news', 'finance'),
    p('FinanzNachrichten', 'https://www.finanznachrichten.de/', 'finance'),
    p('Boersennews', 'https://www.boersennews.de/', 'finance'),
    p('Stock3 News', 'https://stock3.com/news', 'finance'),
    p('Onvista News', 'https://www.onvista.de/news', 'finance'),
    p('Boerse Online', 'https://www.boerse-online.de/', 'finance'),
    p('WirtschaftsWoche', 'https://www.wiwo.de/', 'finance'),
    p('FAZ Finanzen', 'https://www.faz.net/aktuell/finanzen/', 'finance'),
  ],
  news: [
    p('Focus', 'https://www.focus.de/', 'news'),
    p('Merkur', 'https://www.merkur.de/', 'news'),
    p('HNA', 'https://www.hna.de/', 'news'),
    p('BZ Berlin', 'https://www.bz-berlin.de/', 'news'),
    p('Kölner Stadt-Anzeiger', 'https://www.ksta.de/', 'news'),
    p('Stern', 'https://www.stern.de/', 'news'),
    p('n-tv', 'https://www.n-tv.de/', 'news'),
    p('T-Online News', 'https://www.t-online.de/nachrichten/', 'news'),
    p('Die Zeit', 'https://www.zeit.de/', 'news'),
    p('Der Spiegel', 'https://www.spiegel.de/', 'news'),
  ],
  tech: [
    p('CHIP', 'https://www.chip.de/', 'tech'),
    p('t3n', 'https://t3n.de/', 'tech'),
    p('Computer Bild', 'https://www.computerbild.de/', 'tech'),
    p('Netzwelt', 'https://www.netzwelt.de/', 'tech'),
    p('PC-Welt', 'https://www.pcwelt.de/', 'tech'),
    p('WinFuture', 'https://winfuture.de/', 'tech'),
    p('Inside Digital', 'https://www.inside-digital.de/', 'tech'),
    p('Heise', 'https://www.heise.de/', 'tech'),
    p('Basic Thinking', 'https://www.basicthinking.de/blog/', 'tech'),
    p('Golem', 'https://www.golem.de/', 'tech'),
  ],
  automotive: [
    p('Auto Motor und Sport', 'https://www.auto-motor-und-sport.de/', 'automotive'),
    p('Auto Bild', 'https://www.autobild.de/', 'automotive'),
    p('Auto Zeitung', 'https://www.autozeitung.de/', 'automotive'),
    p('Motor Talk', 'https://www.motor-talk.de/', 'automotive'),
    p('Ecomento', 'https://ecomento.de/', 'automotive'),
    p('Tuningblog', 'https://www.tuningblog.eu/', 'automotive'),
    p('Automobilwoche', 'https://www.automobilwoche.de/', 'automotive'),
    p('Promobil', 'https://www.promobil.de/', 'automotive'),
    p('Motorrad Online', 'https://www.motorradonline.de/', 'automotive'),
    p('Motorsport Magazin', 'https://www.motorsport-magazin.com/', 'automotive'),
  ],
  lifestyle: [
    p('Brigitte', 'https://www.brigitte.de/', 'lifestyle'),
    p('Gala', 'https://www.gala.de/', 'lifestyle'),
    p('Men’s Health DE', 'https://www.menshealth.de/', 'lifestyle'),
    p('Schöner Wohnen', 'https://www.schoener-wohnen.de/', 'lifestyle'),
    p('Fit For Fun', 'https://www.fitforfun.de/', 'lifestyle'),
    p('Glamour DE', 'https://www.glamour.de/', 'lifestyle'),
    p('InStyle', 'https://www.instyle.de/', 'lifestyle'),
    p('Freundin', 'https://www.freundin.de/', 'lifestyle'),
    p('Elle DE', 'https://www.elle.de/', 'lifestyle'),
    p('Vogue DE', 'https://www.vogue.de/', 'lifestyle'),
  ],
  cooking: [
    p('Essen und Trinken', 'https://www.essen-und-trinken.de/', 'cooking', { generationProven: true }),
    p('Einfach Backen', 'https://www.einfachbacken.de/', 'cooking', { generationProven: true }),
    p('Wunderweib Rezepte', 'https://www.wunderweib.de/rezepte', 'cooking', { generationProven: true }),
    p('Fit For Fun Rezepte', 'https://www.fitforfun.de/rezepte/', 'cooking', { generationProven: true }),
    p('Focus Ernährung', 'https://www.focus.de/gesundheit/ernaehrung/', 'cooking', { generationProven: true }),
    p('Einfach Kochen', 'https://www.einfachkochen.de/', 'cooking'),
    p('Simply Yummy', 'https://www.simply-yummy.de/', 'cooking'),
    p('Gofeminin Kochen', 'https://www.gofeminin.de/kochen-backen/', 'cooking'),
    p('T-Online Essen & Trinken', 'https://www.t-online.de/leben/essen-und-trinken/', 'cooking'),
    p('Slowly Veggie', 'https://www.slowlyveggie.de/', 'cooking'),
  ],
  travel: [
    p('Travelbook', 'https://www.travelbook.de/', 'travel'),
    p('HolidayCheck Magazin', 'https://www.holidaycheck.de/magazin/', 'travel'),
    p('Reisemagazin Online', 'https://www.reisemagazin-online.com/', 'travel'),
    p('ADAC Reise', 'https://www.adac.de/reise-freizeit/', 'travel'),
    p('Focus Reisen', 'https://www.focus.de/reisen/', 'travel'),
    p('Stern Reise', 'https://www.stern.de/reise/', 'travel'),
    p('Brigitte Reise', 'https://www.brigitte.de/reise/', 'travel'),
    p('Augsburger Allgemeine Reise', 'https://www.augsburger-allgemeine.de/reise/', 'travel'),
    p('DerWesten Reise', 'https://www.derwesten.de/panorama/reise/', 'travel'),
    p('Stuttgarter Zeitung Reise', 'https://www.stuttgarter-zeitung.de/reise', 'travel'),
  ],
};

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveCuratedTopic(topic) {
  const normalized = normalize(topic);
  if (GERMANY_CURATED_PUBLISHERS[normalized]) return normalized;

  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  for (const [canonical, aliases] of Object.entries(TOPIC_ALIASES)) {
    if (tokens.some((token) => canonical === token || aliases.includes(token))) {
      return canonical;
    }
  }

  return null;
}

function getGermanyCuratedPublishers(topic) {
  const curatedTopic = resolveCuratedTopic(topic);
  if (!curatedTopic) {
    return {
      topic: null,
      source: CURATED_SOURCE,
      candidates: [],
    };
  }

  return {
    topic: curatedTopic,
    source: CURATED_SOURCE,
    candidates: GERMANY_CURATED_PUBLISHERS[curatedTopic].map((candidate) => ({ ...candidate })),
  };
}

module.exports = {
  CURATED_SOURCE,
  GERMANY_CURATED_PUBLISHERS,
  getGermanyCuratedPublishers,
  resolveCuratedTopic,
};
